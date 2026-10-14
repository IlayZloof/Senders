-- 023: Reel saves ("שמורים") for the live DB.
-- Root cause: 010_jump_video_saves.sql was never applied on live
-- (anon REST: PGRST205 "Could not find the table 'public.jump_video_saves'").
-- Idempotent. Requires 002 (is_active_admin) and 020 (is_active_user).

create table if not exists public.jump_video_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id text not null references public.jump_videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists jump_video_saves_video_id_idx on public.jump_video_saves (video_id);
create index if not exists jump_video_saves_user_created_idx on public.jump_video_saves (user_id, created_at desc);

alter table public.jump_video_saves enable row level security;

revoke all on public.jump_video_saves from anon;
grant select, insert, delete on public.jump_video_saves to authenticated;

drop policy if exists "Owners read jump video saves" on public.jump_video_saves;
create policy "Owners read jump video saves"
  on public.jump_video_saves for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins read jump video saves" on public.jump_video_saves;
create policy "Admins read jump video saves"
  on public.jump_video_saves for select to authenticated
  using (public.is_active_admin());

drop policy if exists "Owners insert jump video saves" on public.jump_video_saves;
create policy "Owners insert jump video saves"
  on public.jump_video_saves for insert to authenticated
  with check ((auth.uid() = user_id) and public.is_active_user());

drop policy if exists "Owners delete jump video saves" on public.jump_video_saves;
create policy "Owners delete jump video saves"
  on public.jump_video_saves for delete to authenticated
  using (auth.uid() = user_id);

-- Make PostgREST see the new table immediately (avoids lingering PGRST205).
notify pgrst, 'reload schema';
