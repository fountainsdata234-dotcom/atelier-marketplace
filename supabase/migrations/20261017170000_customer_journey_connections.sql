begin;

insert into public.marketplace_abuse_rate_config (action, window_seconds, account_limit, session_limit)
values ('recommendation_feedback', 60, 20, 20)
on conflict (action) do nothing;

alter table public.recommendation_impressions
  add column if not exists dedupe_key text;

update public.recommendation_impressions
set dedupe_key = md5(concat_ws('|', coalesce(user_id::text, ''), coalesce(session_hash, ''),
  listing_id::text, feed_name, occurred_at::text))
where dedupe_key is null;

alter table public.recommendation_impressions
  alter column dedupe_key set not null;

create unique index if not exists recommendation_impressions_dedupe_key_idx
  on public.recommendation_impressions (dedupe_key);

create or replace function public.save_marketplace_user_preferences(
  p_user_id uuid,
  p_preferences jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categories text[];
  v_styles text[];
  v_minimum bigint;
  v_maximum bigint;
  v_currency text;
  v_country text;
  v_region text;
  v_consent boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Valid user preferences are required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_user_id and not is_blocked and role <> 'admin'
  ) then
    raise exception 'This account cannot use personalized recommendations' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_preferences->'enabled', 'false'::jsonb)) <> 'boolean'
    or jsonb_typeof(coalesce(p_preferences->'categories', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_preferences->'styles', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_preferences->'categories', '[]'::jsonb)) > 20
    or jsonb_array_length(coalesce(p_preferences->'styles', '[]'::jsonb)) > 20 then
    raise exception 'Invalid preference fields' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_preferences->'categories', '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 80
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_preferences->'styles', '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 80
  ) then
    raise exception 'Preference values must be non-empty strings of at most 80 characters' using errcode = '22023';
  end if;
  v_consent := coalesce((p_preferences->>'enabled')::boolean, false);
  v_categories := array(
    select distinct left(btrim(value), 80)
    from jsonb_array_elements_text(coalesce(p_preferences->'categories', '[]'::jsonb)) value
  );
  v_styles := array(
    select distinct left(btrim(value), 80)
    from jsonb_array_elements_text(coalesce(p_preferences->'styles', '[]'::jsonb)) value
  );
  if nullif(p_preferences->>'minimumPriceMinor', '') is not null
    and p_preferences->>'minimumPriceMinor' !~ '^[0-9]{1,15}$'
    or nullif(p_preferences->>'maximumPriceMinor', '') is not null
    and p_preferences->>'maximumPriceMinor' !~ '^[0-9]{1,15}$' then
    raise exception 'Price preferences must be non-negative minor currency units' using errcode = '22023';
  end if;
  v_minimum := nullif(p_preferences->>'minimumPriceMinor', '')::bigint;
  v_maximum := nullif(p_preferences->>'maximumPriceMinor', '')::bigint;
  v_currency := nullif(upper(btrim(p_preferences->>'currency')), '');
  v_country := nullif(left(btrim(p_preferences->>'country'), 80), '');
  v_region := nullif(left(btrim(p_preferences->>'state'), 80), '');
  if (v_minimum is not null or v_maximum is not null)
    and (v_currency is null or v_currency !~ '^[A-Z]{3}$') then
    raise exception 'Choose a valid currency for a price preference' using errcode = '22023';
  end if;
  if v_minimum is not null and v_maximum is not null and v_minimum > v_maximum then
    raise exception 'Minimum price must not exceed maximum price' using errcode = '22023';
  end if;

  insert into public.user_preferences (
    user_id, consented_to_personalization, preferred_categories, preferred_styles,
    minimum_price_minor, maximum_price_minor, currency, preferred_country, preferred_region, updated_at
  ) values (
    p_user_id, v_consent, v_categories, v_styles,
    v_minimum, v_maximum, v_currency, v_country, v_region, now()
  )
  on conflict (user_id) do update set
    consented_to_personalization = excluded.consented_to_personalization,
    preferred_categories = excluded.preferred_categories,
    preferred_styles = excluded.preferred_styles,
    minimum_price_minor = excluded.minimum_price_minor,
    maximum_price_minor = excluded.maximum_price_minor,
    currency = excluded.currency,
    preferred_country = excluded.preferred_country,
    preferred_region = excluded.preferred_region,
    updated_at = now();
