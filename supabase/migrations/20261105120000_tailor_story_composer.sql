alter table public.tailor_stories
  add column if not exists caption text not null default '',
  add column if not exists view_count integer not null default 0,
  add column if not exists like_count integer not null default 0;

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

create index if not exists tailor_story_likes_story_idx on public.tailor_story_likes(story_id);
create index if not exists tailor_story_views_story_idx on public.tailor_story_views(story_id);
