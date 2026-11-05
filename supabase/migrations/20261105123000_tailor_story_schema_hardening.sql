create table if not exists public.tailor_stories (
  id uuid primary key default gen_random_uuid(),
  tailor_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  thumbnail_url text not null default '',
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  cloudinary_public_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  caption text not null default '',
  view_count integer not null default 0,
  like_count integer not null default 0
);

alter table public.tailor_stories
  add column if not exists media_type text;

alter table public.tailor_stories
  add column if not exists thumbnail_url text;

alter table public.tailor_stories
  add column if not exists caption text;

alter table public.tailor_stories
  add column if not exists view_count integer;

alter table public.tailor_stories
  add column if not exists like_count integer;

update public.tailor_stories
set media_type = case when lower(coalesce(media_type, '')) = 'video' then 'video' else 'image' end
where media_type is null or media_type not in ('image', 'video');

update public.tailor_stories
set thumbnail_url = coalesce(thumbnail_url, media_url, '')
where thumbnail_url is null;

update public.tailor_stories
set caption = coalesce(caption, ''),
    view_count = coalesce(view_count, 0),
    like_count = coalesce(like_count, 0)
where caption is null or view_count is null or like_count is null;

alter table public.tailor_stories
  alter column media_type set default 'image',
  alter column media_type set not null,
  alter column thumbnail_url set default '',
  alter column thumbnail_url set not null,
  alter column caption set default '',
  alter column caption set not null,
  alter column view_count set default 0,
  alter column view_count set not null,
  alter column like_count set default 0,
  alter column like_count set not null;

alter table public.tailor_stories
  drop constraint if exists tailor_stories_media_type_check;

alter table public.tailor_stories
  add constraint tailor_stories_media_type_check check (media_type in ('image', 'video'));

create table if not exists public.tailor_story_likes (
  story_id uuid not null references public.tailor_stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.tailor_story_views (
  story_id uuid not null references public.tailor_stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists tailor_stories_active_idx
  on public.tailor_stories (expires_at desc, created_at desc, tailor_id);

create index if not exists tailor_story_likes_story_idx
  on public.tailor_story_likes (story_id);

create index if not exists tailor_story_views_story_idx
  on public.tailor_story_views (story_id);
