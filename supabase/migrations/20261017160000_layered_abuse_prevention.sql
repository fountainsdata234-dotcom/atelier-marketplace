begin;

create table if not exists public.marketplace_abuse_rate_config (
  action text primary key,
  window_seconds integer not null check (window_seconds > 0),
  account_limit integer not null check (account_limit > 0),
  session_limit integer not null check (session_limit > 0)
);

insert into public.marketplace_abuse_rate_config (action, window_seconds, account_limit, session_limit)
values
  ('event_view', 60, 30, 20),
  ('event_intent', 60, 20, 12),
  ('like', 60, 10, 10),
  ('save', 60, 12, 12),
  ('listing_write', 3600, 10, 10),
  ('profile_write', 3600, 10, 10),
  ('image_upload', 3600, 20, 20),
  ('listing_report', 86400, 10, 10),
  ('review_write', 86400, 5, 5),
  ('review_helpful', 60, 30, 20),
  ('review_report', 86400, 5, 5),
  ('review_appeal', 86400, 3, 3),
  ('seller_block', 3600, 50, 50),
  ('admin_account_enforcement', 3600, 30, 30)
on conflict (action) do nothing;

alter table public.marketplace_abuse_rate_config enable row level security;
revoke all on public.marketplace_abuse_rate_config from public, anon, authenticated;
grant all on public.marketplace_abuse_rate_config to service_role;

create table if not exists public.marketplace_abuse_rate_buckets (
  action text not null references public.marketplace_abuse_rate_config(action) on delete cascade,
  subject_type text not null check (subject_type in ('account', 'session')),
  subject_key text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (action, subject_type, subject_key, bucket_start)
);
create index if not exists marketplace_abuse_rate_buckets_expiry_idx
  on public.marketplace_abuse_rate_buckets (bucket_start);
alter table public.marketplace_abuse_rate_buckets enable row level security;
revoke all on public.marketplace_abuse_rate_buckets from public, anon, authenticated;
grant all on public.marketplace_abuse_rate_buckets to service_role;

