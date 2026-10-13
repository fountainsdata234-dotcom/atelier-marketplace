-- Atelier Supabase schema
-- Run this through the Supabase SQL editor after configuring the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'buyer' check (role in ('buyer', 'tailor', 'fabric_seller', 'admin')),
  phone text not null default '',
  country_code text not null default '',
  location jsonb not null default '{}'::jsonb,
  whatsapp_number text not null default '',
  shop_name text not null default '',
  bio text not null default '',
  handle text not null default '',
  avatar_url text,
  is_promoted boolean not null default false,
  is_blocked boolean not null default false,
  is_warned boolean not null default false,
  warning_note text not null default '',
  followers uuid[] not null default array[]::uuid[],
  is_super_admin boolean not null default false,
  added_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  image_url text not null,
  image_alt text not null default '',
  tags text[] not null default array[]::text[],
  pricing jsonb not null default '{}'::jsonb,
  is_promoted boolean not null default false,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.ratings (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null default '',
  sender_role text not null default 'buyer',
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null default '',
  post_id text not null default '',
  post_title text not null default '',
  content text not null,
  timestamp timestamptz not null default now(),
  is_read boolean not null default false,
  read_at timestamptz,
  type text not null default 'chat' check (type in ('chat', 'general'))
);

create table if not exists public.fabric_requests (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  post_title text not null,
  post_image_url text not null default '',
  seller_id uuid not null references public.profiles(id) on delete cascade,
  seller_name text not null default '',
  seller_role text not null default 'tailor',
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  buyer_name text not null default '',
  buyer_email text not null default '',
  quantity numeric(18, 6) not null,
  quantity_unit text not null default 'pieces',
  preferred_color text not null default '',
  budget numeric(18, 2),
  currency text not null default 'USD',
  delivery_location text not null default '',
  needed_by text not null default '',
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewed', 'quoted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'system' check (type in ('follow', 'like', 'message', 'system')),
  created_at timestamptz not null default now(),
  is_read boolean not null default false,
  action_url text
);

create table if not exists public.discovery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  item_id text not null,
  event_type text not null check (event_type in ('VIEW', 'LIKE', 'SAVE', 'SHARE', 'ENQUIRY', 'ADD_TO_CART', 'PURCHASE', 'RATING')),
  timestamp timestamptz not null default now(),
  session_id text not null
);

create table if not exists public.push_tokens (
  token_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or is_super_admin = true)
  );
$$;

create or replace function public.is_profile_owner(user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = user_id;
$$;

create or replace function public.is_seller_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_admin() or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('tailor', 'fabric_seller')
    )
  );
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.ratings enable row level security;
alter table public.messages enable row level security;
alter table public.fabric_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.discovery_events enable row level security;
alter table public.push_tokens enable row level security;
alter table public.settings enable row level security;

create or replace function public.handles_profile_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := coalesce(new.id, auth.uid());
  new.email := coalesce(new.email, auth.email());
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_insert on public.profiles;
create trigger profiles_insert before insert on public.profiles
for each row execute function public.handles_profile_insert();

create policy "Profiles are readable by owner or admin"
  on public.profiles for select using (public.is_profile_owner(id) or public.is_admin());

create policy "Profiles are insertable by their owner"
  on public.profiles for insert with check (
    public.is_admin()
    or (public.is_profile_owner(id) and role <> 'admin' and not is_super_admin)
  );

create policy "Profiles can be updated by owner or admin"
  on public.profiles for update using (public.is_profile_owner(id) or public.is_admin())
  with check (
    public.is_admin()
    or (public.is_profile_owner(id) and role <> 'admin' and not is_super_admin)
  );

create policy "Profiles are deletable only by admin"
  on public.profiles for delete using (public.is_admin());

create policy "Posts are publicly readable and not blocked"
  on public.posts for select using (not is_blocked and not exists (
    select 1 from public.profiles p where p.id = posts.author_id and p.is_blocked
  ));

create policy "Seller-owned posts are insertable"
  on public.posts for insert with check (
    author_id = auth.uid() and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('tailor', 'fabric_seller') and not p.is_blocked
    ) and not public.is_admin()
  );

create policy "Posts can be edited by owner or admin"
  on public.posts for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "Posts can be deleted by owner or admin"
  on public.posts for delete using (author_id = auth.uid() or public.is_admin());

create policy "Likes are owned by the authenticated user"
  on public.post_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Saves are owned by the authenticated user"
  on public.post_saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Ratings are owned by the authenticated user"
  on public.ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Messages are readable by sender, recipient, or admin"
  on public.messages for select using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

create policy "Messages are insertable by the sender"
  on public.messages for insert with check (sender_id = auth.uid() and recipient_id <> auth.uid());

create policy "Messages can be updated by recipient or admin"
  on public.messages for update using (recipient_id = auth.uid() or public.is_admin())
  with check (recipient_id = auth.uid() or public.is_admin());

create policy "Messages can be deleted by sender or admin"
  on public.messages for delete using (sender_id = auth.uid() or public.is_admin());

create policy "Fabric requests are visible to owner or admin"
  on public.fabric_requests for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy "Fabric requests are insertable by buyer"
  on public.fabric_requests for insert with check (buyer_id = auth.uid());

create policy "Fabric requests can be updated by buyer, seller, or admin"
  on public.fabric_requests for update using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy "Notifications are readable by owner or admin"
  on public.notifications for select using (user_id = auth.uid() or public.is_admin());

create policy "Notifications are insertable by admin"
  on public.notifications for insert with check (public.is_admin());

create policy "Notifications can be updated by owner or admin"
  on public.notifications for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "Discovery events are insertable by authenticated users"
  on public.discovery_events for insert with check (user_id is null or user_id = auth.uid());

create policy "Discovery events are readable by owner or admin"
  on public.discovery_events for select using (user_id = auth.uid() or public.is_admin());

create policy "Push tokens are owned by authenticated user"
  on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Settings are readable by all"
  on public.settings for select using (true);

create policy "Settings are writable by admin"
  on public.settings for all using (public.is_admin()) with check (public.is_admin());

create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);
create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists messages_sender_idx on public.messages(sender_id, timestamp);
create index if not exists messages_recipient_idx on public.messages(recipient_id, timestamp);
create index if not exists fabric_requests_buyer_idx on public.fabric_requests(buyer_id, created_at desc);
create index if not exists fabric_requests_seller_idx on public.fabric_requests(seller_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists discovery_events_user_idx on public.discovery_events(user_id, timestamp);
