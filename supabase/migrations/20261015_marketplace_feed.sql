alter table public.posts
  add column if not exists like_count integer not null default 0,
  add column if not exists save_count integer not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists rating_sum numeric(18, 3) not null default 0,
  add column if not exists rating_average numeric(4, 2) not null default 0,
  add column if not exists popularity_score numeric(18, 3) not null default 0;

with like_totals as (
  select post_id, count(*)::integer as total from public.post_likes group by post_id
), save_totals as (
  select post_id, count(*)::integer as total from public.post_saves group by post_id
), rating_totals as (
  select post_id, count(*)::integer as total, sum(rating)::numeric as rating_sum, round(avg(rating)::numeric, 2) as rating_average
  from public.ratings group by post_id
)
update public.posts p
set like_count = coalesce(l.total, 0),
    save_count = coalesce(s.total, 0),
    rating_count = coalesce(r.total, 0),
    rating_sum = coalesce(r.rating_sum, 0),
    rating_average = coalesce(r.rating_average, 0),
    popularity_score = coalesce(l.total, 0) + coalesce(s.total, 0) * 1.5
from (select id from public.posts) existing
left join like_totals l on l.post_id = existing.id
left join save_totals s on s.post_id = existing.id
left join rating_totals r on r.post_id = existing.id
where p.id = existing.id;

create or replace function public.refresh_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
  delta integer;
begin
  target_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  delta := case when tg_op = 'DELETE' then -1 else 1 end;

  if tg_table_name = 'post_likes' then
    update public.posts
    set like_count = greatest(0, like_count + delta),
        popularity_score = greatest(0, popularity_score + delta)
    where id = target_post_id;
  else
    update public.posts
    set save_count = greatest(0, save_count + delta),
        popularity_score = greatest(0, popularity_score + (delta * 1.5))
    where id = target_post_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.refresh_post_rating_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set rating_sum = rating_sum + new.rating,
        rating_average = round((rating_sum + new.rating) / (rating_count + 1), 2),
        rating_count = rating_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set rating_sum = greatest(0, rating_sum - old.rating),
        rating_average = case
          when rating_count > 1 then round((rating_sum - old.rating) / (rating_count - 1), 2)
          else 0
        end,
        rating_count = greatest(0, rating_count - 1)
    where id = old.post_id;
    return old;
  end if;

  update public.posts
  set rating_sum = rating_sum + new.rating - old.rating,
      rating_average = round((rating_sum + new.rating - old.rating) / nullif(rating_count, 0), 2)
  where id = new.post_id and rating_count > 0;
  return new;
end;
$$;

drop trigger if exists post_likes_feed_counts on public.post_likes;
create trigger post_likes_feed_counts
after insert or delete on public.post_likes
for each row execute function public.refresh_post_reaction_counts();

drop trigger if exists post_saves_feed_counts on public.post_saves;
create trigger post_saves_feed_counts
after insert or delete on public.post_saves
for each row execute function public.refresh_post_reaction_counts();

drop trigger if exists ratings_feed_summary on public.ratings;
create trigger ratings_feed_summary
after insert or update of rating or delete on public.ratings
for each row execute function public.refresh_post_rating_summary();

create index if not exists posts_marketplace_newest_idx
  on public.posts (published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_category_idx
  on public.posts (category_id, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_price_asc_idx
  on public.posts (price_min asc nulls last, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_price_desc_idx
  on public.posts (price_min desc nulls last, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_rating_idx
  on public.posts (rating_average desc, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_popularity_idx
  on public.posts (popularity_score desc, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
create index if not exists posts_marketplace_relevance_idx
  on public.posts (is_promoted desc, popularity_score desc, published_at desc, id desc)
  where status = 'published' and moderation_status = 'approved' and deleted_at is null and availability <> 'unavailable' and is_blocked = false;
