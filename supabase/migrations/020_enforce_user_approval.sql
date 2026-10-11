-- 020: Enforce "new users start disabled and need admin approval" in the database.
--
-- What this does (idempotent, safe to run more than once):
--   1. profiles.status defaults to 'disabled'; handle_new_user() creates new
--      non-admin users as 'disabled' (ilay.zloof@gmail.com stays auto admin + active).
--   2. A BEFORE INSERT/UPDATE trigger on profiles stops non-admins from granting
--      themselves admin, changing their own status, changing id, or spoofing email.
--      Admins, service_role and postgres (SQL editor / internal triggers) are not limited.
--   3. is_active_user() helper; content INSERT/UPDATE policies now require an
--      active (approved) account. SELECT policies are unchanged.
--      publish_jump_video() (security definer, bypasses RLS) also checks it.
--   4. Does NOT change the status of any existing user.
--
-- Rollback: 020_enforce_user_approval_rollback.sql
-- Run in Supabase SQL Editor (as postgres).

begin;

-- ─── 1. New accounts start disabled ───────────────────────────────────────

alter table public.profiles alter column status set default 'disabled';

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
    case
      when lower(coalesce(new.email, '')) = lower('ilay.zloof@gmail.com') then 'active'
      else 'disabled'
    end
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, profiles.email),
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name);
  return new;
end;
$function$;

-- ─── 3a. Helper: is the current caller an approved (active) user? ────────

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$function$;

grant execute on function public.is_active_user() to anon, authenticated, service_role;

-- ─── 2. Protect privileged profile columns ────────────────────────────────
-- SECURITY INVOKER on purpose: current_user must be the real caller
-- (authenticated / service_role / postgres), not the function owner.

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  jwt_email text := lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''));
  is_owner_admin_email boolean := coalesce(jwt_email = lower('ilay.zloof@gmail.com'), false);
begin
  -- Trusted contexts: SQL editor, internal security-definer triggers
  -- (handle_new_user), auth service, service_role key.
  if current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Active admins may change anything (approve, disable, grant admin).
  if public.is_active_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A non-admin creating their own profile always starts unapproved.
    if is_owner_admin_email then
      new.is_admin := true;
      new.status := 'active';
    else
      new.is_admin := false;
      new.status := 'disabled';
    end if;
    if jwt_email is not null then
      new.email := jwt_email;
    end if;
    return new;
  end if;

  -- UPDATE by a non-admin (normally the user editing their own row).
  if new.id is distinct from old.id then
    raise exception 'Not allowed to change profile id' using errcode = '42501';
  end if;

  if new.is_admin is distinct from old.is_admin
     and not (is_owner_admin_email and new.is_admin = true) then
    raise exception 'Only an admin can change admin rights' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (is_owner_admin_email and new.status = 'active') then
    raise exception 'Only an admin can change account status' using errcode = '42501';
  end if;

  if new.email is distinct from old.email
     and (jwt_email is null or lower(coalesce(new.email, '')) <> jwt_email) then
    raise exception 'Email can only be set to your own sign-in email' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_protect_profile_privileged_columns on public.profiles;
create trigger trg_protect_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- ─── 3b. Content writes require an approved account ──────────────────────
-- ALTER POLICY keeps each policy's command and roles; only WITH CHECK changes.

alter policy "Auth users add spots" on public.spots
  with check ((auth.role() = 'authenticated'::text) and public.is_active_user());

alter policy "Auth add experiences" on public.experiences
  with check ((auth.uid() = user_id) and public.is_active_user());

alter policy "Auth add jumps" on public.jumps
  with check ((auth.uid() = user_id) and public.is_active_user());

alter policy "Auth add jump videos" on public.jump_videos
  with check ((auth.uid() = user_id) and public.is_active_user());

alter policy "Owners update jump videos" on public.jump_videos
  with check (((auth.uid() = user_id) and public.is_active_user()) or public.is_active_admin());

alter policy "Auth add jump video comments" on public.jump_video_comments
  with check ((auth.uid() = user_id) and public.is_active_user());

alter policy "Auth add jump video likes" on public.jump_video_likes
  with check ((auth.uid() = user_id) and public.is_active_user());

-- Notifications: only approved users, and only in their own name.
alter policy "System inserts notifications" on public.admin_notifications
  with check (public.is_active_user() and (user_id is null or user_id = auth.uid()));

-- Optional tables (not in the live export). Only touched when the policy exists
-- with exactly the definition from the repo migrations.
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
        and with_check = '(auth.uid() = user_id)'
    ) then
      execute format(
        'alter policy %I on public.%I with check ((auth.uid() = user_id) and public.is_active_user())',
        r.pol, r.tbl
      );
    elsif exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.tbl and policyname = r.pol
        and with_check not like '%is_active_user()%'
    ) then
      raise notice 'Skipped policy "%" on %: definition differs from expected', r.pol, r.tbl;
    end if;
  end loop;
end $$;

-- Storage upload of reel files. Wrapped so a storage-ownership restriction
-- does not abort the whole migration (the DB-level jump_videos check still applies).
do $$
begin
  alter policy "Auth upload jump videos" on storage.objects
    with check (
      (bucket_id = 'jump-videos'::text)
      and (split_part(name, '/'::text, 1) = (auth.uid())::text)
      and public.is_active_user()
    );
exception
  when insufficient_privilege then
    raise notice 'Could not alter storage policy "Auth upload jump videos" (insufficient privilege); skipped';
  when undefined_object then
    raise notice 'Storage policy "Auth upload jump videos" not found; skipped';
end $$;

-- publish_jump_video is SECURITY DEFINER (bypasses RLS) so it checks approval itself.
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
  if not exists (select 1 from public.profiles where id = uid and status = 'active') then
    raise exception 'account not approved' using errcode = '42501';
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

-- 4. Intentionally NO update of existing profiles.status.

commit;