create table if not exists public.marketplace_abuse_flags (
  id bigint generated always as identity primary key,
  action text not null,
  flag_type text not null check (char_length(flag_type) between 1 and 80),
  dedupe_key text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid,
  signal_hash text check (signal_hash is null or signal_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketplace_abuse_flags_dedupe_idx
  on public.marketplace_abuse_flags (dedupe_key);
create index if not exists marketplace_abuse_flags_queue_idx
  on public.marketplace_abuse_flags (severity, created_at desc)
  where status in ('open', 'investigating');
create index if not exists marketplace_abuse_flags_actor_idx
  on public.marketplace_abuse_flags (actor_id, created_at desc)
  where actor_id is not null;
alter table public.marketplace_abuse_flags enable row level security;
revoke all on public.marketplace_abuse_flags from public, anon, authenticated;
grant all on public.marketplace_abuse_flags to service_role;
grant usage, select on sequence public.marketplace_abuse_flags_id_seq to service_role;

create or replace function public.consume_marketplace_abuse_limit(
  p_action text,
  p_actor_id uuid default null,
  p_session_hash text default null,
  p_target_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.marketplace_abuse_rate_config%rowtype;
  v_subject_type text;
  v_subject_key text;
  v_bucket_start timestamptz;
  v_limit integer;
  v_request_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_action is null or (p_actor_id is null and p_session_hash is null)
    or (p_session_hash is not null and p_session_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid marketplace rate-limit subject' using errcode = '22023';
  end if;

  select * into v_config from public.marketplace_abuse_rate_config
  where action = p_action;
  if not found then
    raise exception 'Unknown marketplace rate-limit action' using errcode = '22023';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from now()) / v_config.window_seconds) * v_config.window_seconds
  );

  foreach v_subject_type in array array['account', 'session'] loop
    if v_subject_type = 'account' then
      if p_actor_id is null then continue; end if;
      v_subject_key := p_actor_id::text;
      v_limit := v_config.account_limit;
    else
      if p_session_hash is null then continue; end if;
      v_subject_key := p_session_hash;
      v_limit := v_config.session_limit;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_action || ':' || v_subject_type || ':' || v_subject_key, 0)
    );
    insert into public.marketplace_abuse_rate_buckets (
      action, subject_type, subject_key, bucket_start, request_count
    ) values (
      p_action, v_subject_type, v_subject_key, v_bucket_start, 1
    )
    on conflict (action, subject_type, subject_key, bucket_start)
    do update set request_count = public.marketplace_abuse_rate_buckets.request_count + 1,
      updated_at = now()
    returning request_count into v_request_count;

    if v_request_count > v_limit then
      insert into public.marketplace_abuse_flags (
        action, flag_type, dedupe_key, severity, actor_id, target_id, signal_hash, evidence
      ) values (
        p_action, 'rate_limit_exceeded',
        md5(p_action || ':' || v_subject_type || ':' || v_subject_key || ':' || v_bucket_start::text),
        'low', p_actor_id, p_target_id,
        case when v_subject_type = 'session' then v_subject_key else p_session_hash end,
        jsonb_build_object(
          'subjectType', v_subject_type,
          'requestCount', v_request_count,
          'configuredLimit', v_limit,
          'windowSeconds', v_config.window_seconds
        )
      ) on conflict (dedupe_key) do nothing;
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.consume_marketplace_abuse_limit(text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_marketplace_abuse_limit(text, uuid, text, uuid)
  to service_role;

alter table public.marketplace_engagement_events
  add column if not exists qualification_status text not null default 'qualified'
    check (qualification_status in ('qualified', 'raw_only', 'legacy_unreviewed')),
  add column if not exists qualification_reason text not null default 'server_validated'
    check (char_length(qualification_reason) <= 120);

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
  v_rate_action text;
  v_idempotency_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to record marketplace events' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in ('IMPRESSION', 'VIEW', 'SHARE', 'ENQUIRY', 'HIDE')
    or p_listing_id is null
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid marketplace event' using errcode = '22023';
  end if;
  if p_event_type = 'HIDE' and p_actor_id is null then
    raise exception 'Authentication is required to hide a listing' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.id = p_listing_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published' and post.moderation_status = 'approved'
      and post.deleted_at is null and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false
      and (p_actor_id is null or (
        post.author_id <> p_actor_id
        and not exists (
          select 1 from public.user_blocks block
          where (block.blocker_id = p_actor_id and block.blocked_user_id = post.author_id)
             or (block.blocker_id = post.author_id and block.blocked_user_id = p_actor_id)
        )
      ))
  ) then
    return 'ineligible';
  end if;
  if p_actor_id is not null and exists (
    select 1 from public.profiles where id = p_actor_id and is_blocked = true
  ) then
    return 'ineligible';
  end if;

  v_rate_action := case when p_event_type in ('VIEW', 'IMPRESSION') then 'event_view' else 'event_intent' end;
  if not public.consume_marketplace_abuse_limit(v_rate_action, p_actor_id, p_session_hash, p_listing_id) then
    return 'rate_limited';
  end if;

  v_dedupe_interval := case when p_event_type in ('IMPRESSION', 'HIDE') then interval '24 hours'
    else interval '30 minutes' end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'marketplace-event:' || p_listing_id::text || ':' || p_event_type || ':' ||
      coalesce(p_actor_id::text, p_session_hash), 0
    )
  );
  if exists (
    select 1 from public.marketplace_engagement_events event
    where event.listing_id = p_listing_id
      and event.event_type = p_event_type
      and event.occurred_at >= now() - v_dedupe_interval
      and ((p_actor_id is not null and event.actor_id = p_actor_id)
        or event.session_hash = p_session_hash)
  ) then
    return 'duplicate';
  end if;

  v_idempotency_key := md5(concat_ws('|', p_listing_id::text, p_event_type,
    coalesce(p_actor_id::text, ''), p_session_hash,
    floor(extract(epoch from now()) / 1800)::bigint::text));
  insert into public.marketplace_engagement_events (
    listing_id, event_type, actor_id, session_hash, idempotency_key,
    qualification_status, qualification_reason
  ) values (
    p_listing_id, p_event_type, p_actor_id, p_session_hash, v_idempotency_key,
    'qualified', 'server_validated_and_deduplicated'
  ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
  if not found then return 'duplicate'; end if;
  return 'recorded';
end;
$$;
revoke all on function public.record_marketplace_engagement_event(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_marketplace_engagement_event(uuid, text, uuid, text)
  to service_role;

create or replace function public.enforce_marketplace_reaction_abuse_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_listing_id uuid;
  v_author_id uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for marketplace reactions' using errcode = '42501';
  end if;
  v_actor_id := new.user_id;
  v_listing_id := new.post_id;
  select post.author_id into v_author_id
  from public.posts post join public.profiles seller on seller.id = post.author_id
  where post.id = v_listing_id
    and post.listing_type in ('CLOTHING', 'FABRIC')
    and post.status = 'published' and post.moderation_status = 'approved'
    and post.deleted_at is null and not post.is_blocked
    and post.availability in ('available', 'limited', 'made_to_order')
    and not seller.is_blocked;
  if v_author_id is null then
    raise exception 'Listing is not eligible for reactions' using errcode = 'P0002';
  end if;
  if v_actor_id = v_author_id then
    raise exception 'Sellers cannot react to their own listings' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_actor_id and is_blocked)
    or not exists (select 1 from public.profiles where id = v_actor_id) then
    raise exception 'Account cannot react to listings' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = v_actor_id and block.blocked_user_id = v_author_id)
       or (block.blocker_id = v_author_id and block.blocked_user_id = v_actor_id)
  ) then
    raise exception 'This interaction is unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists post_likes_abuse_controls on public.post_likes;
