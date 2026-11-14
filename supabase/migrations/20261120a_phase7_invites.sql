-- Phase 7: invitations (queued, sent, failed, accepted), sent by the invite-users Edge Function under an hourly email budget,
-- and a per-course roster that shows who is invited, who has signed in, and how far they are.
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Invitations
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  role text not null default 'learner' check (role in ('learner', 'admin')),
  course_ids text[] not null default '{}',
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'enrolled', 'failed', 'cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 500),
  user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invites_by_idx on public.invites (invited_by, created_at desc);
create index if not exists invites_sent_idx on public.invites (sent_at) where sent_at is not null;
-- One open invitation per email address.
create unique index if not exists invites_open_email_idx on public.invites (email) where status in ('queued', 'sending', 'sent', 'failed');
drop trigger if exists set_updated_at on public.invites;
create trigger set_updated_at before update on public.invites for each row execute function public.set_updated_at();
alter table public.invites enable row level security;
drop policy if exists "invites read" on public.invites;
create policy "invites read" on public.invites for select to authenticated
  using (public.is_admin() and (invited_by = (select auth.uid()) or public.is_super_admin()));
-- No insert/update/delete policies: rows change only through the functions below and the Edge Function (service role).

-- Emails one hour may use for invitations. The Auth limit is 100 an hour; 10 stay free for sign-ups and password resets.
create or replace function public.invite_hourly_budget() returns int language sql immutable as $$ select 90 $$;

create or replace function public.invite_stats()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'budget', public.invite_hourly_budget(),
    'sent_last_hour', (select count(*) from public.invites where sent_at > now() - interval '1 hour'),
    'sent_today', (select count(*) from public.invites where sent_at > now() - interval '24 hours'),
    'next_slot_at', (select min(sent_at) + interval '1 hour' from (select sent_at from public.invites where sent_at > now() - interval '1 hour') s),
    'queued', (select count(*) from public.invites where status in ('queued', 'failed') and (invited_by = (select auth.uid()) or public.is_super_admin())));
end; $$;
revoke all on function public.invite_stats() from public, anon;
grant execute on function public.invite_stats() to authenticated;

/**
 * Queues invitations. rows: [{ email, name }]. Only courses the caller owns; only the super administrator invites administrators.
 * Returns { queued, skipped: [{ email, reason }] }.
 */
