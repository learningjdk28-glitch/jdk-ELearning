-- JDK Learning System: administrator email list (run once in the Supabase SQL Editor; safe to re-run).
-- Emails on public.admin_allowlist get the 'admin' role when they register, and an account that already
-- exists is promoted the moment its email is added. Everyone else registers as a learner.
--
-- After running this file, add your administrators (lowercase):
--   insert into public.admin_allowlist (email) values ('teacher@example.com');

-- Administrator email list. Only existing administrators and the SQL Editor can read or change it. An email on this list gets the
-- 'admin' role when it registers; adding an email that already registered promotes that account.
--   insert into public.admin_allowlist (email) values ('teacher@example.com');
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  added_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
revoke all on public.admin_allowlist from public, anon, authenticated;
grant select, insert, delete on public.admin_allowlist to authenticated;
drop policy if exists "admins manage the admin list" on public.admin_allowlist;
create policy "admins manage the admin list" on public.admin_allowlist
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.promote_allowlisted_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p set role = 'admin'
  from auth.users u
  where u.id = p.id and lower(u.email) = new.email and p.role <> 'admin';
  return new;
end;
$$;
revoke all on function public.promote_allowlisted_admin() from public, anon, authenticated;

drop trigger if exists on_admin_allowlisted on public.admin_allowlist;
create trigger on_admin_allowlisted
  after insert on public.admin_allowlist
  for each row execute function public.promote_allowlisted_admin();

-- Every new auth user gets a profile. The role is 'learner' unless the email is on
-- public.admin_allowlist. A role passed by the client in signup metadata is ignored on purpose
-- (it would allow self-promotion to admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))), 60), ''),
    case when exists (select 1 from public.admin_allowlist a where a.email = lower(new.email)) then 'admin' else 'learner' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

