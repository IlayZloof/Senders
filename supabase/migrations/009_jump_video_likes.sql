-- Likes for Reels / jump videos. Run in Supabase SQL Editor if not applied.

create table if not exists jump_video_likes (
  video_id text not null references jump_videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (video_id, user_id)
);

create index if not exists jump_video_likes_user_id_idx on jump_video_likes (user_id);
create index if not exists jump_videos_user_id_idx on jump_videos (user_id);

alter table jump_video_likes enable row level security;

drop policy if exists "Jump video likes viewable" on jump_video_likes;
create policy "Jump video likes viewable" on jump_video_likes for select using (true);

drop policy if exists "Auth add jump video likes" on jump_video_likes;
create policy "Auth add jump video likes" on jump_video_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Owners remove jump video likes" on jump_video_likes;
create policy "Owners remove jump video likes" on jump_video_likes
  for delete using (auth.uid() = user_id);
