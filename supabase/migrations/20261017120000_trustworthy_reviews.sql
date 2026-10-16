begin;

create table if not exists public.review_rating_config (
  id boolean primary key default true check (id),
  default_prior_mean numeric(3, 2) not null default 3.50 check (default_prior_mean between 1 and 5),
  prior_strength integer not null default 20 check (prior_strength > 0),
  baseline_minimum_reviews integer not null default 50 check (baseline_minimum_reviews > 0),
  edit_window interval not null default interval '14 days',
  version text not null default 'bayes-v1',
  updated_at timestamptz not null default now()
);
insert into public.review_rating_config (id) values (true) on conflict (id) do nothing;
alter table public.review_rating_config enable row level security;
revoke all on public.review_rating_config from public, anon, authenticated;
grant all on public.review_rating_config to service_role;

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.posts(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  category_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(category_breakdown) = 'object'),
  review_text text not null default '' check (char_length(review_text) <= 4000),
  evidence_assets jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_assets) = 'array' and jsonb_array_length(evidence_assets) <= 3),
  verification_status text not null default 'unverified' check (verification_status = 'unverified'),
  eligibility_type text not null default 'firsthand_attestation' check (eligibility_type = 'firsthand_attestation'),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'published', 'rejected', 'removed')),
  moderation_note text not null default '' check (char_length(moderation_note) <= 1000),
  seller_response text not null default '' check (char_length(seller_response) <= 2000),
  seller_responded_at timestamptz,
  firsthand_attested boolean not null default false check (firsthand_attested),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, reviewer_id),
  check (reviewer_id <> seller_id)
);

create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.posts(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  category_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(category_breakdown) = 'object'),
  review_text text not null default '' check (char_length(review_text) <= 4000),
  evidence_assets jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_assets) = 'array' and jsonb_array_length(evidence_assets) <= 3),
  verification_status text not null default 'unverified' check (verification_status = 'unverified'),
  eligibility_type text not null default 'firsthand_attestation' check (eligibility_type = 'firsthand_attestation'),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'published', 'rejected', 'removed')),
  moderation_note text not null default '' check (char_length(moderation_note) <= 1000),
  seller_response text not null default '' check (char_length(seller_response) <= 2000),
  seller_responded_at timestamptz,
  firsthand_attested boolean not null default false check (firsthand_attested),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, reviewer_id),
  check (reviewer_id <> seller_id)
);

create table if not exists public.review_rating_summaries (
  target_type text not null check (target_type in ('listing', 'seller')),
  target_id uuid not null,
  raw_average numeric(4, 2) not null default 0,
  eligible_review_count integer not null default 0,
  rating_distribution jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  confidence_adjusted_rating numeric(4, 2),
  prior_mean numeric(3, 2) not null default 3.50,
  prior_strength integer not null default 20,
  baseline_scope text not null default 'global_default',
  config_version text not null default 'bayes-v1',
  updated_at timestamptz not null default now(),
  primary key (target_type, target_id)
);
alter table public.review_rating_summaries enable row level security;
revoke all on public.review_rating_summaries from public, anon, authenticated;
grant all on public.review_rating_summaries to service_role;
revoke all on public.listing_reviews, public.seller_reviews from public, anon, authenticated;
grant all on public.listing_reviews, public.seller_reviews to service_role;

create table if not exists public.review_audit_log (
  id bigint generated always as identity primary key,
  review_type text not null check (review_type in ('listing', 'seller')),
  review_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted', 'edited', 'moderated', 'seller_responded', 'appealed', 'appeal_resolved', 'report_resolved')),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.review_audit_log enable row level security;
revoke all on public.review_audit_log from public, anon, authenticated;
grant all on public.review_audit_log to service_role;
grant usage, select on sequence public.review_audit_log_id_seq to service_role;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('listing', 'seller')),
  review_id uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'personal_information', 'spam', 'conflict_of_interest', 'policy_violation', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists review_reports_one_open_per_reporter_idx
  on public.review_reports (review_type, review_id, reporter_id) where status = 'open';
alter table public.review_reports enable row level security;
revoke all on public.review_reports from public, anon, authenticated;
grant all on public.review_reports to service_role;

create table if not exists public.review_appeals (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('listing', 'seller')),
  review_id uuid not null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists review_appeals_one_open_per_review_idx
  on public.review_appeals (review_type, review_id) where status = 'open';
