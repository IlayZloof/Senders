-- עדכון שם תצוגה למשתמשי Google (full_name / name)
-- הרץ ב-Supabase SQL Editor אם 003 כבר רץ בעבר

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
