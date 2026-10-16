-- Server-side, exposure-adjusted marketplace trend events and snapshots.
create table if not exists public.marketplace_trend_config (
  id boolean primary key default true check (id),
  event_weights jsonb not null default '{
    "VIEW": 1,
    "LIKE": 2,
    "SAVE": 4,
    "SHARE": 5,
    "ENQUIRY": 8,
    "HIDE": -3,
    "REPORT": -5,
    "CREATION": 0
  }'::jsonb,
  half_life_hours numeric not null default 72 check (half_life_hours > 0),
  smoothing_weight numeric not null default 2 check (smoothing_weight >= 0),
  prior_engagement_rate numeric not null default 0.02 check (prior_engagement_rate >= 0),
  prior_exposures integer not null default 50 check (prior_exposures > 0),
  minimum_impressions integer not null default 20 check (minimum_impressions > 0),
  minimum_unique_engagers integer not null default 5 check (minimum_unique_engagers > 0),
  minimum_popularity_weight numeric not null default 10 check (minimum_popularity_weight >= 0),
  minimum_rating_count integer not null default 5 check (minimum_rating_count > 0),
  minimum_rating_average numeric not null default 4.3 check (minimum_rating_average between 1 and 5),
  event_retention_days integer not null default 180 check (event_retention_days >= 30),
  experiment_version text not null default 'baseline-v1',
  updated_at timestamptz not null default now()
);

insert into public.marketplace_trend_config (id)
values (true)
on conflict (id) do nothing;

drop policy if exists "Discovery events are insertable by authenticated users" on public.discovery_events;
drop policy if exists "Personal discovery events exclude commerce claims" on public.discovery_events;
create policy "Personal discovery events exclude commerce claims"
  on public.discovery_events for insert
  with check (
    user_id = auth.uid()
    and event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'RATING')
  );

alter table public.marketplace_trend_config enable row level security;
revoke all on public.marketplace_trend_config from public, anon, authenticated;
grant all on public.marketplace_trend_config to service_role;

create table if not exists public.marketplace_engagement_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.posts(id) on delete cascade,
  event_type text not null check (event_type in (
    'IMPRESSION', 'VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY',
    'HIDE', 'REPORT', 'CREATION'
  )),
  actor_id uuid references public.profiles(id) on delete cascade,
  session_hash text,
  occurred_at timestamptz not null default now(),
  constraint marketplace_engagement_actor_or_session check (
    actor_id is not null or session_hash is not null
  )
);

create index if not exists marketplace_events_listing_time_idx
  on public.marketplace_engagement_events (listing_id, occurred_at desc);
create index if not exists marketplace_events_type_time_idx
  on public.marketplace_engagement_events (event_type, occurred_at desc);
create index if not exists marketplace_events_session_time_idx
  on public.marketplace_engagement_events (session_hash, occurred_at desc)
  where session_hash is not null;
create index if not exists marketplace_events_actor_time_idx
  on public.marketplace_engagement_events (actor_id, occurred_at desc)
  where actor_id is not null;

alter table public.marketplace_engagement_events enable row level security;
revoke all on public.marketplace_engagement_events from anon, authenticated;
grant all on public.marketplace_engagement_events to service_role;
grant usage, select on sequence public.marketplace_engagement_events_id_seq to service_role;

insert into public.marketplace_engagement_events (listing_id, event_type, actor_id, occurred_at)
select post.id, 'CREATION', post.author_id, post.created_at
from public.posts post
where post.listing_type in ('CLOTHING', 'FABRIC')
  and not exists (
    select 1 from public.marketplace_engagement_events event
    where event.listing_id = post.id and event.event_type = 'CREATION'
  );

