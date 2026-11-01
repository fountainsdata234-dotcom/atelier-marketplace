create or replace function public.submit_marketplace_review(
  p_review_type text,
  p_target_id uuid,
  p_reviewer_id uuid,
  p_rating smallint,
  p_review_text text,
  p_category_breakdown jsonb,
  p_firsthand_attested boolean,
  p_context_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller_id uuid;
  v_listing_id uuid;
  v_existing record;
  v_review jsonb;
  v_config public.review_rating_config%rowtype;
  v_recent_review_count integer;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_review_type is null or p_review_type not in ('listing', 'seller')
    or p_rating is null or p_rating not between 1 and 5
    or p_firsthand_attested is distinct from true
    or p_review_text is null
    or char_length(p_review_text) > 4000 then
    raise exception 'Invalid review submission' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_category_breakdown, '{}'::jsonb)) <> 'object' then
    raise exception 'Category breakdown must be an object' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(coalesce(p_category_breakdown, '{}'::jsonb))) > 5
    or exists (
      select 1 from jsonb_each_text(coalesce(p_category_breakdown, '{}'::jsonb)) item
      where item.key not in ('quality', 'communication', 'accuracy', 'timeliness', 'value')
        or item.value !~ '^[1-5]$'
    ) then
    raise exception 'Invalid category breakdown' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_reviewer_id and is_blocked) then
    raise exception 'This account cannot submit reviews' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-submit:' || p_reviewer_id::text, 0));
  select (
    (select count(*) from public.listing_reviews review
      where review.reviewer_id = p_reviewer_id
        and (review.created_at >= v_now - interval '24 hours' or review.updated_at >= v_now - interval '24 hours'))
    +
    (select count(*) from public.seller_reviews review
      where review.reviewer_id = p_reviewer_id
        and (review.created_at >= v_now - interval '24 hours' or review.updated_at >= v_now - interval '24 hours'))
  )::integer into v_recent_review_count;
  if v_recent_review_count >= 5 then
    raise exception 'Review submission limit reached. Try again tomorrow.' using errcode = '22023';
  end if;

  select * into v_config from public.review_rating_config where id = true;

  if p_review_type = 'listing' then
    select post.author_id, post.id into v_seller_id, v_listing_id
    from public.posts post
    join public.profiles seller on seller.id = post.author_id
    where post.id = p_target_id
      and post.listing_type in ('CLOTHING', 'FABRIC')
      and post.status = 'published'
      and post.moderation_status = 'approved'
      and post.deleted_at is null
      and post.is_blocked = false
      and post.availability in ('available', 'limited', 'made_to_order')
      and seller.is_blocked = false;
    if v_listing_id is null or v_seller_id = p_reviewer_id then
      raise exception 'This listing cannot receive your review' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('listing:' || p_target_id::text || ':' || p_reviewer_id::text, 0));
    select id, created_at, rating, review_text, moderation_status
    into v_existing from public.listing_reviews
    where listing_id = p_target_id and reviewer_id = p_reviewer_id
    for update;
    if found then
      if v_now > v_existing.created_at + v_config.edit_window then
        raise exception 'The 14-day review edit window has ended' using errcode = '22023';
      end if;
      update public.listing_reviews set
        rating = p_rating, review_text = btrim(p_review_text),
        category_breakdown = coalesce(p_category_breakdown, '{}'::jsonb),
        moderation_status = 'pending', moderation_note = '',
        updated_at = v_now
      where id = v_existing.id
      returning to_jsonb(listing_reviews.*) into v_review;
      insert into public.review_audit_log (
        review_type, review_id, actor_id, action, old_values, new_values
      ) values (
        'listing', v_existing.id, p_reviewer_id, 'edited',
        jsonb_build_object('rating', v_existing.rating, 'reviewText', v_existing.review_text, 'categoryBreakdown', v_existing.category_breakdown, 'moderationStatus', v_existing.moderation_status),
        jsonb_build_object('rating', p_rating, 'reviewText', btrim(p_review_text), 'categoryBreakdown', coalesce(p_category_breakdown, '{}'::jsonb), 'moderationStatus', 'pending')
      );
    else
      insert into public.listing_reviews (
        reviewer_id, seller_id, listing_id, rating, review_text,
        category_breakdown, firsthand_attested, moderation_status
      ) values (
        p_reviewer_id, v_seller_id, v_listing_id, p_rating, btrim(p_review_text),
        coalesce(p_category_breakdown, '{}'::jsonb), true, 'pending'
      ) returning to_jsonb(listing_reviews.*) into v_review;
      insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values)
      values ('listing', (v_review->>'id')::uuid, p_reviewer_id, 'submitted', v_review);
    end if;
  else
    select profile.id into v_seller_id from public.profiles profile
    where profile.id = p_target_id
      and profile.role in ('tailor', 'fabric_seller')
      and profile.is_blocked = false;
    if v_seller_id is null or v_seller_id = p_reviewer_id then
      raise exception 'This seller cannot receive your review' using errcode = '42501';
    end if;
    v_listing_id := null;
    if p_context_listing_id is not null then
      select post.id into v_listing_id
      from public.posts post
      where post.id = p_context_listing_id
        and post.author_id = v_seller_id
        and post.listing_type in ('CLOTHING', 'FABRIC')
        and post.status = 'published'
        and post.moderation_status = 'approved'
        and post.deleted_at is null;
      if v_listing_id is null then
        raise exception 'The selected listing does not belong to this seller' using errcode = '22023';
      end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('seller:' || p_target_id::text || ':' || p_reviewer_id::text, 0));
    select id, created_at, rating, review_text, moderation_status
    into v_existing from public.seller_reviews
    where seller_id = p_target_id and reviewer_id = p_reviewer_id
    for update;
    if found then
      if v_now > v_existing.created_at + v_config.edit_window then
        raise exception 'The 14-day review edit window has ended' using errcode = '22023';
      end if;
      update public.seller_reviews set
        rating = p_rating, review_text = btrim(p_review_text),
        category_breakdown = coalesce(p_category_breakdown, '{}'::jsonb),
        moderation_status = 'pending', moderation_note = '',
        updated_at = v_now
      where id = v_existing.id
      returning to_jsonb(seller_reviews.*) into v_review;
      insert into public.review_audit_log (
        review_type, review_id, actor_id, action, old_values, new_values
      ) values (
        'seller', v_existing.id, p_reviewer_id, 'edited',
        jsonb_build_object('rating', v_existing.rating, 'reviewText', v_existing.review_text, 'categoryBreakdown', v_existing.category_breakdown, 'moderationStatus', v_existing.moderation_status),
        jsonb_build_object('rating', p_rating, 'reviewText', btrim(p_review_text), 'categoryBreakdown', coalesce(p_category_breakdown, '{}'::jsonb), 'moderationStatus', 'pending')
      );
    else
      insert into public.seller_reviews (
        reviewer_id, seller_id, listing_id, rating, review_text,
        category_breakdown, firsthand_attested, moderation_status
      ) values (
        p_reviewer_id, v_seller_id, v_listing_id, p_rating, btrim(p_review_text),
        coalesce(p_category_breakdown, '{}'::jsonb), true, 'pending'
      ) returning to_jsonb(seller_reviews.*) into v_review;
      insert into public.review_audit_log (review_type, review_id, actor_id, action, new_values)
      values ('seller', (v_review->>'id')::uuid, p_reviewer_id, 'submitted', v_review);
    end if;
  end if;
  return v_review;
end;
$$;

revoke all on function public.submit_marketplace_review(text, uuid, uuid, smallint, text, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.submit_marketplace_review(text, uuid, uuid, smallint, text, jsonb, boolean, uuid) to service_role;

create or replace function public.enforce_marketplace_review_abuse_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for review mutations' using errcode = '42501';
  end if;
  if new.reviewer_id = new.seller_id then
    raise exception 'Self-reviews are not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = new.reviewer_id and not is_blocked
  ) then
    raise exception 'This account cannot submit a review' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = new.reviewer_id and block.blocked_user_id = new.seller_id)
       or (block.blocker_id = new.seller_id and block.blocked_user_id = new.reviewer_id)
  ) then
    raise exception 'This review target is unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
