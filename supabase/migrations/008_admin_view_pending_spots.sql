-- Admins must be able to list pending spots. The original SELECT policy only
-- allows approved rows or spots the viewer created.

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_admin = true and status = 'active'
  );
$$;

grant execute on function public.is_active_admin() to authenticated;

drop policy if exists "Admins view all spots" on spots;
create policy "Admins view all spots" on spots
  for select
  using (public.is_active_admin());
