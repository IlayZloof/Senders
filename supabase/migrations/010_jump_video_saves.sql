-- Private reel saves. Only the owner can read/write their rows.
-- Run in Supabase SQL Editor if not applied:
-- https://supabase.com/dashboard/project/rtaqgkaobhecupjzxdex/sql/new

create table if not exists jump_video_saves (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id text not null references jump_videos(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, video_id)
);

create index if not exists jump_video_saves_video_id_idx on jump_video_saves (video_id);

alter table jump_video_saves enable row level security;

drop policy if exists "Owners read jump video saves" on jump_video_saves;
create policy "Owners read jump video saves"
  on jump_video_saves for select using (auth.uid() = user_id);

drop policy if exists "Owners insert jump video saves" on jump_video_saves;
create policy "Owners insert jump video saves"
  on jump_video_saves for insert with check (auth.uid() = user_id);

drop policy if exists "Owners delete jump video saves" on jump_video_saves;
create policy "Owners delete jump video saves"
  on jump_video_saves for delete using (auth.uid() = user_id);
