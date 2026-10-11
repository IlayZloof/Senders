CREATE OR REPLACE FUNCTION public.check_invitation(invite_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from invitations
    where lower(email) = lower(invite_email) and used_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, email, is_admin, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'משתמש'),
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
$function$;

CREATE OR REPLACE FUNCTION public.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and is_admin = true and status = 'active');
$function$;

CREATE OR REPLACE FUNCTION public.mark_invitation_used()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.email is not null then
    update invitations set used_at = now()
    where lower(email) = lower(new.email) and used_at is null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_invalid_admin_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare active_admins int;
begin
  if tg_op = 'UPDATE' then
    if old.id = auth.uid() and new.status = 'disabled' and old.status = 'active' then
      raise exception 'Cannot disable your own account';
    end if;
    if old.is_admin = true and (new.is_admin = false or new.status = 'disabled') then
      select count(*) into active_admins from profiles
      where is_admin = true and status = 'active' and id <> old.id;
      if active_admins = 0 then raise exception 'Cannot remove the last active administrator'; end if;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_jump_video(p_id text, p_spot_id text, p_spot_name text, p_caption text, p_video_url text)
 RETURNS jump_videos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