create or replace function public.record_marketplace_engagement_event(
  p_listing_id uuid,
  p_event_type text,
  p_actor_id uuid,
  p_session_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dedupe_interval interval;
  v_recent_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to record marketplace events'
      using errcode = '42501';
  end if;

  if p_event_type is null
    or p_event_type not in ('IMPRESSION', 'VIEW', 'SHARE', 'ENQUIRY', 'HIDE') then
    raise exception 'Unsupported marketplace event type'
      using errcode = '22023';
  end if;

  if p_session_hash is null or length(p_session_hash) <> 64 then
    raise exception 'Invalid marketplace session hash'
      using errcode = '22023';
  end if;

  if p_event_type = 'HIDE' and p_actor_id is null then
    raise exception 'Authentication is required to hide a listing'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.id = p_listing_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published'
      and post.moderation_status = 'approved'
      and post.deleted_at is null
      and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false
  ) then
    return 'ineligible';
  end if;

  if p_actor_id is not null and exists (
    select 1 from public.profiles
    where id = p_actor_id and is_blocked = true
  ) then
    return 'ineligible';
  end if;
  if p_actor_id is not null and exists (
    select 1 from public.posts
    where id = p_listing_id and author_id = p_actor_id
  ) then
    return 'ineligible';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_hash, 0));

  if p_event_type = 'IMPRESSION' then
    v_dedupe_interval := interval '24 hours';
  elsif p_event_type in ('VIEW', 'SHARE', 'ENQUIRY', 'HIDE') then
    v_dedupe_interval := interval '30 minutes';
  else
    v_dedupe_interval := interval '24 hours';
  end if;

  if exists (
    select 1
    from public.marketplace_engagement_events event
    where event.listing_id = p_listing_id
      and event.event_type = p_event_type
      and event.occurred_at >= now() - v_dedupe_interval
      and (
        (p_actor_id is not null and event.actor_id = p_actor_id)
        or (event.session_hash = p_session_hash)
      )
  ) then
    return 'duplicate';
  end if;

  select count(*)::integer into v_recent_count
  from public.marketplace_engagement_events event
  where event.session_hash = p_session_hash
    and event.occurred_at >= now() - interval '1 minute';

  if v_recent_count >= 40 then
    return 'rate_limited';
  end if;

  insert into public.marketplace_engagement_events (
    listing_id, event_type, actor_id, session_hash
  ) values (
    p_listing_id, p_event_type, p_actor_id, p_session_hash
  );

  return 'recorded';
end;
$$;

