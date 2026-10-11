-- Senders — הרצה אחת ב-Supabase SQL Editor
-- Project: rtaqgkaobhecupjzxdex

-- ═══ חלק 1: טבלאות בסיס ═══

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  is_admin boolean default false,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz default now(),
  avatar_url text
);

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists bio text;

create table if not exists spots (
  id text primary key,
  name text not null,
  region text not null check (region in ('north', 'center', 'south')),
  lat double precision not null,
  lng double precision not null,
  height_min numeric not null,
  height_max numeric not null,
  accessibility text not null,
  rocks_below boolean default false,
  depth_known boolean default false,
  water_depth text,
  entry_type text,
  season text,
  warnings text,
  description text,
  instagram_url text,
  image text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists admin_notifications (
  id text primary key,
  type text not null,
  title text not null,
  body text,
  spot_id text references spots(id) on delete cascade,
  user_id uuid references profiles(id),
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists experiences (
  id text primary key,
  spot_id text references spots(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  text text not null,
  rating int check (rating between 1 and 5),
  photos text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists jumps (
  id text primary key,
  spot_id text references spots(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  height int not null,
  notes text,
  jumped_at timestamptz default now()
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  target_user_id uuid references profiles(id) on delete set null,
  details text,
  created_at timestamptz default now()
);

create index if not exists idx_invitations_email on invitations (lower(email));
create index if not exists idx_audit_log_created on audit_log (created_at desc);

-- ═══ חלק 2: אבטחה (RLS) ═══

alter table profiles enable row level security;
alter table spots enable row level security;
alter table admin_notifications enable row level security;
alter table experiences enable row level security;
alter table jumps enable row level security;
alter table invitations enable row level security;
alter table audit_log enable row level security;

create policy "Profiles viewable" on profiles for select using (true);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Approved spots viewable" on spots for select using (
  status = 'approved'
  or auth.uid() = created_by
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "Auth users add spots" on spots for insert with check (auth.role() = 'authenticated');
create policy "Admin updates spots" on spots for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

create policy "Admin notifications" on admin_notifications for select using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
create policy "System inserts notifications" on admin_notifications for insert with check (true);
create policy "Admin marks read" on admin_notifications for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

create policy "Experiences viewable" on experiences for select using (true);
create policy "Auth add experiences" on experiences for insert with check (auth.uid() = user_id);

create policy "Jumps viewable" on jumps for select using (true);
create policy "Auth add jumps" on jumps for insert with check (auth.uid() = user_id);

-- ═══ חלק 3: פונקציות admin ═══

create or replace function public.check_invitation(invite_email text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from invitations
    where lower(email) = lower(invite_email) and used_at is null
  );
$$;
grant execute on function public.check_invitation(text) to anon, authenticated;

create or replace function public.mark_invitation_used()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update invitations set used_at = now()
    where lower(email) = lower(new.email) and used_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_mark_invitation_used on profiles;
create trigger trg_mark_invitation_used
  after insert on profiles for each row execute function public.mark_invitation_used();

create or replace function public.prevent_invalid_admin_change()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
drop trigger if exists trg_prevent_invalid_admin_change on profiles;
create trigger trg_prevent_invalid_admin_change
  before update on profiles for each row execute function public.prevent_invalid_admin_change();

create or replace function public.is_active_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin = true and status = 'active');
$$;
grant execute on function public.is_active_admin() to authenticated;

drop policy if exists "Admins view all spots" on spots;
create policy "Admins view all spots" on spots
  for select using (public.is_active_admin());

drop policy if exists "Admin updates profiles" on profiles;
create policy "Admin updates profiles" on profiles for update using (public.is_active_admin());

drop policy if exists "Admin manages invitations" on invitations;
create policy "Admin manages invitations" on invitations
  for all using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "Admin reads audit log" on audit_log;
create policy "Admin reads audit log" on audit_log for select using (public.is_active_admin());

drop policy if exists "Admin writes audit log" on audit_log;
create policy "Admin writes audit log" on audit_log for insert with check (public.is_active_admin());

-- ═══ פיד סרטונים בבית ═══
-- (same as supabase/migrations/006_jump_videos.sql)
create table if not exists jump_videos (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  spot_id text not null,
  spot_name text,
  caption text default '',
  video_url text not null,
  created_at timestamptz default now()
);

create table if not exists jump_video_comments (
  id text primary key,
  video_id text not null references jump_videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  text text not null,
  created_at timestamptz default now()
);

create index if not exists jump_videos_created_at_idx on jump_videos (created_at desc);
create index if not exists jump_videos_spot_id_idx on jump_videos (spot_id);
create index if not exists jump_video_comments_video_id_idx on jump_video_comments (video_id, created_at);

alter table jump_videos enable row level security;
alter table jump_video_comments enable row level security;

drop policy if exists "Jump videos viewable" on jump_videos;
create policy "Jump videos viewable" on jump_videos for select using (true);

drop policy if exists "Auth add jump videos" on jump_videos;
create policy "Auth add jump videos" on jump_videos
  for insert with check (auth.uid() = user_id);

drop policy if exists "Owners delete jump videos" on jump_videos;
create policy "Owners delete jump videos" on jump_videos
  for delete using (auth.uid() = user_id or public.is_active_admin());

drop policy if exists "Owners update jump videos" on jump_videos;
create policy "Owners update jump videos" on jump_videos
  for update using (auth.uid() = user_id or public.is_active_admin())
  with check (auth.uid() = user_id or public.is_active_admin());

grant select on table jump_videos to anon, authenticated;
grant insert, update, delete on table jump_videos to authenticated;

drop policy if exists "Jump video comments viewable" on jump_video_comments;
create policy "Jump video comments viewable" on jump_video_comments for select using (true);

drop policy if exists "Auth add jump video comments" on jump_video_comments;
create policy "Auth add jump video comments" on jump_video_comments
  for insert with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'jump-videos',
  'jump-videos',
  true,
  41943040,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read jump videos" on storage.objects;
create policy "Public read jump videos"
  on storage.objects for select
  using (bucket_id = 'jump-videos');

drop policy if exists "Auth upload jump videos" on storage.objects;
create policy "Auth upload jump videos"
  on storage.objects for insert
  with check (
    bucket_id = 'jump-videos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Owners delete jump video files" on storage.objects;
create policy "Owners delete jump video files"
  on storage.objects for delete
  using (
    bucket_id = 'jump-videos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.is_active_admin()
    )
  );

-- ═══ לייקים לרילס ═══
-- (same as supabase/migrations/009_jump_video_likes.sql)
create table if not exists jump_video_likes (
  video_id text not null references jump_videos(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (video_id, user_id)
);

create index if not exists jump_video_likes_user_id_idx on jump_video_likes (user_id);
create index if not exists jump_videos_user_id_idx on jump_videos (user_id);

alter table jump_video_likes enable row level security;

drop policy if exists "Jump video likes viewable" on jump_video_likes;
create policy "Jump video likes viewable" on jump_video_likes for select using (true);

drop policy if exists "Auth add jump video likes" on jump_video_likes;
create policy "Auth add jump video likes" on jump_video_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Owners remove jump video likes" on jump_video_likes;
create policy "Owners remove jump video likes" on jump_video_likes
  for delete using (auth.uid() = user_id);

-- ═══ שמורים לרילס (פרטי — רק הבעלים) ═══
-- (same as supabase/migrations/010_jump_video_saves.sql)
create table if not exists jump_video_saves (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id text not null references jump_videos(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, video_id)
);

create index if not exists jump_video_saves_video_id_idx on jump_video_saves (video_id);

alter table jump_video_saves enable row level security;

drop policy if exists "Owners read jump video saves" on jump_video_saves;
create policy "Owners read jump video saves"
  on jump_video_saves for select using (auth.uid() = user_id);

drop policy if exists "Owners insert jump video saves" on jump_video_saves;
create policy "Owners insert jump video saves"
  on jump_video_saves for insert with check (auth.uid() = user_id);

drop policy if exists "Owners delete jump video saves" on jump_video_saves;
create policy "Owners delete jump video saves"
  on jump_video_saves for delete using (auth.uid() = user_id);

-- ═══ פרסום רילס (insert + RPC) ═══
-- (same as supabase/migrations/015_publish_jump_video.sql)
create or replace function public.publish_jump_video(
  p_id text,
  p_spot_id text,
  p_spot_name text,
  p_caption text,
  p_video_url text
)
returns public.jump_videos
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.publish_jump_video(text, text, text, text, text) from public;
grant execute on function public.publish_jump_video(text, text, text, text, text) to authenticated;