alter table public.review_appeals enable row level security;
revoke all on public.review_appeals from public, anon, authenticated;
grant all on public.review_appeals to service_role;

create table if not exists public.review_helpful_votes (
  review_type text not null check (review_type in ('listing', 'seller')),
  review_id uuid not null,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_type, review_id, voter_id)
);
alter table public.review_helpful_votes enable row level security;
revoke all on public.review_helpful_votes from public, anon, authenticated;
grant all on public.review_helpful_votes to service_role;

create index if not exists listing_reviews_public_idx
  on public.listing_reviews (listing_id, created_at desc, id desc)
  where moderation_status = 'published';
create index if not exists seller_reviews_public_idx
  on public.seller_reviews (seller_id, created_at desc, id desc)
  where moderation_status = 'published';
create index if not exists listing_reviews_published_rating_idx
  on public.listing_reviews (rating) where moderation_status = 'published';
create index if not exists seller_reviews_published_rating_idx
  on public.seller_reviews (rating) where moderation_status = 'published';
create index if not exists listing_reviews_queue_idx
  on public.listing_reviews (created_at asc) where moderation_status = 'pending';
create index if not exists seller_reviews_queue_idx
  on public.seller_reviews (created_at asc) where moderation_status = 'pending';
create index if not exists review_reports_queue_idx
  on public.review_reports (created_at asc) where status = 'open';
create index if not exists review_appeals_queue_idx
  on public.review_appeals (created_at asc) where status = 'open';

create or replace function public.cleanup_marketplace_review_dependents()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_type text := tg_table_name;
  v_review_type text;
begin
  v_review_type := case when v_type = 'listing_reviews' then 'listing' else 'seller' end;
  delete from public.review_helpful_votes where review_type = v_review_type and review_id = old.id;
  delete from public.review_reports where review_type = v_review_type and review_id = old.id;
  delete from public.review_appeals where review_type = v_review_type and review_id = old.id;
  update public.review_audit_log set old_values = '{}'::jsonb, new_values = '{}'::jsonb
    where review_type = v_review_type and review_id = old.id;
  return old;
end;
$$;
revoke all on function public.cleanup_marketplace_review_dependents() from public, anon, authenticated;

drop trigger if exists listing_reviews_cleanup_dependents on public.listing_reviews;
create trigger listing_reviews_cleanup_dependents before delete on public.listing_reviews
for each row execute function public.cleanup_marketplace_review_dependents();
drop trigger if exists seller_reviews_cleanup_dependents on public.seller_reviews;
create trigger seller_reviews_cleanup_dependents before delete on public.seller_reviews
for each row execute function public.cleanup_marketplace_review_dependents();

alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;
revoke all on public.ratings from public;
drop trigger if exists ratings_feed_summary on public.ratings;

