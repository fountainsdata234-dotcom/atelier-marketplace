create table if not exists public.seller_collections (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  image_urls text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

alter table public.seller_collections enable row level security;

drop policy if exists "Seller collections are publicly readable" on public.seller_collections;
create policy "Seller collections are publicly readable"
  on public.seller_collections for select using (true);

drop policy if exists "Sellers can create their own collections" on public.seller_collections;
create policy "Sellers can create their own collections"
  on public.seller_collections for insert
  with check (seller_id = auth.uid() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('tailor', 'fabric_seller') and not is_blocked
  ));

drop policy if exists "Sellers can update their own collections" on public.seller_collections;
create policy "Sellers can update their own collections"
  on public.seller_collections for update
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

drop policy if exists "Sellers can delete their own collections" on public.seller_collections;
create policy "Sellers can delete their own collections"
  on public.seller_collections for delete
  using (seller_id = auth.uid() or public.is_admin());

alter table public.discovery_events
  drop constraint if exists discovery_events_user_id_fkey;
alter table public.discovery_events
  add constraint discovery_events_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
