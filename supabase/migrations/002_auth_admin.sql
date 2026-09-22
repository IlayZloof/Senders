-- Auth & user administration (run after schema.sql in Supabase SQL Editor)

alter table profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'disabled'));

alter table profiles
  add column if not exists last_login_at timestamptz;

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

alter table invitations enable row level security;
alter table audit_log enable row level security;

-- Invitation check for signup (anon + authenticated)
create or replace function public.check_invitation(invite_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from invitations
    where lower(email) = lower(invite_email) and used_at is null
  );
$$;

grant execute on function public.check_invitation(text) to anon, authenticated;

create or replace function public.mark_invitation_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    update invitations
    set used_at = now()
    where lower(email) = lower(new.email) and used_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_invitation_used on profiles;
create trigger trg_mark_invitation_used
  after insert on profiles
  for each row execute function public.mark_invitation_used();

create or replace function public.prevent_invalid_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_admins int;
begin
  if tg_op = 'UPDATE' then
    if old.id = auth.uid() and new.status = 'disabled' and old.status = 'active' then
      raise exception 'Cannot disable your own account';
    end if;

    if old.is_admin = true and (new.is_admin = false or new.status = 'disabled') then
      select count(*) into active_admins
      from profiles
      where is_admin = true and status = 'active' and id <> old.id;

      if active_admins = 0 then
        raise exception 'Cannot remove the last active administrator';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_invalid_admin_change on profiles;
create trigger trg_prevent_invalid_admin_change
  before update on profiles
  for each row execute function public.prevent_invalid_admin_change();

-- RLS: admin helpers
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

-- Profiles: admins may update any profile
drop policy if exists "Admin updates profiles" on profiles;
create policy "Admin updates profiles" on profiles
  for update using (public.is_active_admin());

drop policy if exists "Admin views all profiles" on profiles;
create policy "Admin views all profiles" on profiles
  for select using (public.is_active_admin() or true);

-- Invitations
drop policy if exists "Admin manages invitations" on invitations;
create policy "Admin manages invitations" on invitations
  for all using (public.is_active_admin())
  with check (public.is_active_admin());

-- Audit log
drop policy if exists "Admin reads audit log" on audit_log;
create policy "Admin reads audit log" on audit_log
  for select using (public.is_active_admin());

drop policy if exists "Admin writes audit log" on audit_log;
create policy "Admin writes audit log" on audit_log
  for insert with check (public.is_active_admin());