create trigger post_likes_abuse_controls
before insert on public.post_likes
for each row execute function public.enforce_marketplace_reaction_abuse_controls();
drop trigger if exists post_saves_abuse_controls on public.post_saves;
create trigger post_saves_abuse_controls
before insert on public.post_saves
for each row execute function public.enforce_marketplace_reaction_abuse_controls();

create or replace function public.enforce_marketplace_review_abuse_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for review mutations' using errcode = '42501';
  end if;
  if new.reviewer_id = new.seller_id then
    raise exception 'Self-reviews are not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = new.reviewer_id and not is_blocked and role <> 'admin'
  ) then
    raise exception 'This account cannot submit a review' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = new.reviewer_id and block.blocked_user_id = new.seller_id)
       or (block.blocker_id = new.seller_id and block.blocked_user_id = new.reviewer_id)
  ) then
    raise exception 'This review target is unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists listing_reviews_abuse_controls on public.listing_reviews;
create trigger listing_reviews_abuse_controls
before insert or update of reviewer_id, seller_id, listing_id, rating, review_text,
  category_breakdown, firsthand_attested
on public.listing_reviews
for each row execute function public.enforce_marketplace_review_abuse_controls();
drop trigger if exists seller_reviews_abuse_controls on public.seller_reviews;
create trigger seller_reviews_abuse_controls
before insert or update of reviewer_id, seller_id, listing_id, rating, review_text,
  category_breakdown, firsthand_attested
on public.seller_reviews
for each row execute function public.enforce_marketplace_review_abuse_controls();

create or replace function public.flag_marketplace_review_patterns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller_recent_count integer;
  v_text_fingerprint text;
  v_repeat_count integer;
