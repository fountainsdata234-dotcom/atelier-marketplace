-- Supabase Storage migration
-- Run this after the main schema migration.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_storage_owner(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    split_part(path, '/', 1) = 'profiles' and split_part(path, '/', 2) = auth.uid()::text
    or split_part(path, '/', 1) = 'posts' and split_part(path, '/', 2) = auth.uid()::text
    or split_part(path, '/', 1) = 'atelier' and split_part(path, '/', 2) = auth.uid()::text
  );
$$;

drop policy if exists "Uploads are publicly readable" on storage.objects;
create policy "Uploads are publicly readable"
  on storage.objects for select
  using (bucket_id = 'uploads');

drop policy if exists "Uploads are writable by owner" on storage.objects;
create policy "Uploads are writable by owner"
  on storage.objects for insert
  with check (bucket_id = 'uploads' and public.is_storage_owner(name));

drop policy if exists "Uploads can be replaced by owner" on storage.objects;
create policy "Uploads can be replaced by owner"
  on storage.objects for update
  using (bucket_id = 'uploads' and public.is_storage_owner(name))
  with check (bucket_id = 'uploads' and public.is_storage_owner(name));

drop policy if exists "Uploads can be deleted by owner" on storage.objects;
create policy "Uploads can be deleted by owner"
  on storage.objects for delete
  using (bucket_id = 'uploads' and public.is_storage_owner(name));
