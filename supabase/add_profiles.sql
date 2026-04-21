-- ── Profiles table ───────────────────────────────────────────────────────────
-- Stores role (admin / mediator) and phone for each auth user.
-- Run this in Supabase SQL Editor AFTER the main migration.sql

create table if not exists public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  role  text not null default 'mediator',   -- 'admin' or 'mediator'
  phone text not null default ''
);

alter table public.profiles enable row level security;
create policy "Users read own profile"  on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Allow insert for anon"   on public.profiles for insert with check (true);

-- ── Auto-create profile on signup ────────────────────────────────────────────
-- If email ends with @mediator.local → role=mediator, phone=prefix
-- Otherwise → role=admin

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, phone)
  values (
    new.id,
    case when new.email like '%@mediator.local' then 'mediator' else 'admin' end,
    case when new.email like '%@mediator.local'
         then replace(new.email, '@mediator.local', '')
         else ''
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Back-fill profiles for existing users ────────────────────────────────────
insert into public.profiles (id, role, phone)
select
  id,
  case when email like '%@mediator.local' then 'mediator' else 'admin' end,
  case when email like '%@mediator.local' then replace(email, '@mediator.local', '') else '' end
from auth.users
on conflict (id) do nothing;
