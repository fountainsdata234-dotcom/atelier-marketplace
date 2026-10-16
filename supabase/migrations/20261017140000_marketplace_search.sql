create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

create or replace function public.refresh_post_search_document()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  seller public.profiles%rowtype;
begin
  select * into seller from public.profiles where id = new.author_id;
  new.search_document :=
    setweight(to_tsvector('simple'::regconfig, coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.category_id, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.description, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(new.tags, ' '), '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(new.listing_type, '') || ' ' || coalesce(new.listing_details::text, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, concat_ws(' ',
      seller.name, seller.shop_name, seller.handle,
      seller.location->>'city', seller.location->>'state', seller.location->>'country'
    )), 'D');
  return new;
end;
$$;

create or replace function public.refresh_profile_listing_search_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.posts p
  set search_document =
    setweight(to_tsvector('simple'::regconfig, coalesce(p.title, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(p.category_id, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(p.description, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(p.tags, ' '), '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(p.listing_type, '') || ' ' || coalesce(p.listing_details::text, '')), 'C')
    || setweight(to_tsvector('simple'::regconfig, concat_ws(' ',
      new.name, new.shop_name, new.handle,
      new.location->>'city', new.location->>'state', new.location->>'country'
    )), 'D')
  where p.author_id = new.id;
  return new;
end;
$$;

drop trigger if exists profiles_search_document_refresh on public.profiles;
create trigger profiles_search_document_refresh
after update of name, shop_name, handle, location on public.profiles
for each row execute function public.refresh_profile_listing_search_documents();

revoke all on function public.refresh_profile_listing_search_documents() from public, anon, authenticated;

create index if not exists posts_title_trigram_search_idx
  on public.posts using gin (lower(title) gin_trgm_ops);

update public.posts p
set search_document =
  setweight(to_tsvector('simple'::regconfig, coalesce(p.title, '')), 'A')
  || setweight(to_tsvector('simple'::regconfig, coalesce(p.category_id, '')), 'A')
  || setweight(to_tsvector('simple'::regconfig, coalesce(p.description, '')), 'B')
  || setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(p.tags, ' '), '')), 'B')
  || setweight(to_tsvector('simple'::regconfig, coalesce(p.listing_type, '') || ' ' || coalesce(p.listing_details::text, '')), 'C')
  || setweight(to_tsvector('simple'::regconfig, concat_ws(' ',
    seller.name, seller.shop_name, seller.handle,
    seller.location->>'city', seller.location->>'state', seller.location->>'country'
  )), 'D')
from public.profiles seller
where seller.id = p.author_id;

create table if not exists public.marketplace_search_audit_events (
  id bigint generated always as identity primary key,
  search_text text not null check (char_length(search_text) between 2 and 80),
  event_type text not null check (event_type in ('impression', 'click', 'save', 'enquiry')),
  listing_id uuid references public.posts(id) on delete set null,
  result_count integer check (result_count is null or result_count between 0 and 10000),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.marketplace_search_audit_events enable row level security;
revoke all on public.marketplace_search_audit_events from public, anon, authenticated;
grant all on public.marketplace_search_audit_events to service_role;
create index if not exists marketplace_search_audit_created_idx
  on public.marketplace_search_audit_events (created_at);
create index if not exists marketplace_search_audit_query_created_idx
  on public.marketplace_search_audit_events (search_text, created_at);

create or replace function public.record_marketplace_search_audit_event(
  p_search_text text,
  p_event_type text,
  p_session_hash text,
  p_listing_id uuid default null,
  p_result_count integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if length(trim(coalesce(p_search_text, ''))) < 2
    or length(p_search_text) > 80
    or p_event_type not in ('impression', 'click', 'save', 'enquiry')
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or (p_event_type = 'impression' and (p_result_count is null or p_result_count < 0 or p_result_count > 10000))
    or (p_event_type <> 'impression' and (p_listing_id is null or p_result_count is not null))
  then
    raise exception 'Invalid marketplace search audit event.';
  end if;

  if p_listing_id is not null and not exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where p.id = p_listing_id and p.status = 'published'
      and p.moderation_status = 'approved' and p.deleted_at is null
      and p.is_blocked = false and p.availability <> 'unavailable'
      and pr.is_blocked = false and p.published_at is not null
  ) then
    raise exception 'Listing is not eligible for search audit.';
  end if;

  if (select count(*) from public.marketplace_search_audit_events
    where session_hash = p_session_hash and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Marketplace search event rate limit exceeded.';
  end if;

  delete from public.marketplace_search_audit_events
  where created_at < now() - interval '30 days';

  insert into public.marketplace_search_audit_events
    (search_text, event_type, listing_id, result_count, session_hash)
  values
    (lower(trim(p_search_text)), p_event_type, p_listing_id, p_result_count, p_session_hash);
end;
$$;

revoke all on function public.record_marketplace_search_audit_event(text, text, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.record_marketplace_search_audit_event(text, text, text, uuid, integer)
  to service_role;

create or replace function public.search_marketplace_listing_ids(
  p_term_groups jsonb,
  p_search_text text,
  p_location_hint text default '',
  p_view text default 'all',
  p_category_id text default null,
  p_tag text default null,
  p_country text default null,
  p_state text default null,
  p_city text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_currency text default null,
  p_material text default null,
  p_colour text default null,
  p_size text default null,
  p_fulfilment text default null,
  p_availability text default null,
  p_cursor_score double precision default null,
  p_cursor_id uuid default null,
  p_limit integer default 25
)
returns table (listing_id uuid, search_score double precision, location_match boolean)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_query tsquery := ''::tsquery;
  v_group jsonb;
  v_term text;
  v_alternatives tsquery;
  v_piece tsquery;
begin
  if p_term_groups is null or jsonb_typeof(p_term_groups) <> 'array'
    or length(coalesce(p_search_text, '')) > 80
    or p_view not in ('all', 'clothing', 'fabrics', 'tailors', 'for-you')
    or (p_cursor_score is null) <> (p_cursor_id is null)
    or p_min_price < 0 or p_max_price < 0
    or (p_min_price is not null and p_max_price is not null and p_min_price > p_max_price)
  then
    raise exception 'Invalid marketplace search parameters.';
  end if;
  if jsonb_array_length(p_term_groups) > 20 then
    raise exception 'Invalid marketplace search term groups.';
  end if;

  for v_group in select value from jsonb_array_elements(p_term_groups)
  loop
    if jsonb_typeof(v_group) <> 'array' then
      raise exception 'Invalid marketplace search term group.';
    end if;
    if jsonb_array_length(v_group) = 0 or jsonb_array_length(v_group) > 6 then
      raise exception 'Invalid marketplace search term group.';
    end if;
    v_alternatives := ''::tsquery;
    for v_term in select jsonb_array_elements_text(v_group)
    loop
      v_piece := plainto_tsquery('simple', left(v_term, 48));
      if v_piece <> ''::tsquery then
        v_alternatives := case when v_alternatives = ''::tsquery then v_piece else v_alternatives || v_piece end;
      end if;
    end loop;
    if v_alternatives <> ''::tsquery then
      v_query := case when v_query = ''::tsquery then v_alternatives else v_query && v_alternatives end;
    end if;
  end loop;

  if v_query = ''::tsquery then
    raise exception 'Search query does not contain searchable terms.';
  end if;

  return query
  with eligible as (
    select p.id,
      (
        ts_rank_cd(p.search_document, v_query, 32)
        + similarity(lower(p.title), lower(coalesce(p_search_text, ''))) * 0.2
        + case when lower(p.title) = lower(coalesce(p_search_text, '')) then 0.7 else 0 end
        + case when lower(coalesce(p.category_id, '')) = lower(coalesce(p_search_text, '')) then 0.5 else 0 end
        + least(0.02, ln(1 + greatest(coalesce(p.popularity_score, 0), 0)) * 0.005)
        + 0.02 * exp(-greatest(0, extract(epoch from now() - p.published_at) / 86400) / 30)
        + case when coalesce(p_location_hint, '') <> '' and strpos(lower(concat_ws(' ',
          pr.location->>'city', pr.location->>'state', pr.location->>'country'
        )), lower(p_location_hint)) > 0 then 0.1 else 0 end
      )::double precision as score,
      (coalesce(p_location_hint, '') <> '' and strpos(lower(concat_ws(' ',
        pr.location->>'city', pr.location->>'state', pr.location->>'country'
      )), lower(p_location_hint)) > 0) as in_requested_area
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where p.search_document is not null
      and (p.search_document @@ v_query or similarity(lower(p.title), lower(coalesce(p_search_text, ''))) >= 0.28)
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and p.deleted_at is null
      and p.is_blocked = false
      and p.availability <> 'unavailable'
      and p.status <> 'sold_out'
      and p.published_at is not null
      and pr.is_blocked = false
      and (p_view not in ('clothing', 'fabrics') or p.listing_type = case p_view when 'clothing' then 'CLOTHING' else 'FABRIC' end)
      and (p_view <> 'tailors' or (pr.role = 'tailor' and p.listing_type in ('CLOTHING', 'TAILOR_PORTFOLIO')))
      and (p_category_id is null or lower(coalesce(p.category_id, '')) = lower(p_category_id))
      and (p_tag is null or p_tag = any(p.tags))
      and (p_country is null or lower(coalesce(pr.location->>'country', '')) = lower(p_country))
      and (p_state is null or lower(coalesce(pr.location->>'state', '')) = lower(p_state))
      and (p_city is null or lower(coalesce(pr.location->>'city', '')) = lower(p_city))
      and (p_min_price is null or p.price_max >= p_min_price or (p.price_max is null and p.price_min >= p_min_price))
      and (p_max_price is null or p.price_min <= p_max_price)
      and (p_currency is null or upper(p.currency) = upper(p_currency))
      and (p_material is null or strpos(lower(coalesce(p.listing_details->>'material', '')), lower(p_material)) > 0)
      and (p_colour is null or strpos(lower(coalesce(p.listing_details->>'colour', '')), lower(p_colour)) > 0)
      and (p_size is null or p.listing_details->'sizes' ? p_size)
      and (p_fulfilment is null or p.listing_details->>'fulfilment' = p_fulfilment)
      and (p_availability is null or p.availability = p_availability)
  )
  select eligible.id, eligible.score, eligible.in_requested_area
  from eligible
  where p_cursor_score is null or eligible.score < p_cursor_score
    or (eligible.score = p_cursor_score and eligible.id < p_cursor_id)
  order by eligible.score desc, eligible.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 49);
end;
$$;

revoke all on function public.search_marketplace_listing_ids(
  jsonb, text, text, text, text, text, text, text, text, numeric, numeric,
  text, text, text, text, text, text, double precision, uuid, integer
) from public, anon, authenticated;
grant execute on function public.search_marketplace_listing_ids(
  jsonb, text, text, text, text, text, text, text, text, numeric, numeric,
  text, text, text, text, text, text, double precision, uuid, integer
) to service_role;
