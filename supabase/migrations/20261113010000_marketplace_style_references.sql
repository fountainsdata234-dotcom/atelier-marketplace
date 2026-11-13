create table if not exists public.marketplace_style_references (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  storage_path text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_style_references_created_idx
  on public.marketplace_style_references (created_at desc, id desc);

alter table public.marketplace_style_references enable row level security;

drop policy if exists "Marketplace style references are publicly readable" on public.marketplace_style_references;
create policy "Marketplace style references are publicly readable"
  on public.marketplace_style_references for select using (true);
