drop policy if exists "Profiles are insertable by their owner" on public.profiles;
create policy "Profiles are insertable by their owner"
  on public.profiles for insert with check (
    public.is_admin()
    or (public.is_profile_owner(id) and role <> 'admin' and not is_super_admin)
  );

drop policy if exists "Profiles can be updated by owner or admin" on public.profiles;
create policy "Profiles can be updated by owner or admin"
  on public.profiles for update using (public.is_profile_owner(id) or public.is_admin())
  with check (
    public.is_admin()
    or (public.is_profile_owner(id) and role <> 'admin' and not is_super_admin)
  );
