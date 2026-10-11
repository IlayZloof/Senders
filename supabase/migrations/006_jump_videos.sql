-- Home feed videos + comments. Run in Supabase SQL Editor.
-- Storage bucket is public so <video src> works in the PWA.

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

create index if not exists jump_videos_created_at_idx on jump_videos (created_at desc);
create index if not exists jump_videos_spot_id_idx on jump_videos (spot_id);
create index if not exists jump_video_comments_video_id_idx on jump_video_comments (video_id, created_at);

alter table jump_videos enable row level security;
alter table jump_video_comments enable row level security;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'jump-videos',
  'jump-videos',
  true,
  41943040,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read jump videos" on storage.objects;
create policy "Public read jump videos"
  on storage.objects for select
  using (bucket_id = 'jump-videos');

drop policy if exists "Auth upload jump videos" on storage.objects;
create policy "Auth upload jump videos"
  on storage.objects for insert
  with check (
    bucket_id = 'jump-videos'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Owners delete jump video files" on storage.objects;
create policy "Owners delete jump video files"
  on storage.objects for delete
  using (
    bucket_id = 'jump-videos'
    and split_part(name, '/', 1) = auth.uid()::text
  );
