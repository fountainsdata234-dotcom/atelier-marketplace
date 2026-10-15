alter table public.posts
  add column if not exists listing_type text,
  add column if not exists category_id text,
  add column if not exists currency text,
  add column if not exists location jsonb,
  add column if not exists image_assets jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'published',
  add column if not exists published_at timestamptz,
  add column if not exists stock_quantity numeric(18, 3),
  add column if not exists availability text not null default 'available',
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_note text not null default '',
  add column if not exists listing_details jsonb not null default '{}'::jsonb,
  add column if not exists price_min numeric(18, 2),
  add column if not exists price_max numeric(18, 2),
  add column if not exists deleted_at timestamptz,
  add column if not exists search_document tsvector
    generated always as (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(description, '')), 'B')
      || setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'C')
      || to_tsvector('simple', coalesce(category_id, '') || ' ' || coalesce(listing_type, '') || ' ' || coalesce(listing_details::text, ''))
    ) stored;

update public.posts
set listing_type = case
      when exists (select 1 from public.profiles p where p.id = posts.author_id and p.role = 'fabric_seller') then 'FABRIC'
      else 'CLOTHING'
    end,
    currency = coalesce(nullif(pricing->>'currency', ''), 'USD'),
    location = coalesce((select p.location from public.profiles p where p.id = posts.author_id), '{}'::jsonb),
    published_at = coalesce(published_at, created_at)
where listing_type is null;

alter table public.posts
  alter column listing_type set default 'CLOTHING',
  alter column listing_type set not null,
  alter column currency set default 'USD',
  alter column currency set not null,
  alter column location set default '{}'::jsonb,
  alter column location set not null,
  alter column moderation_status set default 'approved',
  alter column moderation_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_listing_type_check') then
    alter table public.posts add constraint posts_listing_type_check
      check (listing_type in ('CLOTHING', 'FABRIC', 'TAILOR_PORTFOLIO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_listing_status_check') then
    alter table public.posts add constraint posts_listing_status_check
      check (status in ('draft', 'pending_review', 'published', 'rejected', 'paused', 'sold_out', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_moderation_status_check') then
    alter table public.posts add constraint posts_moderation_status_check
      check (moderation_status in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_availability_check') then
    alter table public.posts add constraint posts_availability_check
      check (availability in ('available', 'made_to_order', 'limited', 'unavailable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_price_range_check') then
    alter table public.posts add constraint posts_price_range_check
      check (
        (price_min is null or price_min >= 0)
        and (price_max is null or price_max >= 0)
        and (price_min is null or price_max is null or price_max >= price_min)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_stock_quantity_check') then
    alter table public.posts add constraint posts_stock_quantity_check
      check (stock_quantity is null or stock_quantity >= 0);
  end if;
end $$;

alter table public.posts alter column status set default 'draft';
alter table public.posts alter column moderation_status set default 'pending';

create table if not exists public.listing_changes (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.posts(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

alter table public.listing_changes enable row level security;
alter table public.listing_reports enable row level security;

drop policy if exists "Posts are publicly readable and not blocked" on public.posts;
drop policy if exists "Published listings are publicly readable" on public.posts;
create policy "Published listings are publicly readable"
  on public.posts for select using (
    status = 'published'
    and moderation_status = 'approved'
    and deleted_at is null
    and not is_blocked
    and availability <> 'unavailable'
    and not exists (select 1 from public.profiles p where p.id = posts.author_id and p.is_blocked)
  );

drop policy if exists "Seller-owned posts are insertable" on public.posts;
drop policy if exists "Posts can be edited by owner or admin" on public.posts;
drop policy if exists "Listings can be edited by owner or admin" on public.posts;
create policy "Listings are mutated through the authorized API"
  on public.posts for all using (false) with check (false);

drop policy if exists "Posts can be deleted by owner or admin" on public.posts;
drop policy if exists "Listings can be deleted by owner or admin" on public.posts;

create index if not exists posts_listing_feed_idx
  on public.posts (published_at desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and not is_blocked;
create index if not exists posts_search_document_idx on public.posts using gin (search_document);
create index if not exists posts_owner_status_idx on public.posts (author_id, updated_at desc) where deleted_at is null;
create index if not exists listing_reports_open_idx on public.listing_reports (created_at desc) where status = 'open';
