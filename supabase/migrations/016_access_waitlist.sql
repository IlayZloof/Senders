-- Waitlist: new accounts stay pending until an admin approves.

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'disabled'));

alter table profiles alter column status set default 'pending';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin boolean;
begin
  admin := lower(coalesce(new.email, '')) in (
    lower('ilay.zloof@gmail.com'),
    lower('ilay@sendit.co.il')
  );
  insert into public.profiles (id, display_name, email, is_admin, status)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'משתמש'
    ),
    new.email,
    admin,
    case when admin then 'active' else 'pending' end
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, profiles.email),
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name);
  return new;
end;
$$;
