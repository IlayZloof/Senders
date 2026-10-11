-- Run once in Supabase SQL Editor (project rtaqgkaobhecupjzxdex).
-- Idempotent: likes + comments + grants + schema reload.

create table if not exists jump_videos (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  spot_id text not null,
  spot_name text,
  caption text default '',
  video_url text not null,
  created_at timestamptz default now()
);

create table if not exists jump_video_comments (
  id text primary key,
  video_id text not null references jump_videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists jump_video_likes (
  video_id text not null references jump_videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (video_id, user_id)
);

create index if not exists jump_videos_created_at_idx on jump_videos (created_at desc);
create index if not exists jump_videos_spot_id_idx on jump_videos (spot_id);
create index if not exists jump_videos_user_id_idx on jump_videos (user_id);
create index if not exists jump_video_comments_video_id_idx on jump_video_comments (video_id, created_at);
create index if not exists jump_video_likes_user_id_idx on jump_video_likes (user_id);

alter table jump_videos enable row level security;
alter table jump_video_comments enable row level security;
alter table jump_video_likes enable row level security;

drop policy if exists "Jump videos viewable" on jump_videos;
create policy "Jump videos viewable" on jump_videos for select using (true);

drop policy if exists "Auth add jump videos" on jump_videos;
create policy "Auth add jump videos" on jump_videos
  for insert with check (auth.uid() = user_id);

drop policy if exists "Owners delete jump videos" on jump_videos;
create policy "Owners delete jump videos" on jump_videos
  for delete using (auth.uid() = user_id);

drop policy if exists "Jump video comments viewable" on jump_video_comments;
create policy "Jump video comments viewable" on jump_video_comments for select using (true);

drop policy if exists "Auth add jump video comments" on jump_video_comments;
create policy "Auth add jump video comments" on jump_video_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "Jump video likes viewable" on jump_video_likes;
create policy "Jump video likes viewable" on jump_video_likes for select using (true);

drop policy if exists "Auth add jump video likes" on jump_video_likes;
create policy "Auth add jump video likes" on jump_video_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Owners remove jump video likes" on jump_video_likes;
create policy "Owners remove jump video likes" on jump_video_likes
  for delete using (auth.uid() = user_id);

grant select on table jump_videos to anon, authenticated;
grant insert, update, delete on table jump_videos to authenticated;

grant select on table jump_video_comments to anon, authenticated;
grant insert on table jump_video_comments to authenticated;

grant select on table jump_video_likes to anon, authenticated;
grant insert, delete on table jump_video_likes to authenticated;

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