revoke all on function public.record_marketplace_engagement_event(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_marketplace_engagement_event(uuid, text, uuid, text) to service_role;

create or replace function public.capture_marketplace_listing_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_type in ('CLOTHING', 'FABRIC') then
    if not exists (
      select 1 from public.marketplace_engagement_events event
      where event.listing_id = new.id and event.event_type = 'CREATION'
    ) then
      insert into public.marketplace_engagement_events (
        listing_id, event_type, actor_id, occurred_at
      ) values (
        new.id, 'CREATION', new.author_id, new.created_at
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_listing_creation_event on public.posts;
create trigger marketplace_listing_creation_event
after insert on public.posts
for each row execute function public.capture_marketplace_listing_creation();

create or replace function public.capture_marketplace_interaction_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
begin
  v_event_type := case tg_table_name
    when 'post_likes' then 'LIKE'
    when 'post_saves' then 'SAVE'
    else null
  end;

  if tg_op = 'DELETE' then
    delete from public.marketplace_engagement_events
    where listing_id = old.post_id
      and event_type = v_event_type
      and actor_id = old.user_id;
    return old;
  end if;

  if v_event_type is not null then
    if exists (
      select 1
      from public.posts post
      join public.profiles seller on seller.id = post.author_id
      where post.id = new.post_id
        and post.listing_type in ('CLOTHING', 'FABRIC')
        and post.status = 'published'
        and post.moderation_status = 'approved'
        and post.deleted_at is null
        and post.is_blocked = false
        and post.availability in ('available', 'limited', 'made_to_order')
        and post.author_id <> new.user_id
        and seller.is_blocked = false
    ) and not exists (
      select 1
      from public.marketplace_engagement_events event
      where event.listing_id = new.post_id
        and event.event_type = v_event_type
        and event.actor_id = new.user_id
        and event.occurred_at >= now() - interval '24 hours'
    ) then
      insert into public.marketplace_engagement_events (
        listing_id, event_type, actor_id
      ) values (
        new.post_id, v_event_type, new.user_id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_like_event on public.post_likes;
create trigger marketplace_like_event
after insert or delete on public.post_likes
for each row execute function public.capture_marketplace_interaction_event();

drop trigger if exists marketplace_save_event on public.post_saves;
create trigger marketplace_save_event
after insert or delete on public.post_saves
for each row execute function public.capture_marketplace_interaction_event();

create or replace function public.capture_marketplace_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.marketplace_engagement_events (
    listing_id, event_type, actor_id
  )
  select new.listing_id, 'REPORT', new.reporter_id
  where exists (
    select 1
    from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.id = new.listing_id
      and post.author_id <> new.reporter_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published'
      and post.moderation_status = 'approved'
      and post.deleted_at is null
      and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false
  );
  return new;
end;
$$;

drop trigger if exists marketplace_report_event on public.listing_reports;
create trigger marketplace_report_event
after insert on public.listing_reports
for each row execute function public.capture_marketplace_report_event();

create table if not exists public.marketplace_trend_scores (
  listing_id uuid not null references public.posts(id) on delete cascade,
  scope_type text not null check (scope_type in ('global', 'region', 'category', 'style')),
  scope_value text not null,
  listing_type text not null check (listing_type in ('CLOTHING', 'FABRIC')),
  category_labels text[] not null default array[]::text[],
  fast_trend_score numeric not null default 0,
  momentum_ratio numeric not null default 0,
  engagement_rate numeric not null default 0,
  sustained_popularity numeric not null default 0,
  weighted_engagement_72h numeric not null default 0,
  weighted_engagement_7d numeric not null default 0,
  qualified_views_7d integer not null default 0,
  impressions_7d integer not null default 0,
  unique_engagers_7d integer not null default 0,
  confidence numeric not null default 0,
  rating_average numeric not null default 0,
  rating_count integer not null default 0,
  components jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (listing_id, scope_type, scope_value)
);

alter table public.marketplace_trend_scores enable row level security;
revoke all on public.marketplace_trend_scores from anon, authenticated;
grant all on public.marketplace_trend_scores to service_role;

create index if not exists marketplace_trend_category_global_idx
  on public.marketplace_trend_scores (scope_type, scope_value, fast_trend_score desc, listing_id)
  where 'TRENDING_NOW' = any(category_labels);
create index if not exists marketplace_rising_global_idx
  on public.marketplace_trend_scores (scope_type, scope_value, momentum_ratio desc, listing_id)
  where 'RISING' = any(category_labels);
create index if not exists marketplace_popular_global_idx
  on public.marketplace_trend_scores (scope_type, scope_value, sustained_popularity desc, listing_id)
  where 'POPULAR' = any(category_labels);
create index if not exists marketplace_views_global_idx
  on public.marketplace_trend_scores (scope_type, scope_value, qualified_views_7d desc, listing_id)
  where 'MOST_VIEWED' = any(category_labels);
create index if not exists marketplace_rated_global_idx
  on public.marketplace_trend_scores (scope_type, scope_value, rating_average desc, rating_count desc, listing_id)
  where 'HIGHLY_RATED' = any(category_labels);

create table if not exists public.marketplace_trend_score_logs (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.posts(id) on delete cascade,
  computed_at timestamptz not null,
  experiment_version text not null default 'baseline-v1',
  components jsonb not null
);

create index if not exists marketplace_trend_score_logs_time_idx
  on public.marketplace_trend_score_logs (computed_at desc);

alter table public.marketplace_trend_score_logs enable row level security;
revoke all on public.marketplace_trend_score_logs from anon, authenticated;
grant all on public.marketplace_trend_score_logs to service_role;
grant usage, select on sequence public.marketplace_trend_score_logs_id_seq to service_role;

create table if not exists public.marketplace_trend_refresh_state (
  id boolean primary key default true check (id),
  completed_at timestamptz
);
insert into public.marketplace_trend_refresh_state (id)
values (true)
on conflict (id) do nothing;
alter table public.marketplace_trend_refresh_state enable row level security;
revoke all on public.marketplace_trend_refresh_state from public, anon, authenticated;
grant all on public.marketplace_trend_refresh_state to service_role;

create or replace function public.refresh_marketplace_trends()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.marketplace_trend_config%rowtype;
  v_completed_at timestamptz;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to refresh marketplace trends'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2710162026);

  select * into v_config
  from public.marketplace_trend_config
  where id = true;

  select completed_at into v_completed_at
  from public.marketplace_trend_refresh_state
  where id = true
  for update;

  if v_completed_at is not null and v_completed_at > v_now - interval '10 minutes' then
    return v_completed_at;
  end if;

  delete from public.marketplace_engagement_events
  where occurred_at < v_now - make_interval(days => v_config.event_retention_days);

  with eligible as (
    select
      post.id as listing_id,
      post.listing_type,
      post.category_id,
      post.tags,
      post.created_at,
      post.published_at,
      coalesce(post.rating_average, 0)::numeric as rating_average,
      coalesce(post.rating_count, 0)::integer as rating_count,
      lower(nullif(coalesce(seller.location->>'country', post.location->>'country'), '')) as country
    from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published'
      and post.moderation_status = 'approved'
      and post.deleted_at is null
      and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false
  ),
  scopes as (
    select listing_id, listing_type, category_id, created_at, published_at, rating_average, rating_count,
      'global'::text as scope_type, 'global'::text as scope_value
    from eligible
    union all
    select listing_id, listing_type, category_id, created_at, published_at, rating_average, rating_count,
      'region'::text, country
    from eligible where country is not null
    union all
    select listing_id, listing_type, category_id, created_at, published_at, rating_average, rating_count,
      'category'::text, lower(category_id)
    from eligible where nullif(category_id, '') is not null
    union all
    select distinct eligible.listing_id, eligible.listing_type, eligible.category_id,
      eligible.created_at, eligible.published_at, eligible.rating_average, eligible.rating_count,
      'style'::text, lower(tag.value)
    from eligible
    cross join lateral unnest(eligible.tags) as tag(value)
    where length(btrim(tag.value)) between 2 and 40
  ),
  metrics as (
    select
      scopes.listing_id,
      scopes.scope_type,
      scopes.scope_value,
      scopes.listing_type,
      scopes.created_at,
      scopes.published_at,
      scopes.rating_average,
      scopes.rating_count,
      count(*) filter (
        where event.event_type = 'IMPRESSION'
          and event.occurred_at >= v_now - interval '7 days'
      )::integer as impressions_7d,
      count(*) filter (
        where event.event_type = 'IMPRESSION'
          and event.occurred_at >= v_now - interval '24 hours'
      )::integer as impressions_24h,
      coalesce(sum(pg_catalog.power(2::numeric,
          -extract(epoch from (v_now - event.occurred_at))
          / (v_config.half_life_hours * 3600)
        )) filter (
          where event.event_type = 'IMPRESSION'
            and event.occurred_at >= v_now - interval '7 days'
        ), 0) as decayed_impressions_72h,
      count(*) filter (
        where event.event_type = 'VIEW'
          and event.occurred_at >= v_now - interval '7 days'
      )::integer as views_7d,
      count(distinct coalesce(event.actor_id::text, event.session_hash)) filter (
        where event.event_type not in ('IMPRESSION', 'CREATION')
          and event.occurred_at >= v_now - interval '7 days'
      )::integer as unique_engagers_7d,
      coalesce(sum(coalesce((v_config.event_weights->>event.event_type)::numeric, 0)
        * pg_catalog.power(2::numeric,
          -extract(epoch from (v_now - event.occurred_at))
          / (v_config.half_life_hours * 3600)
        )) filter (where event.occurred_at >= v_now - interval '7 days'), 0) as weighted_72h,
      coalesce(sum(coalesce((v_config.event_weights->>event.event_type)::numeric, 0))
        filter (where event.occurred_at >= v_now - interval '7 days'), 0) as weighted_7d,
      coalesce(sum(coalesce((v_config.event_weights->>event.event_type)::numeric, 0))
        filter (where event.occurred_at >= v_now - interval '24 hours'), 0) as recent_weight,
      coalesce(sum(coalesce((v_config.event_weights->>event.event_type)::numeric, 0))
        filter (where event.occurred_at >= v_now - interval '48 hours'
          and event.occurred_at < v_now - interval '24 hours'), 0) as previous_weight,
      coalesce(sum(greatest(0, coalesce((v_config.event_weights->>event.event_type)::numeric, 0)))
        filter (where event.occurred_at >= v_now - interval '24 hours'), 0) as positive_recent_weight,
      coalesce(sum(greatest(0, coalesce((v_config.event_weights->>event.event_type)::numeric, 0)))
        filter (where event.occurred_at >= v_now - interval '48 hours'
          and event.occurred_at < v_now - interval '24 hours'), 0) as positive_previous_weight
    from scopes
    left join public.marketplace_engagement_events event
      on event.listing_id = scopes.listing_id
      and event.occurred_at >= v_now - make_interval(days => v_config.event_retention_days)
    group by scopes.listing_id, scopes.scope_type, scopes.scope_value,
      scopes.listing_type, scopes.created_at, scopes.published_at, scopes.rating_average, scopes.rating_count
  ),
  rated as (
    select
      metrics.*,
      least(3, greatest(-1, (positive_recent_weight + v_config.smoothing_weight)
        / (positive_previous_weight + v_config.smoothing_weight) - 1)) as momentum,
      (recent_weight + v_config.prior_engagement_rate * v_config.prior_exposures)
        / (impressions_24h + v_config.prior_exposures) as engagement_rate,
      least(1, sqrt(impressions_7d::numeric / (v_config.minimum_impressions * 5.0)))
        * least(1, sqrt(unique_engagers_7d::numeric / v_config.minimum_unique_engagers)) as confidence
    from metrics
    where scope_type = 'global'
      or (
        impressions_7d >= v_config.minimum_impressions
        and unique_engagers_7d >= v_config.minimum_unique_engagers
      )
  ),
  scored as (
    select
      rated.*,
      weighted_72h / greatest(decayed_impressions_72h, v_config.minimum_impressions)
        * confidence * (1 + least(momentum, 3)) as fast_trend_score,
      weighted_7d as sustained_popularity,
      array_remove(array[
        case when weighted_72h > 0 and positive_recent_weight >= 3
          and momentum >= 0.2 and confidence >= 0.15
          and impressions_24h >= v_config.minimum_impressions
          and unique_engagers_7d >= v_config.minimum_unique_engagers
          then 'TRENDING_NOW' end,
        case when weighted_72h > 0 and positive_recent_weight >= 3 and momentum >= 0.5
          and impressions_24h >= v_config.minimum_impressions
          and unique_engagers_7d >= v_config.minimum_unique_engagers then 'RISING' end,
        case when weighted_7d >= v_config.minimum_popularity_weight
          and impressions_7d >= v_config.minimum_impressions
          and unique_engagers_7d >= v_config.minimum_unique_engagers
          then 'POPULAR' end,
        case when created_at >= v_now - interval '7 days'
          and weighted_72h > 0 and positive_recent_weight >= 2 and unique_engagers_7d >= 2
          then 'NEW_NOTICED' end,
        case when rating_count >= v_config.minimum_rating_count
          and rating_average >= v_config.minimum_rating_average
          then 'HIGHLY_RATED' end,
        case when views_7d > 0 then 'MOST_VIEWED' end
      ], null) as category_labels
    from rated
  ),
  upserted as (
    insert into public.marketplace_trend_scores (
      listing_id, scope_type, scope_value, listing_type, category_labels,
      fast_trend_score, momentum_ratio, engagement_rate, sustained_popularity,
      weighted_engagement_72h, weighted_engagement_7d, qualified_views_7d,
      impressions_7d, unique_engagers_7d, confidence, rating_average, rating_count,
      components, computed_at
    )
    select
      listing_id, scope_type, scope_value, listing_type, category_labels,
      fast_trend_score, momentum, engagement_rate, sustained_popularity,
      weighted_72h, weighted_7d, views_7d, impressions_7d, unique_engagers_7d,
      confidence, rating_average, rating_count,
      jsonb_build_object(
        'halfLifeHours', v_config.half_life_hours,
        'weightedEngagement72h', weighted_72h,
        'weightedEngagement7d', weighted_7d,
        'decayedImpressions72h', decayed_impressions_72h,
        'recent24hWeight', recent_weight,
        'previous24hWeight', previous_weight,
        'positiveRecent24hWeight', positive_recent_weight,
        'positivePrevious24hWeight', positive_previous_weight,
        'momentumRatio', momentum,
        'engagementRate', engagement_rate,
        'impressions24h', impressions_24h,
        'impressions7d', impressions_7d,
        'uniqueEngagers7d', unique_engagers_7d,
        'confidence', confidence,
        'qualifiedViews7d', views_7d,
        'ratingAverage', rating_average,
        'ratingCount', rating_count,
        'experimentVersion', v_config.experiment_version
      ),
      v_now
    from scored
    on conflict (listing_id, scope_type, scope_value) do update set
      listing_type = excluded.listing_type,
      category_labels = excluded.category_labels,
      fast_trend_score = excluded.fast_trend_score,
      momentum_ratio = excluded.momentum_ratio,
      engagement_rate = excluded.engagement_rate,
      sustained_popularity = excluded.sustained_popularity,
      weighted_engagement_72h = excluded.weighted_engagement_72h,
      weighted_engagement_7d = excluded.weighted_engagement_7d,
      qualified_views_7d = excluded.qualified_views_7d,
      impressions_7d = excluded.impressions_7d,
      unique_engagers_7d = excluded.unique_engagers_7d,
      confidence = excluded.confidence,
      rating_average = excluded.rating_average,
      rating_count = excluded.rating_count,
      components = excluded.components,
      computed_at = excluded.computed_at
    returning listing_id, scope_type, fast_trend_score, components
  )
  insert into public.marketplace_trend_score_logs (
    listing_id, computed_at, experiment_version, components
  )
  select listing_id, v_now, v_config.experiment_version, components
  from upserted
  where scope_type = 'global'
  order by fast_trend_score desc, listing_id
  limit 200;

  delete from public.marketplace_trend_scores
  where computed_at < v_now;

  delete from public.marketplace_trend_score_logs
  where computed_at < v_now - interval '7 days';

  update public.marketplace_trend_refresh_state
  set completed_at = v_now
  where id = true;

  return v_now;
end;
$$;

revoke all on function public.refresh_marketplace_trends() from public, anon, authenticated;
grant execute on function public.refresh_marketplace_trends() to service_role;
