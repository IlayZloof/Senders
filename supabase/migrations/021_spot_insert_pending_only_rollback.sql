-- Rollback for 021: restore the INSERT policy exactly as 020 left it.
begin;

alter policy "Auth users add spots" on public.spots
  with check ((auth.role() = 'authenticated'::text) and public.is_active_user());

commit;