begin
  v_text_fingerprint := md5(lower(regexp_replace(btrim(coalesce(new.review_text, '')), '\s+', ' ', 'g')));
  select count(*)::integer into v_seller_recent_count
  from (
    select reviewer_id from public.listing_reviews
    where seller_id = new.seller_id and created_at >= now() - interval '1 hour'
    union all
    select reviewer_id from public.seller_reviews
    where seller_id = new.seller_id and created_at >= now() - interval '1 hour'
  ) recent;
  if v_seller_recent_count >= 5 then
    insert into public.marketplace_abuse_flags (
      action, flag_type, dedupe_key, severity, actor_id, target_id, evidence
    ) values (
      'review', 'seller_review_burst',
      md5('seller_review_burst:' || new.seller_id::text || ':' || date_trunc('hour', now())::text),
      'medium', new.reviewer_id, new.seller_id,
      jsonb_build_object('reviewsInLastHour', v_seller_recent_count)
    ) on conflict (dedupe_key) do nothing;
  end if;
  if length(btrim(coalesce(new.review_text, ''))) >= 20 then
    select count(*)::integer into v_repeat_count
    from (
      select reviewer_id from public.listing_reviews
      where reviewer_id <> new.reviewer_id
        and md5(lower(regexp_replace(btrim(review_text), '\s+', ' ', 'g'))) = v_text_fingerprint
        and created_at >= now() - interval '30 days'
      union all
      select reviewer_id from public.seller_reviews
      where reviewer_id <> new.reviewer_id
        and md5(lower(regexp_replace(btrim(review_text), '\s+', ' ', 'g'))) = v_text_fingerprint
        and created_at >= now() - interval '30 days'
    ) repeated;
    if v_repeat_count > 0 then
      insert into public.marketplace_abuse_flags (
        action, flag_type, dedupe_key, severity, actor_id, target_id, evidence
      ) values (
        'review', 'repeated_review_text',
        md5('repeated_review_text:' || v_text_fingerprint || ':' || date_trunc('day', now())::text),
        'low', new.reviewer_id, new.seller_id,
        jsonb_build_object('matchingReviewCount', v_repeat_count)
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists listing_reviews_pattern_flags on public.listing_reviews;
create trigger listing_reviews_pattern_flags
after insert on public.listing_reviews
for each row execute function public.flag_marketplace_review_patterns();
drop trigger if exists seller_reviews_pattern_flags on public.seller_reviews;
create trigger seller_reviews_pattern_flags
after insert on public.seller_reviews
for each row execute function public.flag_marketplace_review_patterns();

create or replace function public.enforce_marketplace_listing_report_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required to report listings' using errcode = '42501';
  end if;
  select author_id into v_owner_id from public.posts
  where id = new.listing_id
    and status = 'published' and moderation_status = 'approved'
    and deleted_at is null and not is_blocked;
  if v_owner_id is null then
    raise exception 'Published listing not found' using errcode = 'P0002';
  end if;
  if new.reporter_id = v_owner_id then
    raise exception 'You cannot report your own listing' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = new.reporter_id and not is_blocked) then
    raise exception 'This account cannot report listings' using errcode = '42501';
  end if;
  if new.reason not in ('Misleading content', 'Prohibited item', 'Impersonation', 'Inappropriate content', 'Other')
    or char_length(coalesce(new.details, '')) > 1000 then
    raise exception 'Invalid listing report' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists listing_reports_abuse_controls on public.listing_reports;
create trigger listing_reports_abuse_controls
before insert on public.listing_reports
for each row execute function public.enforce_marketplace_listing_report_controls();

