-- יוצר פרופיל אוטומטית לכל משתמש חדש (גם לפני אימות מייל)
-- הרץ ב-Supabase SQL Editor

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    lower(coalesce(new.email, '')) = lower('ilay.zloof@gmail.com'),
    'active'
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, profiles.email),
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- משתמשים קיימים ב-auth בלי פרופיל — יצירת פרופיל חסר
insert into public.profiles (id, display_name, email, is_admin, status)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'משתמש'
  ),
  u.email,
  lower(coalesce(u.email, '')) = lower('ilay.zloof@gmail.com'),
  'active'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
