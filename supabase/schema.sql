-- Supabase schema for Senders
-- Run in Supabase SQL Editor

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

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

alter table profiles enable row level security;
alter table spots enable row level security;
alter table admin_notifications enable row level security;
alter table experiences enable row level security;
alter table jumps enable row level security;

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

-- הרחבת auth/admin: הריצו גם supabase/migrations/002_auth_admin.sql