end;
$$;
revoke all on function public.save_marketplace_user_preferences(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_marketplace_user_preferences(uuid, jsonb)
  to service_role;

create or replace function public.reset_marketplace_personalization(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.profiles where id = p_user_id and not is_blocked and role <> 'admin'
  ) then
    raise exception 'An active account is required' using errcode = '42501';
  end if;
  delete from public.user_preferences where user_id = p_user_id;
  delete from public.user_interactions where user_id = p_user_id;
end;
$$;
revoke all on function public.reset_marketplace_personalization(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_marketplace_personalization(uuid)
  to service_role;

create or replace function public.set_marketplace_user_interaction(
  p_user_id uuid,
  p_listing_id uuid,
  p_interaction_type text,
  p_is_active boolean,
  p_session_hash text,
  p_reason text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_result text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_listing_id is null or p_is_active is null
    or p_interaction_type is null or p_interaction_type not in ('hide', 'dismiss', 'not_interested')
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'Invalid recommendation feedback' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_user_id and not is_blocked and role <> 'admin'
  ) then
    raise exception 'This account cannot update recommendation feedback' using errcode = '42501';
  end if;
  if p_is_active then
    v_event_result := public.record_marketplace_engagement_event(
      p_listing_id, 'HIDE', p_user_id, p_session_hash
    );
    if v_event_result in ('rate_limited', 'ineligible') then
      return v_event_result;
    end if;
    insert into public.user_interactions (
      user_id, listing_id, interaction_type, reason, expires_at, updated_at
    ) values (
      p_user_id, p_listing_id, p_interaction_type, btrim(p_reason),
      case when p_interaction_type = 'hide' then null else now() + interval '30 days' end,
      now()
    )
    on conflict (user_id, listing_id, interaction_type) do update set
      reason = excluded.reason,
      expires_at = excluded.expires_at,
      updated_at = now();
    return 'hidden';
  end if;
  delete from public.user_interactions
  where user_id = p_user_id and listing_id = p_listing_id
    and interaction_type = p_interaction_type;
  return 'restored';
end;
$$;
revoke all on function public.set_marketplace_user_interaction(uuid, uuid, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_marketplace_user_interaction(uuid, uuid, text, boolean, text, text)
  to service_role;

create or replace function public.record_marketplace_recommendation_impression(
  p_listing_id uuid,
  p_user_id uuid,
  p_session_hash text,
  p_feed_name text,
  p_ranked_position integer,
  p_reason_code text,
  p_experiment_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_result text;
  v_dedupe_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_listing_id is null or p_session_hash is null
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_feed_name is null or p_feed_name not in ('for_you', 'trending', 'category', 'search')
    or p_ranked_position is null or p_ranked_position not between 1 and 10000
    or char_length(coalesce(p_reason_code, '')) > 80
    or char_length(coalesce(p_experiment_version, '')) not between 1 and 80 then
    raise exception 'Invalid recommendation impression' using errcode = '22023';
  end if;
  v_event_result := public.record_marketplace_engagement_event(
    p_listing_id, 'IMPRESSION', p_user_id, p_session_hash
  );
  if v_event_result in ('rate_limited', 'ineligible') then
    return v_event_result;
  end if;
  v_dedupe_key := md5(concat_ws('|', coalesce(p_user_id::text, ''), coalesce(p_session_hash, ''),
    p_listing_id::text, p_feed_name, floor(extract(epoch from now()) / 86400)::bigint::text));
  insert into public.recommendation_impressions (
    user_id, session_hash, listing_id, feed_name, ranked_position, reason_code,
    experiment_version, occurred_at, dedupe_key
  ) values (
    p_user_id, p_session_hash, p_listing_id, p_feed_name, p_ranked_position,
    coalesce(p_reason_code, ''), p_experiment_version, now(), v_dedupe_key
  ) on conflict (dedupe_key) do nothing;
  return v_event_result;
end;
$$;
revoke all on function public.record_marketplace_recommendation_impression(uuid, uuid, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.record_marketplace_recommendation_impression(uuid, uuid, text, text, integer, text, text)
  to service_role;

commit;