create or replace function public.set_marketplace_user_block(
  p_actor_id uuid,
  p_blocked_user_id uuid,
  p_is_blocked boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_actor_id is null or p_blocked_user_id is null or p_blocked_user_id = p_actor_id
    or p_is_blocked is null then
    raise exception 'Invalid block target' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_blocked_user_id and role in ('tailor', 'fabric_seller') and not is_blocked
  ) then
    raise exception 'Seller is not available to block' using errcode = 'P0002';
  end if;
  if not public.consume_marketplace_abuse_limit('seller_block', p_actor_id, null, p_blocked_user_id) then
    return 'rate_limited';
  end if;
  if p_is_blocked then
    insert into public.user_blocks (blocker_id, blocked_user_id)
    values (p_actor_id, p_blocked_user_id)
    on conflict (blocker_id, blocked_user_id) do nothing;
  else
    delete from public.user_blocks
    where blocker_id = p_actor_id and blocked_user_id = p_blocked_user_id;
  end if;
  insert into public.marketplace_audit_log (
    actor_id, action, target_type, target_id, changes
  ) values (
    p_actor_id, case when p_is_blocked then 'seller_blocked' else 'seller_unblocked' end,
    'seller', p_blocked_user_id::text,
    jsonb_build_object('blocked', p_is_blocked)
  );
  return case when p_is_blocked then 'blocked' else 'unblocked' end;
