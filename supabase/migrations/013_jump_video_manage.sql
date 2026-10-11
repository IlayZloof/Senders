-- Owners and admins can update / delete reels; admins can remove storage objects.

drop policy if exists "Owners delete jump videos" on jump_videos;
create policy "Owners delete jump videos" on jump_videos
  for delete using (auth.uid() = user_id or public.is_active_admin());

drop policy if exists "Owners update jump videos" on jump_videos;
create policy "Owners update jump videos" on jump_videos
  for update using (auth.uid() = user_id or public.is_active_admin())
  with check (auth.uid() = user_id or public.is_active_admin());

grant update on table jump_videos to authenticated;

drop policy if exists "Owners delete jump video files" on storage.objects;
create policy "Owners delete jump video files"
  on storage.objects for delete
  using (
    bucket_id = 'jump-videos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.is_active_admin()
    )
  );
