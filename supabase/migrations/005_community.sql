-- Optional community tables. App falls back to localStorage if these are missing.

create table if not exists spot_posts (
  id text primary key,
  spot_id text,
  user_id uuid references profiles(id) on delete cascade,
  display_name text,
  text text default '',
  photo text,
  created_at timestamptz default now()
);

create table if not exists meetups (
  id text primary key,
  spot_id text,
  spot_name text,
  user_id uuid references profiles(id) on delete cascade,
  display_name text,
  meetup_at timestamptz not null,
  note text default '',
  created_at timestamptz default now()
);

create index if not exists spot_posts_spot_id_idx on spot_posts (spot_id, created_at desc);
create index if not exists spot_posts_created_at_idx on spot_posts (created_at desc);
create index if not exists meetups_when_idx on meetups (meetup_at);

alter table spot_posts enable row level security;
alter table meetups enable row level security;

drop policy if exists "Spot posts viewable" on spot_posts;
create policy "Spot posts viewable" on spot_posts for select using (true);
drop policy if exists "Auth add spot posts" on spot_posts;
create policy "Auth add spot posts" on spot_posts for insert with check (auth.uid() = user_id);

drop policy if exists "Meetups viewable" on meetups;
create policy "Meetups viewable" on meetups for select using (true);
drop policy if exists "Auth add meetups" on meetups;
create policy "Auth add meetups" on meetups for insert with check (auth.uid() = user_id);
