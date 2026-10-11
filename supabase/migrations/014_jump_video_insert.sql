-- Restore INSERT for authenticated reel owners (table + storage).
-- 013 only recreated update/delete; insert policies can be missing in production.

grant select on table jump_videos to anon, authenticated;
grant insert, update, delete on table jump_videos to authenticated;

drop policy if exists "Auth add jump videos" on jump_videos;
create policy "Auth add jump videos" on jump_videos
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners update jump videos" on jump_videos;
create policy "Owners update jump videos" on jump_videos
  for update using (auth.uid() = user_id or public.is_active_admin())
  with check (auth.uid() = user_id or public.is_active_admin());

drop policy if exists "Owners delete jump videos" on jump_videos;
create policy "Owners delete jump videos" on jump_videos
  for delete using (auth.uid() = user_id or public.is_active_admin());

drop policy if exists "Auth upload jump videos" on storage.objects;
create policy "Auth upload jump videos"
  on storage.objects for insert
  with check (
    bucket_id = 'jump-videos'
    and split_part(name, '/', 1) = auth.uid()::text
  );
