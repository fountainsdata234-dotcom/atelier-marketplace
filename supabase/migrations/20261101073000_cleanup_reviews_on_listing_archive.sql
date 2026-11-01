create or replace function public.cleanup_reviews_when_listing_archived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    delete from public.listing_reviews
    where listing_id = new.id;

    delete from public.seller_reviews
    where listing_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.cleanup_reviews_when_listing_archived() from public, anon, authenticated;

drop trigger if exists posts_cleanup_reviews_on_archive on public.posts;
create trigger posts_cleanup_reviews_on_archive
after update of deleted_at on public.posts
for each row execute function public.cleanup_reviews_when_listing_archived();

delete from public.listing_reviews review
using public.posts post
where review.listing_id = post.id
  and post.deleted_at is not null;

delete from public.seller_reviews review
using public.posts post
where review.listing_id = post.id
  and post.deleted_at is not null;
