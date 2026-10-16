create or replace function public.toggle_marketplace_reaction(
  p_post_id uuid,
  p_user_id uuid,
  p_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_like_count integer;
  v_save_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required for marketplace reactions' using errcode = '42501';
  end if;
  if p_reaction_type is null or p_reaction_type not in ('like', 'save') then
    raise exception 'Unsupported marketplace reaction' using errcode = '22023';
  end if;

  perform 1 from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Listing does not exist' using errcode = 'P0002';
  end if;

  if p_reaction_type = 'like' then
    select exists (
      select 1 from public.post_likes where post_id = p_post_id and user_id = p_user_id
    ) into v_active;
    if v_active then
      delete from public.post_likes where post_id = p_post_id and user_id = p_user_id;
    else
      insert into public.post_likes (post_id, user_id) values (p_post_id, p_user_id);
    end if;
  else
    select exists (
      select 1 from public.post_saves where post_id = p_post_id and user_id = p_user_id
    ) into v_active;
    if v_active then
      delete from public.post_saves where post_id = p_post_id and user_id = p_user_id;
    else
      insert into public.post_saves (post_id, user_id) values (p_post_id, p_user_id);
    end if;
  end if;

  select like_count, save_count into v_like_count, v_save_count
  from public.posts where id = p_post_id;
  return jsonb_build_object(
    'isActive', not v_active,
    'likesCount', coalesce(v_like_count, 0),
    'savesCount', coalesce(v_save_count, 0)
  );
end;
$$;

revoke all on function public.toggle_marketplace_reaction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.toggle_marketplace_reaction(uuid, uuid, text)
  to service_role;
