-- Rollback 023: removes reel saves entirely (DELETES all saved rows).
drop table if exists public.jump_video_saves cascade;
notify pgrst, 'reload schema';
