alter table public.profiles
  add column if not exists promotion_targeting jsonb not null default '{}'::jsonb;
