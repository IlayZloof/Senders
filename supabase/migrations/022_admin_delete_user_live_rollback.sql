-- Rollback for 022: remove the admin delete-user function.
begin;
drop function if exists public.admin_delete_user(uuid);
commit;
notify pgrst, 'reload schema';
