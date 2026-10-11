-- Extra worst-case fixtures for 022 (offline only).
-- Old-style storage FK (owner -> auth.users, no ON DELETE) and an unknown
-- table with a FK to profiles, to exercise the generic safety net.
alter table storage.objects add column owner uuid references auth.users(id);
create table public.mystery_refs (id serial primary key, who uuid not null references public.profiles(id), note text);
create table public.mystery_soft (id serial primary key, who uuid references public.profiles(id));
grant all on public.mystery_refs, public.mystery_soft to authenticated;