create or replace function public.recalculate_listing_review_summary(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.review_rating_config%rowtype;
  v_category text;
  v_category_count integer;
  v_category_mean numeric;
  v_global_count integer;
  v_global_mean numeric;
  v_prior_mean numeric;
  v_prior_scope text;
  v_count integer;
  v_average numeric;
  v_distribution jsonb;
begin
  select * into v_config from public.review_rating_config where id = true for update;
  select category_id into v_category from public.posts where id = p_listing_id;

  select count(*)::integer, coalesce(avg(review.rating), v_config.default_prior_mean)
  into v_global_count, v_global_mean
  from public.listing_reviews review
  where review.moderation_status = 'published';

  if nullif(v_category, '') is not null then
    select count(*)::integer, coalesce(avg(review.rating), v_config.default_prior_mean)
    into v_category_count, v_category_mean
    from public.listing_reviews review
    join public.posts post on post.id = review.listing_id
    where review.moderation_status = 'published'
      and lower(post.category_id) = lower(v_category);
  else
    v_category_count := 0;
  end if;

  if v_category_count >= v_config.baseline_minimum_reviews then
    v_prior_mean := v_category_mean;
    v_prior_scope := 'category';
  elsif v_global_count >= v_config.baseline_minimum_reviews then
    v_prior_mean := v_global_mean;
    v_prior_scope := 'global';
  else
    v_prior_mean := v_config.default_prior_mean;
    v_prior_scope := 'global_default';
  end if;

  select count(*)::integer, coalesce(avg(rating), 0),
    coalesce((
      select jsonb_object_agg(star, total)
      from (
        select stars.value as star, count(review.id)::integer as total
        from generate_series(1, 5) as stars(value)
        left join public.listing_reviews review
          on review.listing_id = p_listing_id
          and review.moderation_status = 'published'
          and review.rating = stars.value
        group by stars.value
      ) distribution
    ), '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb)
  into v_count, v_average, v_distribution
  from public.listing_reviews
  where listing_id = p_listing_id and moderation_status = 'published';

  insert into public.review_rating_summaries (
    target_type, target_id, raw_average, eligible_review_count,
    rating_distribution, confidence_adjusted_rating, prior_mean,
    prior_strength, baseline_scope, config_version, updated_at
  ) values (
    'listing', p_listing_id, round(v_average, 2), v_count,
    v_distribution,
    case when v_count > 0 then round(((v_count * v_average + v_config.prior_strength * v_prior_mean)
      / (v_count + v_config.prior_strength)), 2) else null end,
    v_prior_mean, v_config.prior_strength, v_prior_scope, v_config.version, now()
  )
  on conflict (target_type, target_id) do update set
    raw_average = excluded.raw_average,
    eligible_review_count = excluded.eligible_review_count,
    rating_distribution = excluded.rating_distribution,
    confidence_adjusted_rating = excluded.confidence_adjusted_rating,
    prior_mean = excluded.prior_mean,
    prior_strength = excluded.prior_strength,
    baseline_scope = excluded.baseline_scope,
    config_version = excluded.config_version,
    updated_at = excluded.updated_at;

  update public.posts
  set rating_average = round(v_average, 2),
      rating_count = v_count
  where id = p_listing_id;
end;
$$;

create or replace function public.recalculate_seller_review_summary(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.review_rating_config%rowtype;
  v_global_count integer;
  v_global_mean numeric;
  v_prior_mean numeric;
  v_count integer;
  v_average numeric;
  v_distribution jsonb;
begin
  select * into v_config from public.review_rating_config where id = true for update;
  select count(*)::integer, coalesce(avg(rating), v_config.default_prior_mean)
  into v_global_count, v_global_mean
  from public.seller_reviews where moderation_status = 'published';
  v_prior_mean := case
    when v_global_count >= v_config.baseline_minimum_reviews then v_global_mean
    else v_config.default_prior_mean
  end;

  select count(*)::integer, coalesce(avg(rating), 0),
    coalesce((
      select jsonb_object_agg(star, total)
      from (
        select stars.value as star, count(review.id)::integer as total
        from generate_series(1, 5) as stars(value)
        left join public.seller_reviews review
          on review.seller_id = p_seller_id
          and review.moderation_status = 'published'
          and review.rating = stars.value
        group by stars.value
      ) distribution
    ), '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb)
  into v_count, v_average, v_distribution
  from public.seller_reviews
  where seller_id = p_seller_id and moderation_status = 'published';

  insert into public.review_rating_summaries (
    target_type, target_id, raw_average, eligible_review_count,
    rating_distribution, confidence_adjusted_rating, prior_mean,
    prior_strength, baseline_scope, config_version, updated_at
  ) values (
    'seller', p_seller_id, round(v_average, 2), v_count,
    v_distribution,
    case when v_count > 0 then round(((v_count * v_average + v_config.prior_strength * v_prior_mean)
      / (v_count + v_config.prior_strength)), 2) else null end,
    v_prior_mean, v_config.prior_strength,
    case when v_global_count >= v_config.baseline_minimum_reviews then 'global' else 'global_default' end,
    v_config.version, now()
  )
  on conflict (target_type, target_id) do update set
    raw_average = excluded.raw_average,
    eligible_review_count = excluded.eligible_review_count,
    rating_distribution = excluded.rating_distribution,
    confidence_adjusted_rating = excluded.confidence_adjusted_rating,
    prior_mean = excluded.prior_mean,
    prior_strength = excluded.prior_strength,
    baseline_scope = excluded.baseline_scope,
    config_version = excluded.config_version,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.refresh_review_summary_from_listing_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_listing_review_summary(old.listing_id);
    return old;
  end if;
  perform public.recalculate_listing_review_summary(new.listing_id);
  if tg_op = 'UPDATE' and old.listing_id <> new.listing_id then
    perform public.recalculate_listing_review_summary(old.listing_id);
  end if;
  return new;
end;
$$;

create or replace function public.refresh_review_summary_from_seller_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_seller_review_summary(old.seller_id);
    return old;
  end if;
  perform public.recalculate_seller_review_summary(new.seller_id);
  if tg_op = 'UPDATE' and old.seller_id <> new.seller_id then
    perform public.recalculate_seller_review_summary(old.seller_id);
  end if;
  return new;
end;
$$;

drop trigger if exists listing_reviews_refresh_summary on public.listing_reviews;
create trigger listing_reviews_refresh_summary
after insert or update or delete on public.listing_reviews
for each row execute function public.refresh_review_summary_from_listing_review();
drop trigger if exists seller_reviews_refresh_summary on public.seller_reviews;
create trigger seller_reviews_refresh_summary
after insert or update or delete on public.seller_reviews
for each row execute function public.refresh_review_summary_from_seller_review();

create or replace function public.cleanup_review_rating_summary_target()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'posts' then
    delete from public.review_rating_summaries where target_type = 'listing' and target_id = old.id;
  else
    delete from public.review_rating_summaries where target_type = 'seller' and target_id = old.id;
  end if;
  return old;
end;
$$;
revoke all on function public.cleanup_review_rating_summary_target() from public, anon, authenticated;
drop trigger if exists posts_cleanup_review_summary on public.posts;
create trigger posts_cleanup_review_summary after delete on public.posts
for each row execute function public.cleanup_review_rating_summary_target();
drop trigger if exists profiles_cleanup_review_summary on public.profiles;
create trigger profiles_cleanup_review_summary after delete on public.profiles
for each row execute function public.cleanup_review_rating_summary_target();

create or replace function public.submit_marketplace_review(
  p_review_type text,
  p_target_id uuid,
  p_reviewer_id uuid,
  p_rating smallint,
  p_review_text text,
  p_category_breakdown jsonb,
  p_firsthand_attested boolean,
  p_context_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller_id uuid;
  v_listing_id uuid;
  v_existing record;
  v_review jsonb;
  v_config public.review_rating_config%rowtype;
  v_recent_review_count integer;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type is null or p_review_type not in ('listing', 'seller')
    or p_rating is null or p_rating not between 1 and 5
    or p_firsthand_attested is distinct from true
    or p_review_text is null
    or char_length(p_review_text) > 4000 then
    raise exception 'Invalid review submission' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_category_breakdown, '{}'::jsonb)) <> 'object' then
    raise exception 'Category breakdown must be an object' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(coalesce(p_category_breakdown, '{}'::jsonb))) > 5
    or exists (
      select 1 from jsonb_each_text(coalesce(p_category_breakdown, '{}'::jsonb)) item
      where item.key not in ('quality', 'communication', 'accuracy', 'timeliness', 'value')
        or item.value !~ '^[1-5]$'
    ) then
    raise exception 'Invalid category breakdown' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_reviewer_id and (is_blocked or role in ('admin'))) then
    raise exception 'This account cannot submit reviews' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-submit:' || p_reviewer_id::text, 0));
  select (
    (select count(*) from public.listing_reviews review
      where review.reviewer_id = p_reviewer_id
        and (review.created_at >= v_now - interval '24 hours' or review.updated_at >= v_now - interval '24 hours'))
    +
    (select count(*) from public.seller_reviews review
      where review.reviewer_id = p_reviewer_id
        and (review.created_at >= v_now - interval '24 hours' or review.updated_at >= v_now - interval '24 hours'))
  )::integer into v_recent_review_count;
  if v_recent_review_count >= 5 then
    raise exception 'Review submission limit reached. Try again tomorrow.' using errcode = '22023';
  end if;

  select * into v_config from public.review_rating_config where id = true;

  if p_review_type = 'listing' then
    select post.author_id, post.id into v_seller_id, v_listing_id
    from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.id = p_target_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published'
      and post.moderation_status = 'approved'
      and post.deleted_at is null
      and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false;
    if v_listing_id is null or v_seller_id = p_reviewer_id then
      raise exception 'This listing cannot receive your review' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('listing:' || p_target_id::text || ':' || p_reviewer_id::text, 0));
    select id, created_at, rating, review_text, moderation_status
    into v_existing from public.listing_reviews
    where listing_id = p_target_id and reviewer_id = p_reviewer_id
    for update;
    if found then
      if v_now > v_existing.created_at + v_config.edit_window then
        raise exception 'The 14-day review edit window has ended' using errcode = '22023';
      end if;
      update public.listing_reviews set
        rating = p_rating, review_text = btrim(p_review_text),
        category_breakdown = coalesce(p_category_breakdown, '{}'::jsonb),
        moderation_status = 'pending', moderation_note = '',
        updated_at = v_now
      where id = v_existing.id
      returning to_jsonb(listing_reviews.*) into v_review;
      insert into public.review_audit_log (
        review_type, review_id, actor_id, action, old_values, new_values
      ) values (
        'listing', v_existing.id, p_reviewer_id, 'edited',
        jsonb_build_object('rating', v_existing.rating, 'reviewText', v_existing.review_text, 'categoryBreakdown', v_existing.category_breakdown, 'moderationStatus', v_existing.moderation_status),
        jsonb_build_object('rating', p_rating, 'reviewText', btrim(p_review_text), 'categoryBreakdown', coalesce(p_category_breakdown, '{}'::jsonb), 'moderationStatus', 'pending')
      );
    else
      insert into public.listing_reviews (
        reviewer_id, seller_id, listing_id, rating, review_text,
        category_breakdown, firsthand_attested, moderation_status
      ) values (
        p_reviewer_id, v_seller_id, v_listing_id, p_rating, btrim(p_review_text),
        coalesce(p_category_breakdown, '{}'::jsonb), true, 'pending'
      ) returning to_jsonb(listing_reviews.*) into v_review;
      insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values)
      values ('listing', (v_review->>'id')::uuid, p_reviewer_id, 'submitted', v_review);
    end if;
  else
    select profile.id into v_seller_id from public.profiles profile
    where profile.id = p_target_id
      and profile.role in ('tailor', 'fabric_seller')
      and profile.is_blocked = false;
    if v_seller_id is null or v_seller_id = p_reviewer_id then
      raise exception 'This seller cannot receive your review' using errcode = '42501';
    end if;
    v_listing_id := null;
    if p_context_listing_id is not null then
      select post.id into v_listing_id
      from public.posts post
      where post.id = p_context_listing_id
        and post.author_id = v_seller_id
        and post.listing_type in ('CLOTHING', 'FABRIC')
        and post.status = 'published'
        and post.moderation_status = 'approved'
        and post.deleted_at is null;
      if v_listing_id is null then
        raise exception 'The selected listing does not belong to this seller' using errcode = '22023';
      end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('seller:' || p_target_id::text || ':' || p_reviewer_id::text, 0));
    select id, created_at, rating, review_text, moderation_status
    into v_existing from public.seller_reviews
    where seller_id = p_target_id and reviewer_id = p_reviewer_id
    for update;
    if found then
      if v_now > v_existing.created_at + v_config.edit_window then
        raise exception 'The 14-day review edit window has ended' using errcode = '22023';
      end if;
      update public.seller_reviews set
        rating = p_rating, review_text = btrim(p_review_text),
        category_breakdown = coalesce(p_category_breakdown, '{}'::jsonb),
        moderation_status = 'pending', moderation_note = '',
        updated_at = v_now
      where id = v_existing.id
      returning to_jsonb(seller_reviews.*) into v_review;
      insert into public.review_audit_log (
        review_type, review_id, actor_id, action, old_values, new_values
      ) values (
        'seller', v_existing.id, p_reviewer_id, 'edited',
        jsonb_build_object('rating', v_existing.rating, 'reviewText', v_existing.review_text, 'categoryBreakdown', v_existing.category_breakdown, 'moderationStatus', v_existing.moderation_status),
        jsonb_build_object('rating', p_rating, 'reviewText', btrim(p_review_text), 'categoryBreakdown', coalesce(p_category_breakdown, '{}'::jsonb), 'moderationStatus', 'pending')
      );
    else
      insert into public.seller_reviews (
        reviewer_id, seller_id, listing_id, rating, review_text,
        category_breakdown, firsthand_attested, moderation_status
      ) values (
        p_reviewer_id, v_seller_id, v_listing_id, p_rating, btrim(p_review_text),
        coalesce(p_category_breakdown, '{}'::jsonb), true, 'pending'
      ) returning to_jsonb(seller_reviews.*) into v_review;
      insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values)
      values ('seller', (v_review->>'id')::uuid, p_reviewer_id, 'submitted', v_review);
    end if;
  end if;
  return v_review;
