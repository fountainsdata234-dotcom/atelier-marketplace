update public.tailor_stories as stories
set like_count = (
      select count(*)::integer
      from public.tailor_story_likes as likes
      where likes.story_id = stories.id
    ),
    view_count = (
      select count(*)::integer
      from public.tailor_story_views as views
      where views.story_id = stories.id
    );

create or replace function public.record_tailor_story_view(
  p_story_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_view_count integer;
  v_inserted_story_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for story views' using errcode = '42501';
  end if;

  select stories.view_count into v_view_count
  from public.tailor_stories as stories
  where stories.id = p_story_id
    and stories.expires_at > now()
  for update;
  if not found then
    raise exception 'Active story does not exist' using errcode = 'P0002';
  end if;

  insert into public.tailor_story_views (story_id, user_id)
  values (p_story_id, p_user_id)
  on conflict (story_id, user_id) do nothing
  returning story_id into v_inserted_story_id;

  if v_inserted_story_id is not null then
    update public.tailor_stories
    set view_count = view_count + 1
    where id = p_story_id
    returning view_count into v_view_count;
  end if;

  return v_view_count;
end;
$$;

create or replace function public.toggle_tailor_story_like(
  p_story_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_liked boolean;
  v_like_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for story likes' using errcode = '42501';
  end if;

  perform 1
  from public.tailor_stories as stories
  where stories.id = p_story_id
    and stories.expires_at > now()
  for update;
  if not found then
    raise exception 'Active story does not exist' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.tailor_story_likes as likes
    where likes.story_id = p_story_id
      and likes.user_id = p_user_id
  ) then
    delete from public.tailor_story_likes
    where story_id = p_story_id and user_id = p_user_id;
    v_is_liked := false;
  else
    insert into public.tailor_story_likes (story_id, user_id)
    values (p_story_id, p_user_id);
    v_is_liked := true;
  end if;

  select count(*)::integer into v_like_count
  from public.tailor_story_likes
  where story_id = p_story_id;

  update public.tailor_stories
  set like_count = v_like_count
  where id = p_story_id;

  return jsonb_build_object('isLiked', v_is_liked, 'likeCount', v_like_count);
end;
$$;

revoke all on function public.record_tailor_story_view(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_tailor_story_view(uuid, uuid)
  to service_role;

revoke all on function public.toggle_tailor_story_like(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.toggle_tailor_story_like(uuid, uuid)
  to service_role;
