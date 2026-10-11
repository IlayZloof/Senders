-- Rollback for 020_enforce_user_approval.sql
-- Restores the live definitions exported before 020 (default 'active',
-- handle_new_user, publish_jump_video, policies) and removes the new trigger/helpers.
-- Does not change any user's status (users created as 'disabled' stay disabled).

begin;

alter table public.profiles alter column status set default 'active';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, display_name, email, is_admin, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'משתמש'),
    new.email,
    lower(coalesce(new.email, '')) = lower('ilay.zloof@gmail.com'),
    'active'
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, profiles.email),
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name);
  return new;
end;
$function$;

create or replace function public.publish_jump_video(p_id text, p_spot_id text, p_spot_name text, p_caption text, p_video_url text)
returns jump_videos
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;

drop trigger if exists trg_protect_profile_privileged_columns on public.profiles;
drop function if exists public.protect_profile_privileged_columns();

alter policy "Auth users add spots" on public.spots
  with check (auth.role() = 'authenticated'::text);

alter policy "Auth add experiences" on public.experiences
  with check (auth.uid() = user_id);

alter policy "Auth add jumps" on public.jumps
  with check (auth.uid() = user_id);

alter policy "Auth add jump videos" on public.jump_videos
  with check (auth.uid() = user_id);

alter policy "Owners update jump videos" on public.jump_videos
  with check ((auth.uid() = user_id) or public.is_active_admin());

alter policy "Auth add jump video comments" on public.jump_video_comments
  with check (auth.uid() = user_id);

alter policy "Auth add jump video likes" on public.jump_video_likes
  with check (auth.uid() = user_id);

alter policy "System inserts notifications" on public.admin_notifications
  with check (true);

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('spot_posts', 'Auth add spot posts'),
      ('meetups', 'Auth add meetups'),
      ('jump_video_saves', 'Owners insert jump video saves')
    ) as t(tbl, pol)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.tbl and policyname = r.pol
        and with_check = '((auth.uid() = user_id) AND is_active_user())'
    ) then
      execute format('alter policy %I on public.%I with check (auth.uid() = user_id)', r.pol, r.tbl);
    end if;
  end loop;
end $$;

do $$
begin
  alter policy "Auth upload jump videos" on storage.objects
    with check (
      (bucket_id = 'jump-videos'::text)
      and (split_part(name, '/'::text, 1) = (auth.uid())::text)
    );
exception
  when insufficient_privilege then
    raise notice 'Could not alter storage policy "Auth upload jump videos" (insufficient privilege); skipped';
  when undefined_object then
    raise notice 'Storage policy "Auth upload jump videos" not found; skipped';
end $$;

drop function if exists public.is_active_user();

commit;