end;
$$;
revoke all on function public.set_marketplace_user_block(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_marketplace_user_block(uuid, uuid, boolean)
  to service_role;

create or replace function public.get_marketplace_blocked_seller_ids(p_blocker_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_blocker_id is null then return array[]::uuid[]; end if;
  return coalesce((
    select array_agg(blocked_user_id order by blocked_user_id)
    from public.user_blocks where blocker_id = p_blocker_id
  ), array[]::uuid[]);
end;
$$;
revoke all on function public.get_marketplace_blocked_seller_ids(uuid)
  from public, anon, authenticated;
grant execute on function public.get_marketplace_blocked_seller_ids(uuid)
  to service_role;

create or replace function public.resolve_marketplace_abuse_flag(
  p_flag_id bigint,
  p_actor_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag public.marketplace_abuse_flags%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('investigating', 'resolved', 'dismissed')
    or p_actor_id is null
    or char_length(btrim(coalesce(p_reason, ''))) < 5
    or not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and not is_blocked) then
    raise exception 'An authorized administrator, status and reason are required' using errcode = '42501';
  end if;
  select * into v_flag from public.marketplace_abuse_flags
  where id = p_flag_id and status in ('open', 'investigating')
  for update;
  if not found then raise exception 'Open abuse flag not found' using errcode = 'P0002'; end if;
  update public.marketplace_abuse_flags
  set status = p_status, resolution_note = left(btrim(p_reason), 1000),
      reviewed_by = p_actor_id, updated_at = now()
  where id = p_flag_id;
  insert into public.marketplace_audit_log (
    actor_id, action, target_type, target_id, changes
  ) values (
    p_actor_id, 'abuse_flag_' || p_status, 'marketplace_abuse_flag', p_flag_id::text,
    jsonb_build_object('previousStatus', v_flag.status, 'status', p_status, 'reason', left(btrim(p_reason), 1000))
  );
end;
$$;
revoke all on function public.resolve_marketplace_abuse_flag(bigint, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_marketplace_abuse_flag(bigint, uuid, text, text)
  to service_role;

create or replace function public.resolve_marketplace_listing_report(
  p_report_id uuid,
  p_actor_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.listing_reports%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('reviewed', 'dismissed')
    or char_length(btrim(coalesce(p_reason, ''))) < 5
    or not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and not is_blocked) then
    raise exception 'An authorized administrator, status and reason are required' using errcode = '42501';
  end if;
  select * into v_report from public.listing_reports
  where id = p_report_id and status = 'open'
  for update;
  if not found then raise exception 'Open listing report not found' using errcode = 'P0002'; end if;
  update public.listing_reports set status = p_status where id = p_report_id;
  insert into public.marketplace_audit_log (
    actor_id, action, target_type, target_id, changes
  ) values (
    p_actor_id, 'listing_report_' || p_status, 'listing_report', p_report_id::text,
    jsonb_build_object(
      'listingId', v_report.listing_id,
      'reporterId', v_report.reporter_id,
      'previousStatus', v_report.status,
      'status', p_status,
      'reason', left(btrim(p_reason), 1000)
    )
  );
end;
$$;
revoke all on function public.resolve_marketplace_listing_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_marketplace_listing_report(uuid, uuid, text, text)
  to service_role;

create or replace function public.set_marketplace_account_block(
  p_actor_id uuid,
  p_target_id uuid,
  p_is_blocked boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_actor_id is null or p_target_id is null or p_target_id = p_actor_id or p_is_blocked is null
    or char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Administrator, target, and reason are required' using errcode = '22023';
  end if;
  select * into v_actor from public.profiles where id = p_actor_id and role = 'admin' and not is_blocked;
  if not found then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select * into v_target from public.profiles where id = p_target_id for update;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_target.role not in ('tailor', 'fabric_seller', 'admin') then
    raise exception 'Only seller or administrator accounts can be blocked here' using errcode = '22023';
  end if;
  if v_target.role = 'admin' and lower(coalesce(v_actor.email, '')) <> 'fountainsdata234@gmail.com' then
    raise exception 'Only the primary administrator may block an administrator' using errcode = '42501';
  end if;
  update public.profiles
  set is_blocked = p_is_blocked, updated_at = now()
  where id = p_target_id;
  insert into public.marketplace_audit_log (
    actor_id, action, target_type, target_id, changes
  ) values (
    p_actor_id, case when p_is_blocked then 'account_blocked' else 'account_unblocked' end,
    'profile', p_target_id::text,
    jsonb_build_object('previousBlocked', v_target.is_blocked, 'blocked', p_is_blocked,
      'reason', left(btrim(p_reason), 1000))
  );
end;
$$;
revoke all on function public.set_marketplace_account_block(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_marketplace_account_block(uuid, uuid, boolean, text)
  to service_role;

create or replace function public.capture_marketplace_interaction_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
begin
  if tg_table_name = 'post_likes' then
    v_event_type := 'LIKE';
  elsif tg_table_name = 'post_saves' then
    v_event_type := 'SAVE';
  else
    return new;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  insert into public.marketplace_engagement_events (
    listing_id, event_type, actor_id, qualification_status, qualification_reason
  )
  select new.post_id, v_event_type, new.user_id, 'qualified', 'server_validated_reaction'
  where exists (
    select 1 from public.posts post
    join public.profiles seller on seller.id = post.author_id
    join public.profiles actor on actor.id = new.user_id
    where post.id = new.post_id
      and post.author_id <> new.user_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published' and post.moderation_status = 'approved'
      and post.deleted_at is null and not post.is_blocked
      and post.availability in ('available', 'limited', 'made_to_order')
      and not seller.is_blocked and not actor.is_blocked
      and not exists (
        select 1 from public.user_blocks block
        where (block.blocker_id = new.user_id and block.blocked_user_id = post.author_id)
           or (block.blocker_id = post.author_id and block.blocked_user_id = new.user_id)
      )
  )
  and not exists (
    select 1 from public.marketplace_engagement_events event
    where event.listing_id = new.post_id
      and event.event_type = v_event_type
      and event.actor_id = new.user_id
      and event.occurred_at >= now() - interval '24 hours'
  );
  return new;
end;
$$;
revoke all on function public.capture_marketplace_interaction_event()
  from public, anon, authenticated;

create or replace function public.purge_marketplace_abuse_data()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  delete from public.marketplace_abuse_rate_buckets
  where bucket_start < now() - interval '8 days';
  get diagnostics v_removed = row_count;
  delete from public.marketplace_abuse_flags
  where status in ('resolved', 'dismissed') and updated_at < now() - interval '180 days';
  return v_removed;
end;
$$;
revoke all on function public.purge_marketplace_abuse_data()
  from public, anon, authenticated;
grant execute on function public.purge_marketplace_abuse_data()
  to service_role;

revoke all on function public.enforce_marketplace_reaction_abuse_controls(),
  public.enforce_marketplace_review_abuse_controls(),
  public.flag_marketplace_review_patterns(),
  public.enforce_marketplace_listing_report_controls(),
  public.capture_marketplace_interaction_event()
  from public, anon, authenticated;

commit;