create or replace function public.queue_invites(p_rows jsonb, p_role text, p_courses text[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r jsonb; e text; n text; queued int := 0; skipped jsonb := '[]'::jsonb; c text; courses text[] := coalesce(p_courses, '{}');
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role not in ('learner', 'admin') then raise exception 'Unknown role'; end if;
  if p_role = 'admin' and not public.is_super_admin() then raise exception 'Only the super administrator can invite instructors' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Give 1 to 500 people at a time'; end if;
  foreach c in array courses loop
    if not public.owns_course(c) then raise exception 'You can only invite people to your own courses' using errcode = '42501'; end if;
  end loop;
  for r in select * from jsonb_array_elements(p_rows) loop
    e := lower(btrim(coalesce(r->>'email', '')));
    n := left(btrim(coalesce(r->>'name', '')), 60);
    if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(e) > 254 then
      skipped := skipped || jsonb_build_object('email', e, 'reason', 'Not a valid email address');
    elsif exists (select 1 from public.invites i where i.email = e and i.status in ('queued', 'sending', 'sent', 'failed')) then
      skipped := skipped || jsonb_build_object('email', e, 'reason', 'Already has an open invitation');
    else
      insert into public.invites (email, display_name, role, course_ids, invited_by) values (e, n, p_role, courses, (select auth.uid()));
      queued := queued + 1;
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped);
end; $$;
revoke all on function public.queue_invites(jsonb, text, text[]) from public, anon;
grant execute on function public.queue_invites(jsonb, text, text[]) to authenticated;

create or replace function public.cancel_invite(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.invites set status = 'cancelled'
  where id = p_id and status in ('queued', 'failed', 'sent') and (invited_by = (select auth.uid()) or public.is_super_admin());
  if not found then raise exception 'This invitation cannot be cancelled' using errcode = '42501'; end if;
end; $$;
revoke all on function public.cancel_invite(uuid) from public, anon;
grant execute on function public.cancel_invite(uuid) to authenticated;

/** Invitations with course titles and whether the person has signed in (accepted). */
create or replace function public.list_invites(p_status text default 'all', p_limit int default 50, p_offset int default 0)
returns table(id uuid, email text, display_name text, role text, course_ids text[], course_titles text[], status text, attempts int,
              last_error text, sent_at timestamptz, created_at timestamptz, accepted_at timestamptz, invited_by_name text, total_rows bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query
  with v as (
    select i.*, u.last_sign_in_at as signed_in_at,
      case when i.status in ('sent', 'enrolled') and u.last_sign_in_at is not null then 'accepted' else i.status end as shown
    from public.invites i left join auth.users u on u.id = i.user_id
    where i.invited_by = (select auth.uid()) or public.is_super_admin())
  select v.id, v.email, v.display_name, v.role, v.course_ids,
    array(select c.title from public.courses c where c.id = any(v.course_ids) order by c.title),
    v.shown, v.attempts, v.last_error, v.sent_at, v.created_at, v.signed_in_at,
    (select p.display_name from public.profiles p where p.id = v.invited_by), count(*) over()::bigint
  from v
  where coalesce(p_status, 'all') = 'all' or v.shown = p_status
     or (p_status = 'waiting' and v.shown in ('queued', 'sending'))
  order by v.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end; $$;
revoke all on function public.list_invites(text, int, int) from public, anon;
grant execute on function public.list_invites(text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Used only by the invite-users Edge Function (service role). Never callable from the browser.
-- ---------------------------------------------------------------------
/** Takes one invitation for sending. A send stuck for 5 minutes (crashed function) can be taken again. */
create or replace function public.claim_invite(p_id uuid, p_resend boolean)
returns setof public.invites language sql security definer set search_path = ''
as $$
  update public.invites set status = 'sending', claimed_at = now(), attempts = attempts + 1, last_error = null
  where id = p_id and (status in ('queued', 'failed') or (p_resend and status = 'sent')
                       or (status = 'sending' and claimed_at < now() - interval '5 minutes'))
  returning *;
$$;

create or replace function public.auth_user_by_email(p_email text)
returns table(id uuid, last_sign_in_at timestamptz, role text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.last_sign_in_at, p.role from auth.users u left join public.profiles p on p.id = u.id where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

/** Enrolls the invited person in the invitation's courses and gives an instructor invitation its role. */
create or replace function public.apply_invite(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare inv public.invites;
begin
  select * into inv from public.invites where id = p_id;
  if inv.id is null then raise exception 'Invitation not found'; end if;
  insert into public.course_enrollments (course_id, user_id, status)
  select c, p_user, 'active' from unnest(inv.course_ids) c where exists (select 1 from public.courses x where x.id = c)
  on conflict (course_id, user_id) do update set status = 'active';
  if inv.role = 'admin' then
    insert into public.admin_allowlist (email) values (inv.email) on conflict do nothing;
    update public.profiles set role = 'admin' where id = p_user and role <> 'admin';
  end if;
end; $$;

revoke all on function public.claim_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.auth_user_by_email(text) from public, anon, authenticated;
revoke all on function public.apply_invite(uuid, uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_invite(uuid, boolean) to service_role;
    grant execute on function public.auth_user_by_email(text) to service_role;
    grant execute on function public.apply_invite(uuid, uuid) to service_role;
    grant select, update on public.invites to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Accounts directory gains the student number (Name / ID column)
-- ---------------------------------------------------------------------
drop function if exists public.lms_admin_students(text, int, int);
create function public.lms_admin_students(p_search text default '', p_limit int default 20, p_offset int default 0)
returns table(user_id uuid, display_name text, email text, role text, joined_at timestamptz, active_courses bigint, total_rows bigint,
              student_number text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare super boolean := public.is_super_admin(); term text := btrim(coalesce(p_search, ''));
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
 return query
 select p.id, p.display_name, u.email::text, p.role, p.created_at,
   (select count(*) from public.course_enrollments e join public.courses c on c.id = e.course_id
     where e.user_id = p.id and e.status = 'active' and (super or c.owner_id = (select auth.uid())))::bigint,
   count(*) over()::bigint, p.student_number, u.last_sign_in_at
 from public.profiles p join auth.users u on u.id = p.id
 where (super or (p.role = 'learner' and (public.teaches_student(p.id) or (term <> '' and lower(u.email) = lower(term)))))
   and (term = '' or p.display_name ilike '%' || term || '%' or u.email ilike '%' || term || '%' or p.student_number ilike '%' || term || '%')
 order by p.created_at desc
 limit least(greatest(coalesce(p_limit, 20), 1), 100)
 offset greatest(coalesce(p_offset, 0), 0);
end; $$;
revoke all on function public.lms_admin_students(text, int, int) from public, anon;
grant execute on function public.lms_admin_students(text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Course roster: invited (never signed in) vs active, with progress
-- ---------------------------------------------------------------------
create or replace function public.course_roster(p_course text)
returns table(user_id uuid, student_name text, student_email text, student_number text, status text, enrolled_at timestamptz,
              signed_in boolean, last_sign_in_at timestamptz, pages_done bigint, pages_total bigint, last_activity_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare total bigint;
begin
  if not public.owns_course(p_course) then raise exception 'You can only view enrollments for your own courses' using errcode = '42501'; end if;
  select count(*) into total from public.learning_units u join public.learning_modules m on m.id = u.module_id
  where m.course_id = p_course and m.published and u.published;
  return query
  select e.user_id, p.display_name, u.email::text, p.student_number, e.status, e.enrolled_at,
    u.last_sign_in_at is not null, u.last_sign_in_at,
    (select count(*) from public.unit_completions x join public.learning_units lu on lu.id = x.unit_id
       join public.learning_modules lm on lm.id = lu.module_id
       where x.user_id = e.user_id and lm.course_id = p_course and lm.published and lu.published),
    total,
    (select max(x.completed_at) from public.unit_completions x join public.learning_units lu on lu.id = x.unit_id
       join public.learning_modules lm on lm.id = lu.module_id where x.user_id = e.user_id and lm.course_id = p_course)
  from public.course_enrollments e join public.profiles p on p.id = e.user_id join auth.users u on u.id = e.user_id
  where e.course_id = p_course
  order by e.status, p.display_name nulls last, u.email;
end; $$;
revoke all on function public.course_roster(text) from public, anon;
grant execute on function public.course_roster(text) to authenticated;
