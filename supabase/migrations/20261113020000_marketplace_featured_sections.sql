alter table public.posts
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_at timestamptz,
  add column if not exists featured_until timestamptz,
  add column if not exists featured_by uuid references public.profiles(id) on delete set null;

alter table public.posts
  add constraint posts_featured_state_check
  check (not is_featured or (featured_at is not null and featured_until is not null));

drop index if exists public.posts_marketplace_relevance_idx;

create index if not exists posts_marketplace_featured_idx
  on public.posts (featured_until, featured_at desc, id)
  where is_featured = true
    and status = 'published'
    and moderation_status = 'approved'
    and deleted_at is null
    and availability <> 'unavailable'
    and is_blocked = false;
