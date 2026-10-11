-- Publish reel: INSERT policy + RPC so storage success is not enough.
-- Run in Supabase SQL Editor if client insert is still blocked.

grant select on table jump_videos to anon, authenticated;
grant insert, update, delete on table jump_videos to authenticated;

drop policy if exists "Auth add jump videos" on jump_videos;
create policy "Auth add jump videos" on jump_videos
  for insert
  with check (auth.uid() = user_id);

create or replace function public.publish_jump_video(
  p_id text,
  p_spot_id text,
  p_spot_name text,
  p_caption text,
  p_video_url text
)
returns public.jump_videos
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.jump_videos;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_id is null or length(trim(p_id)) < 8 then
    raise exception 'invalid id';
  end if;
  if p_spot_id is null or trim(p_spot_id) = '' then
    raise exception 'spot required';
  end if;
  if p_video_url is null or trim(p_video_url) = '' then
    raise exception 'video required';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile missing' using errcode = '23503';
  end if;

  insert into public.jump_videos (
    id, user_id, display_name, spot_id, spot_name, caption, video_url
  )
  values (
    trim(p_id),
    uid,
    coalesce((select display_name from public.profiles where id = uid), 'משתמש'),
    trim(p_spot_id),
    coalesce(nullif(trim(p_spot_name), ''), 'ספוט'),
    left(coalesce(p_caption, ''), 200),
    trim(p_video_url)
  )
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.publish_jump_video(text, text, text, text, text) from public;
grant execute on function public.publish_jump_video(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
