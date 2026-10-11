-- Admin can fully delete a user (auth + profile). They must sign up again.

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  remaining_admins int;
begin
  if not public.is_active_admin() then
    raise exception 'אין הרשאות מנהל';
  end if;

  if target_id is null or target_id = auth.uid() then
    raise exception 'לא ניתן למחוק את החשבון שלך';
  end if;

  select * into target from public.profiles where id = target_id;

  if not found then
    raise exception 'משתמש לא נמצא';
  end if;

  if target.is_admin then
    select count(*) into remaining_admins
    from public.profiles
    where is_admin = true and status = 'active' and id <> target_id;
    if remaining_admins = 0 then
      raise exception 'לא ניתן למחוק את המנהל האחרון';
    end if;
  end if;

  update public.spots set created_by = null where created_by = target_id;
  update public.admin_notifications set user_id = null where user_id = target_id;

  insert into public.audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'USER_DELETED',
    target_id,
    coalesce(target.email, target.display_name, target_id::text)
  );

  delete from auth.users where id = target_id;
  delete from public.profiles where id = target_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
