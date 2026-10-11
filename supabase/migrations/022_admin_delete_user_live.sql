-- 022: Admin can fully delete a user — written against the LIVE schema.
--
-- Why: users.html calls rpc admin_delete_user(target_id uuid), but migration 019
-- was never run in production (PostgREST answers PGRST202). 019 also assumed
-- ON DELETE CASCADE / SET NULL foreign keys that the live tables may not have
-- (live tables were created by different scripts), so a plain
-- "delete from auth.users" could fail with a foreign-key violation.
--
-- What admin_delete_user(target_id) does, in one transaction:
--   Guards: caller must be an active admin; cannot delete yourself; target must
--   exist; cannot delete the last active admin.
--   Removes the user's own activity:  their reels (jump_videos) together with
--     all comments/likes/saves on those reels; their comments, likes and saves
--     on other people's reels; their experiences / jumps (and spot_posts /
--     meetups if those tables exist).
--   Keeps shared data, unlinked:  spots they added stay (created_by -> null);
--     admin notifications stay (user_id -> null); invitations they sent stay
--     (invited_by -> null).
--   Any other public table with a foreign key to the user is handled
--     generically: nullable column -> set null, NOT NULL column -> row deleted.
--   Writes a USER_DELETED row to audit_log (if the table exists).
--   Deletes the auth.users row (login gone; auth identities/sessions cascade)
--     and the profiles row. The person must sign up again and wait for approval.
--   Video FILES in storage bucket jump-videos are NOT deleted (Supabase blocks
--     direct deletes from storage.objects in SQL). They stay in the bucket but
--     nothing in the app points to them any more; remove the folder
--     jump-videos/<user id>/ from the Storage UI if you want the space back.
--
-- Idempotent: create or replace; optional tables guarded with to_regclass().
-- Run in the Supabase SQL Editor as postgres. Rollback:
-- 022_admin_delete_user_live_rollback.sql

begin;

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid := auth.uid();
  target public.profiles%rowtype;
  has_profile boolean := false;
  has_auth boolean := false;
  remaining_admins int;
  vids text[] := '{}';
  label text;
  fk record;
begin
  if caller is null or not public.is_active_admin() then
    raise exception 'אין הרשאות מנהל' using errcode = '42501';
  end if;

  if target_id is null or target_id = caller then
    raise exception 'לא ניתן למחוק את החשבון שלך';
  end if;

  select * into target from public.profiles where id = target_id for update;
  has_profile := found;
  select exists (select 1 from auth.users where id = target_id) into has_auth;
  if not has_profile and not has_auth then
    raise exception 'משתמש לא נמצא';
  end if;

  if has_profile and coalesce(target.is_admin, false) then
    select count(*) into remaining_admins
    from public.profiles
    where is_admin = true and status = 'active' and id <> target_id;
    if remaining_admins = 0 then
      raise exception 'לא ניתן למחוק את המנהל האחרון';
    end if;
  end if;

  label := coalesce(target.email, (select email from auth.users where id = target_id),
                    target.display_name, target_id::text);

  -- ── Reels and social rows ─────────────────────────────────────────────
  if to_regclass('public.jump_videos') is not null then
    select coalesce(array_agg(id::text), '{}') into vids
    from public.jump_videos where user_id = target_id;
  end if;

  if to_regclass('public.jump_video_comments') is not null then
    delete from public.jump_video_comments
    where user_id = target_id or video_id::text = any (vids);
  end if;
  if to_regclass('public.jump_video_likes') is not null then
    delete from public.jump_video_likes
    where user_id = target_id or video_id::text = any (vids);
  end if;
  if to_regclass('public.jump_video_saves') is not null then
    delete from public.jump_video_saves
    where user_id = target_id or video_id::text = any (vids);
  end if;
  if to_regclass('public.jump_videos') is not null then
    delete from public.jump_videos where user_id = target_id;
  end if;

  -- ── Personal content ──────────────────────────────────────────────────
  if to_regclass('public.experiences') is not null then
    delete from public.experiences where user_id = target_id;
  end if;
  if to_regclass('public.jumps') is not null then
    delete from public.jumps where user_id = target_id;
  end if;
  if to_regclass('public.spot_posts') is not null then
    execute 'delete from public.spot_posts where user_id = $1' using target_id;
  end if;
  if to_regclass('public.meetups') is not null then
    execute 'delete from public.meetups where user_id = $1' using target_id;
  end if;

  -- ── Shared data stays, unlinked ───────────────────────────────────────
  if to_regclass('public.spots') is not null then
    update public.spots set created_by = null where created_by = target_id;
  end if;
  if to_regclass('public.admin_notifications') is not null then
    update public.admin_notifications set user_id = null where user_id = target_id;
  end if;
  if to_regclass('public.invitations') is not null then
    update public.invitations set invited_by = null where invited_by = target_id;
  end if;

  -- ── Safety net: any other single-column FK in public -> profiles/auth.users
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and n.nspname = 'public'
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.conrelid <> 'public.profiles'::regclass
      and c.conrelid <> coalesce(to_regclass('public.audit_log')::oid, 0::oid)
  loop
    if fk.notnull then
      execute format('delete from %s where %I = $1', fk.tbl, fk.col) using target_id;
    else
      execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col) using target_id;
    end if;
  end loop;

  -- ── Audit log ─────────────────────────────────────────────────────────
  if to_regclass('public.audit_log') is not null then
    -- Keep history readable: rows that point at the deleted user lose the link
    -- (target_user_id is nullable); the id + email stay in "details".
    update public.audit_log set target_user_id = null where target_user_id = target_id;
    -- admin_user_id is NOT NULL: if the deleted user was an admin, their past
    -- audit rows are removed (same as the ON DELETE CASCADE in migration 002).
    delete from public.audit_log where admin_user_id = target_id;
    insert into public.audit_log (admin_user_id, action, target_user_id, details)
    values (caller, 'USER_DELETED', null, label || ' (' || target_id::text || ')');
  end if;

  -- ── Account ───────────────────────────────────────────────────────────
  if has_profile then
    delete from public.profiles where id = target_id;
  end if;
  if has_auth then
    -- Older Supabase projects had storage.objects.owner -> auth.users without
    -- ON DELETE; unlink the user's files (they stay in the bucket) so the
    -- account delete cannot fail on it. No-op on current projects.
    if exists (
      select 1 from pg_constraint
      where contype = 'f'
        and conrelid = coalesce(to_regclass('storage.objects')::oid, 0::oid)
        and confrelid = 'auth.users'::regclass
    ) then
      begin
        execute 'update storage.objects set owner = null where owner = $1' using target_id;
      exception when others then
        raise notice 'admin_delete_user: could not unlink storage objects: %', sqlerrm;
      end;
    end if;
    delete from auth.users where id = target_id;
  end if;
end;
$fn$;

alter function public.admin_delete_user(uuid) owner to postgres;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

commit;

-- Make PostgREST see the new function right away.
notify pgrst, 'reload schema';

-- Verify (should list one row, owner postgres, security definer = true):
--   select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef
--   from pg_proc p where p.proname = 'admin_delete_user';