end;
$$;

revoke all on function public.submit_marketplace_review(text, uuid, uuid, smallint, text, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.submit_marketplace_review(text, uuid, uuid, smallint, text, jsonb, boolean, uuid) to service_role;

create or replace function public.moderate_marketplace_review(
  p_review_type text,
  p_review_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type not in ('listing', 'seller')
    or p_decision not in ('published', 'rejected', 'removed')
    or char_length(btrim(coalesce(p_reason, ''))) < 5
  then
    raise exception 'A moderation decision and reason are required' using errcode = '22023';
  end if;
  if p_review_type = 'listing' then
    select to_jsonb(review.*) into v_old from public.listing_reviews review where id = p_review_id for update;
    if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
    update public.listing_reviews set moderation_status = p_decision,
      moderation_note = left(btrim(p_reason), 1000), updated_at = now()
    where id = p_review_id;
  else
    select to_jsonb(review.*) into v_old from public.seller_reviews review where id = p_review_id for update;
    if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
    update public.seller_reviews set moderation_status = p_decision,
      moderation_note = left(btrim(p_reason), 1000), updated_at = now()
    where id = p_review_id;
  end if;
  insert into public.review_audit_log (review_type, review_id, actor_id, action, old_values, new_values, reason)
  values (p_review_type, p_review_id, p_actor_id, 'moderated', v_old,
    jsonb_build_object('moderationStatus', p_decision), left(btrim(p_reason), 1000));
end;
$$;
revoke all on function public.moderate_marketplace_review(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_marketplace_review(text, uuid, uuid, text, text) to service_role;

create or replace function public.respond_to_marketplace_review(
  p_review_type text, p_review_id uuid, p_seller_id uuid, p_response text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
  v_review_seller_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type not in ('listing', 'seller')
    or char_length(btrim(coalesce(p_response, ''))) < 2
    or char_length(p_response) > 2000 then
    raise exception 'Enter a seller response of 2 to 2000 characters' using errcode = '22023';
  end if;
  if p_review_type = 'listing' then
    select seller_id, seller_response into v_review_seller_id, v_old
    from public.listing_reviews where id = p_review_id and moderation_status = 'published' for update;
    if not found then raise exception 'Published review not found' using errcode = 'P0002'; end if;
    if v_review_seller_id <> p_seller_id then raise exception 'Only the reviewed seller may respond' using errcode = '42501'; end if;
    update public.listing_reviews set seller_response = btrim(p_response), seller_responded_at = now(), updated_at = now()
    where id = p_review_id;
  else
    select seller_id, seller_response into v_review_seller_id, v_old
    from public.seller_reviews where id = p_review_id and moderation_status = 'published' for update;
    if not found then raise exception 'Published review not found' using errcode = 'P0002'; end if;
    if v_review_seller_id <> p_seller_id then raise exception 'Only the reviewed seller may respond' using errcode = '42501'; end if;
    update public.seller_reviews set seller_response = btrim(p_response), seller_responded_at = now(), updated_at = now()
    where id = p_review_id;
  end if;
  insert into public.review_audit_log (review_type, review_id, actor_id, action, old_values, new_values)
  values (p_review_type, p_review_id, p_seller_id, 'seller_responded',
    jsonb_build_object('sellerResponse', v_old),
    jsonb_build_object('sellerResponse', btrim(p_response)));
end;
$$;
revoke all on function public.respond_to_marketplace_review(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.respond_to_marketplace_review(text, uuid, uuid, text) to service_role;

create or replace function public.toggle_marketplace_review_helpful(
  p_review_type text, p_review_id uuid, p_voter_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_reviewer_id uuid;
  v_count integer;
  v_helpful boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type = 'listing' then
    select reviewer_id into v_reviewer_id from public.listing_reviews
      where id = p_review_id and moderation_status = 'published' for update;
  elsif p_review_type = 'seller' then
    select reviewer_id into v_reviewer_id from public.seller_reviews
      where id = p_review_id and moderation_status = 'published' for update;
  else
    raise exception 'Invalid review type' using errcode = '22023';
  end if;
  if not found then raise exception 'Published review not found' using errcode = 'P0002'; end if;
  if v_reviewer_id = p_voter_id then raise exception 'You cannot vote on your own review' using errcode = '42501'; end if;
  delete from public.review_helpful_votes
    where review_type = p_review_type and review_id = p_review_id and voter_id = p_voter_id;
  if found then
    v_helpful := false;
  else
    insert into public.review_helpful_votes (review_type, review_id, voter_id)
      values (p_review_type, p_review_id, p_voter_id);
    v_helpful := true;
  end if;
  select count(*)::integer into v_count from public.review_helpful_votes
    where review_type = p_review_type and review_id = p_review_id;
  return jsonb_build_object('helpfulCount', v_count, 'helpful', v_helpful);
end;
$$;
revoke all on function public.toggle_marketplace_review_helpful(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_marketplace_review_helpful(text, uuid, uuid) to service_role;

create or replace function public.get_marketplace_review_helpful_counts(
  p_review_type text, p_review_ids uuid[], p_viewer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type not in ('listing', 'seller') then
    raise exception 'Invalid review type' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(totals.review_id::text,
    jsonb_build_object('helpfulCount', totals.helpful_count, 'viewerFoundHelpful', totals.viewer_found_helpful)), '{}'::jsonb)
  into v_result
  from (
    select review_id, count(*)::integer as helpful_count,
      coalesce(bool_or(voter_id = p_viewer_id), false) as viewer_found_helpful
    from public.review_helpful_votes
    where review_type = p_review_type and review_id = any(coalesce(p_review_ids, '{}'::uuid[]))
    group by review_id
  ) totals;
  return v_result;
end;
$$;
revoke all on function public.get_marketplace_review_helpful_counts(text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.get_marketplace_review_helpful_counts(text, uuid[], uuid) to service_role;

create or replace function public.create_marketplace_review_report(
  p_review_type text, p_review_id uuid, p_reporter_id uuid, p_reason text, p_details text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_reviewer_id uuid;
  v_recent_count integer;
  v_report_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_reason not in ('harassment', 'personal_information', 'spam', 'conflict_of_interest', 'policy_violation', 'other')
    or char_length(coalesce(p_details, '')) > 1000 then
    raise exception 'Invalid review report' using errcode = '22023';
  end if;
  if p_review_type = 'listing' then
    select reviewer_id into v_reviewer_id from public.listing_reviews
      where id = p_review_id and moderation_status = 'published';
  elsif p_review_type = 'seller' then
    select reviewer_id into v_reviewer_id from public.seller_reviews
      where id = p_review_id and moderation_status = 'published';
  else
    raise exception 'Invalid review type' using errcode = '22023';
  end if;
  if not found then raise exception 'Published review not found' using errcode = 'P0002'; end if;
  if v_reviewer_id = p_reporter_id then raise exception 'You cannot report your own review' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-report:' || p_reporter_id::text, 0));
  select count(*)::integer into v_recent_count from public.review_reports
    where reporter_id = p_reporter_id and created_at >= now() - interval '24 hours';
  if v_recent_count >= 5 then raise exception 'Review report limit reached' using errcode = '22023'; end if;
  insert into public.review_reports (review_type, review_id, reporter_id, reason, details)
    values (p_review_type, p_review_id, p_reporter_id, p_reason, left(btrim(coalesce(p_details, '')), 1000))
    returning id into v_report_id;
  return v_report_id;
end;
$$;
revoke all on function public.create_marketplace_review_report(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_review_report(text, uuid, uuid, text, text) to service_role;

create or replace function public.create_marketplace_review_appeal(
  p_review_type text, p_review_id uuid, p_reviewer_id uuid, p_reason text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_author_id uuid;
  v_status text;
  v_appeal_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'Appeal reason must be 10 to 1000 characters' using errcode = '22023';
  end if;
  if p_review_type = 'listing' then
    select reviewer_id, moderation_status into v_author_id, v_status from public.listing_reviews where id = p_review_id;
  elsif p_review_type = 'seller' then
    select reviewer_id, moderation_status into v_author_id, v_status from public.seller_reviews where id = p_review_id;
  else
    raise exception 'Invalid review type' using errcode = '22023';
  end if;
  if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
  if v_author_id <> p_reviewer_id or v_status not in ('rejected', 'removed') then
    raise exception 'Only the author of a rejected or removed review may appeal' using errcode = '42501';
  end if;
  insert into public.review_appeals (review_type, review_id, reviewer_id, reason)
    values (p_review_type, p_review_id, p_reviewer_id, btrim(p_reason))
    returning id into v_appeal_id;
  insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values)
    values (p_review_type, p_review_id, p_reviewer_id, 'appealed', jsonb_build_object('appealId', v_appeal_id, 'reason', btrim(p_reason)));
  return v_appeal_id;
end;
$$;
revoke all on function public.create_marketplace_review_appeal(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_review_appeal(text, uuid, uuid, text) to service_role;

create or replace function public.resolve_marketplace_review_appeal(
  p_appeal_id uuid, p_actor_id uuid, p_decision text, p_reason text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_appeal public.review_appeals%rowtype;
  v_old_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_decision not in ('upheld', 'overturned') or char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Appeal decision and reason are required' using errcode = '22023';
  end if;
  select * into v_appeal from public.review_appeals where id = p_appeal_id and status = 'open' for update;
  if not found then raise exception 'Open appeal not found' using errcode = 'P0002'; end if;
  update public.review_appeals set status = p_decision, resolution_note = left(btrim(p_reason), 1000),
    resolved_by = p_actor_id, resolved_at = now() where id = p_appeal_id;
  if v_appeal.review_type = 'listing' then
    select moderation_status into v_old_status from public.listing_reviews where id = v_appeal.review_id for update;
    if p_decision = 'overturned' then
      update public.listing_reviews set moderation_status = 'published', moderation_note = '', updated_at = now()
      where id = v_appeal.review_id;
    end if;
  else
    select moderation_status into v_old_status from public.seller_reviews where id = v_appeal.review_id for update;
    if p_decision = 'overturned' then
      update public.seller_reviews set moderation_status = 'published', moderation_note = '', updated_at = now()
      where id = v_appeal.review_id;
    end if;
  end if;
  insert into public.review_audit_log (review_type, review_id, actor_id, action, old_values, new_values, reason)
  values (v_appeal.review_type, v_appeal.review_id, p_actor_id, 'appeal_resolved',
    jsonb_build_object('appealStatus', 'open', 'moderationStatus', v_old_status),
    jsonb_build_object('appealStatus', p_decision, 'moderationStatus', case when p_decision = 'overturned' then 'published' else v_old_status end),
    left(btrim(p_reason), 1000));
end;
$$;
revoke all on function public.resolve_marketplace_review_appeal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_marketplace_review_appeal(uuid, uuid, text, text) to service_role;

create or replace function public.resolve_marketplace_review_report(
  p_report_id uuid, p_actor_id uuid, p_decision text, p_reason text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_report public.review_reports%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_decision not in ('reviewed', 'dismissed') or char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Report decision and reason are required' using errcode = '22023';
  end if;
  select * into v_report from public.review_reports where id = p_report_id and status = 'open' for update;
  if not found then raise exception 'Open report not found' using errcode = 'P0002'; end if;
  update public.review_reports set status = p_decision,
    resolution_note = left(btrim(p_reason), 1000), resolved_by = p_actor_id, resolved_at = now()
    where id = p_report_id;
  insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values, reason)
    values (v_report.review_type, v_report.review_id, p_actor_id, 'report_resolved',
      jsonb_build_object('reportId', p_report_id, 'status', p_decision), left(btrim(p_reason), 1000));
end;
$$;
revoke all on function public.resolve_marketplace_review_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_marketplace_review_report(uuid, uuid, text, text) to service_role;

insert into public.review_rating_summaries (target_type, target_id)
select 'listing', id from public.posts where listing_type in ('CLOTHING', 'FABRIC')
on conflict do nothing;
insert into public.review_rating_summaries (target_type, target_id)
select 'seller', id from public.profiles where role in ('tailor', 'fabric_seller')
on conflict do nothing;
do $$
declare target record;
begin
  for target in select id from public.posts where listing_type in ('CLOTHING', 'FABRIC') loop
    perform public.recalculate_listing_review_summary(target.id);
  end loop;
  for target in select id from public.profiles where role in ('tailor', 'fabric_seller') loop
    perform public.recalculate_seller_review_summary(target.id);
  end loop;
end $$;

revoke all on function public.recalculate_listing_review_summary(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_seller_review_summary(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_listing_review_summary(uuid) to service_role;
grant execute on function public.recalculate_seller_review_summary(uuid) to service_role;

comment on table public.listing_reviews is
  'Firsthand, moderation-gated listing feedback; never purchase-verified. Reviews are retained only while their reviewer and target profiles exist.';
comment on table public.seller_reviews is
  'Firsthand, moderation-gated seller feedback; never purchase-verified. Reviews are retained only while their reviewer and target profiles exist.';
comment on table public.review_audit_log is
  'Audit metadata retained when review records are deleted; personal review content is scrubbed by review deletion triggers.';
comment on column public.review_rating_config.edit_window is
  'Maximum interval after submission during which a reviewer may edit their feedback; default is 14 days.';

commit;
