alter table public.profiles
  add column if not exists collection_slots_purchased integer not null default 0 check (collection_slots_purchased >= 0 and collection_slots_purchased <= 28);

create table if not exists public.collection_slot_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null default 50000 check (amount = 50000),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'refunded')),
  email text not null default '',
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
