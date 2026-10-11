create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null, email text, is_admin boolean default false,
  created_at timestamptz default now(),
  status text not null default 'active' check (status in ('pending','active','disabled')),
  last_login_at timestamptz, avatar_url text, bio text);
create table spots (id text primary key, name text not null, status text default 'pending', created_by uuid references profiles(id));
create table admin_notifications (id text primary key, type text not null, title text not null, body text, spot_id text, user_id uuid references profiles(id), read boolean default false, created_at timestamptz default now());
create table experiences (id text primary key, spot_id text, user_id uuid references profiles(id) on delete cascade, text text not null);
create table jumps (id text primary key, spot_id text, user_id uuid references profiles(id) on delete cascade, height int not null);
create table invitations (id uuid primary key default gen_random_uuid(), email text not null unique, invited_by uuid, used_at timestamptz);
create table audit_log (id uuid primary key default gen_random_uuid(), admin_user_id uuid not null, action text not null, target_user_id uuid, details text);
create table jump_videos (id text primary key, user_id uuid not null references profiles(id) on delete cascade, display_name text, spot_id text not null, spot_name text, caption text default '', video_url text not null, created_at timestamptz default now());
create table jump_video_comments (id text primary key, video_id text not null references jump_videos(id) on delete cascade, user_id uuid not null references profiles(id), display_name text, text text not null);
create table jump_video_likes (video_id text not null references jump_videos(id) on delete cascade, user_id uuid not null references profiles(id), primary key (video_id,user_id));
create table jump_video_saves (user_id uuid not null references profiles(id), video_id text not null references jump_videos(id), primary key (user_id, video_id));
do $$ declare t text; begin foreach t in array array['profiles','spots','admin_notifications','experiences','jumps','invitations','audit_log','jump_videos','jump_video_comments','jump_video_likes','jump_video_saves'] loop execute format('alter table %I enable row level security',t); execute format('grant all on %I to anon, authenticated, service_role',t); end loop; end $$;

-- functions (live bodies from CSV)
CREATE OR REPLACE FUNCTION public.check_invitation(invite_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists (select 1 from invitations where lower(email) = lower(invite_email) and used_at is null);
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  insert into public.profiles (id, display_name, email, is_admin, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'משתמש'), new.email,
    lower(coalesce(new.email, '')) = lower('ilay.zloof@gmail.com'), 'active')
  on conflict (id) do update set email = coalesce(excluded.email, profiles.email),
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name);
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.is_active_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists (select 1 from profiles where id = auth.uid() and is_admin = true and status = 'active');
$function$;
CREATE OR REPLACE FUNCTION public.mark_invitation_used() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if new.email is not null then update invitations set used_at = now() where lower(email) = lower(new.email) and used_at is null; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_invalid_admin_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare active_admins int;
begin
  if tg_op = 'UPDATE' then
    if old.id = auth.uid() and new.status = 'disabled' and old.status = 'active' then raise exception 'Cannot disable your own account'; end if;
    if old.is_admin = true and (new.is_admin = false or new.status = 'disabled') then
      select count(*) into active_admins from profiles where is_admin = true and status = 'active' and id <> old.id;
      if active_admins = 0 then raise exception 'Cannot remove the last active administrator'; end if;
    end if;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.publish_jump_video(p_id text, p_spot_id text, p_spot_name text, p_caption text, p_video_url text) RETURNS jump_videos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare rec public.jump_videos; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'profile missing' using errcode = '23503'; end if;
  insert into public.jump_videos (id, user_id, display_name, spot_id, spot_name, caption, video_url)
  values (trim(p_id), uid, 'x', trim(p_spot_id), p_spot_name, coalesce(p_caption,''), trim(p_video_url)) returning * into rec;
  return rec;
end;
$function$;
grant execute on all functions in schema public to anon, authenticated, service_role;

create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
create trigger trg_mark_invitation_used after insert on profiles for each row execute function mark_invitation_used();
create trigger trg_prevent_invalid_admin_change before update on profiles for each row execute function prevent_invalid_admin_change();

-- policies (live, from CSV)
create policy "Admin marks read" on admin_notifications for update using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Admin notifications" on admin_notifications for select using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "System inserts notifications" on admin_notifications for insert with check (true);
create policy "Admin reads audit log" on audit_log for select using (is_active_admin());
create policy "Admin writes audit log" on audit_log for insert with check (is_active_admin());
create policy "Auth add experiences" on experiences for insert with check (auth.uid() = user_id);
create policy "Experiences viewable" on experiences for select using (true);
create policy "Admin manages invitations" on invitations for all using (is_active_admin()) with check (is_active_admin());
create policy "Auth add jump video comments" on jump_video_comments for insert with check (auth.uid() = user_id);
create policy "Jump video comments viewable" on jump_video_comments for select using (true);
create policy "Auth add jump video likes" on jump_video_likes for insert with check (auth.uid() = user_id);
create policy "Jump video likes viewable" on jump_video_likes for select using (true);
create policy "Owners remove jump video likes" on jump_video_likes for delete using (auth.uid() = user_id);
create policy "Auth add jump videos" on jump_videos for insert with check (auth.uid() = user_id);
create policy "Jump videos viewable" on jump_videos for select using (true);
create policy "Owners delete jump videos" on jump_videos for delete using ((auth.uid() = user_id) or is_active_admin());
create policy "Owners update jump videos" on jump_videos for update using ((auth.uid() = user_id) or is_active_admin()) with check ((auth.uid() = user_id) or is_active_admin());
create policy "Auth add jumps" on jumps for insert with check (auth.uid() = user_id);
create policy "Jumps viewable" on jumps for select using (true);
create policy "Admin updates profiles" on profiles for update using (is_active_admin());
create policy "Profiles viewable" on profiles for select using (true);
create policy "Users insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Admin updates spots" on spots for update using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin = true));
create policy "Approved spots viewable" on spots for select using ((status = 'approved') or (auth.uid() = created_by));
create policy "Auth users add spots" on spots for insert with check (auth.role() = 'authenticated');
create policy "Owners insert jump video saves" on jump_video_saves for insert with check (auth.uid() = user_id);
create policy "Owners read jump video saves" on jump_video_saves for select using (auth.uid() = user_id);
create policy "Auth upload jump videos" on storage.objects for insert with check ((bucket_id = 'jump-videos') and (split_part(name, '/', 1) = (auth.uid())::text));
create policy "Owners delete jump video files" on storage.objects for delete using ((bucket_id = 'jump-videos') and ((split_part(name, '/', 1) = (auth.uid())::text) or is_active_admin()));
create policy "Public read jump videos" on storage.objects for select using (bucket_id = 'jump-videos');

-- seed: admin + an existing active user (pre-migration)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','ilay.zloof@gmail.com'),
 ('00000000-0000-0000-0000-00000000000e','old@x.com');
