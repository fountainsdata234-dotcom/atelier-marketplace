create table if not exists public.premium_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null check (plan_id in ('starter', 'professional', 'premium')),
  amount bigint not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'abandoned', 'refunded')),
  email text not null default '',
  provider_data jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists premium_payments_user_created_idx
  on public.premium_payments(user_id, created_at desc);

alter table public.profiles
  add column if not exists promotion_expires_at timestamptz;
