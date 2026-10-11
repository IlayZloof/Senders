-- 021: Non-admin users can only submit spots as 'pending' in their own name.
--
-- Gap found in the v1.0.5 audit: the INSERT policy "Auth users add spots"
-- (last set by 020) only checks that the caller is an approved user. The row
-- itself is not checked, so any approved user could call the API directly and
-- insert a spot with status = 'approved' (skipping admin review) or with
-- created_by set to someone else.
--
-- After this migration:
--   * active admins (is_active_admin()) may insert any row (approved spots,
--     'deleted' tombstones used by the admin delete flow, etc.);
--   * everyone else must be an approved user, status must be 'pending'
--     (or omitted -> column default 'pending'), and created_by must be
--     their own id (or null).
--
-- Client impact: none for normal users (the site already sends 'pending' +
-- created_by = own id). Accounts that the *client* treats as admin by email
-- (VITE_ADMIN_EMAIL) but that are NOT is_admin in the DB would get an error
-- when adding a spot, because the client sends status 'approved' for them.
--
-- NOT APPLIED. Review, then run in the Supabase SQL Editor (as postgres).
-- Rollback: 021_spot_insert_pending_only_rollback.sql

begin;

alter policy "Auth users add spots" on public.spots
  with check (
    public.is_active_admin()
    or (
      auth.role() = 'authenticated'::text
      and public.is_active_user()
      and coalesce(status, 'pending') = 'pending'
      and (created_by is null or created_by = auth.uid())
    )
  );

commit;

-- Verify:
--   select policyname, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'spots' and policyname = 'Auth users add spots';
