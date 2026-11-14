-- =====================================================================
-- JDK Learn - Phase 5a: assignments, submissions, grading.
-- Run AFTER the Phase 4 migrations. Safe to re-run. Adds tables, a private storage bucket and functions.
--
--   * assignments: per course (optionally inside a module), with a deadline and accepted submission types.
--   * assignment_submissions: one per student per assignment. Late = received after the deadline
--     (server time). A student may replace it until it is graded. Instructors grade; they cannot edit
--     what the student handed in, and students cannot touch the grade.
--   * Storage bucket "submissions" (private, 50 MB per file). Path: <assignment id>/<student id>/<file>.
--     MAX_SUBMISSION_BYTES in src/lib/submissionRules.js must equal the limit here (tests check it).
-- =====================================================================

create or replace function public.max_submission_bytes()
returns bigint language sql immutable set search_path = ''
as $$ select 52428800::bigint $$;  -- 50 MB: Supabase free plan per-file upload limit

-- ---------------------------------------------------------------------
-- 1. Assignments
-- ---------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  module_id uuid references public.learning_modules(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 10000),
  due_at timestamptz not null,
  allow_late boolean not null default true,
  max_points int not null default 100 check (max_points between 1 and 1000),
  submission_types text[] not null default array['link', 'file'],
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(submission_types) between 1 and 3 and submission_types <@ array['link', 'file', 'text'])
);
create index if not exists assignments_course_idx on public.assignments (course_id, due_at);
drop trigger if exists set_updated_at on public.assignments;
create trigger set_updated_at before update on public.assignments for each row execute function public.set_updated_at();

-- SECURITY DEFINER: checks must see the true answer; permission is RLS's job.
create or replace function public.guard_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.module_id is not null and not exists (
       select 1 from public.learning_modules m where m.id = new.module_id and m.course_id = new.course_id) then
    raise exception 'The module must belong to the same course.' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.guard_assignment() from public, anon, authenticated;
drop trigger if exists guard_assignment on public.assignments;
create trigger guard_assignment before insert or update on public.assignments for each row execute function public.guard_assignment();

alter table public.assignments enable row level security;
drop policy if exists "assignments read" on public.assignments;
create policy "assignments read" on public.assignments for select to authenticated
  using (public.owns_course(course_id) or (published and public.can_access_course(course_id)));
drop policy if exists "assignments write" on public.assignments;
create policy "assignments write" on public.assignments for all to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- ---------------------------------------------------------------------
-- 2. Submissions
-- ---------------------------------------------------------------------
create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('link', 'file', 'text')),
  link_url text check (link_url is null or link_url ~* '^https://[^[:space:]]+$'),
  body text check (body is null or char_length(body) between 1 and 10000),
  file_path text,
  file_name text check (file_name is null or char_length(file_name) between 1 and 200),
  file_size bigint check (file_size is null or (file_size > 0 and file_size <= public.max_submission_bytes())),
  mime_type text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  score numeric(7,2),
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  graded_at timestamptz,
  graded_by uuid references auth.users(id) on delete set null,
  unique (assignment_id, user_id),
  check ((kind = 'link' and link_url is not null) or (kind = 'text' and body is not null)
      or (kind = 'file' and file_path is not null and file_name is not null and file_size is not null))
);
create index if not exists assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id);

-- Students: hand in / replace until graded. Server time decides lateness. Instructors: only grade fields.
create or replace function public.guard_submission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare a public.assignments%rowtype; uid uuid := (select auth.uid()); teacher boolean;
begin
  select * into a from public.assignments where id = new.assignment_id;
  teacher := uid is null or public.owns_course(a.course_id);

  if tg_op = 'UPDATE' and teacher and uid is distinct from old.user_id then
    -- Grading: nothing the student handed in may change.
    if (new.kind, new.link_url, new.body, new.file_path, new.file_name, new.file_size, new.mime_type, new.submitted_at, new.is_late, new.user_id, new.assignment_id)
       is distinct from (old.kind, old.link_url, old.body, old.file_path, old.file_name, old.file_size, old.mime_type, old.submitted_at, old.is_late, old.user_id, old.assignment_id) then
      raise exception 'Instructors can grade a submission but not change it.' using errcode = '42501';
    end if;
    if new.score is not null and (new.score < 0 or new.score > a.max_points) then
      raise exception 'Score must be between 0 and %.', a.max_points using errcode = '23514';
    end if;
    new.graded_at := case when new.score is null then null else now() end;
    new.graded_by := case when new.score is null then null else uid end;
    return new;
  end if;

  -- Student hand-in (insert) or replacement (update).
  if tg_op = 'UPDATE' and old.score is not null then
    raise exception 'This submission has been graded and can no longer be changed.' using errcode = '42501';
  end if;
  if not a.allow_late and now() > a.due_at then
    raise exception 'The deadline has passed and this assignment does not accept late work.' using errcode = '42501';
  end if;
  if not (new.kind = any (a.submission_types)) then
    raise exception 'This assignment does not accept % submissions.', new.kind using errcode = '23514';
  end if;
  if new.kind = 'file' and (split_part(new.file_path, '/', 1) <> new.assignment_id::text or split_part(new.file_path, '/', 2) <> new.user_id::text) then
    raise exception 'File path does not match this submission.' using errcode = '23514';
  end if;
  new.submitted_at := now();
  new.is_late := now() > a.due_at;
  new.score := null; new.feedback := null; new.graded_at := null; new.graded_by := null;
  return new;
end; $$;
revoke all on function public.guard_submission() from public, anon, authenticated;
drop trigger if exists guard_submission on public.assignment_submissions;
create trigger guard_submission before insert or update on public.assignment_submissions
  for each row execute function public.guard_submission();

alter table public.assignment_submissions enable row level security;
drop policy if exists "submissions read" on public.assignment_submissions;
create policy "submissions read" on public.assignment_submissions for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.assignments a where a.id = assignment_id and public.owns_course(a.course_id)));
drop policy if exists "submissions hand in" on public.assignment_submissions;
create policy "submissions hand in" on public.assignment_submissions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.assignments a where a.id = assignment_id and a.published and public.can_access_course(a.course_id)));
drop policy if exists "submissions update" on public.assignment_submissions;
create policy "submissions update" on public.assignment_submissions for update to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.assignments a where a.id = assignment_id and public.owns_course(a.course_id)))
  with check (user_id = (select auth.uid()) or exists (select 1 from public.assignments a where a.id = assignment_id and public.owns_course(a.course_id)));

-- ---------------------------------------------------------------------
-- 3. Storage bucket for submission files (private)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A student writes only inside <assignment>/<their own id>/, for a published assignment they can access.
create or replace function public.can_upload_submission(p_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare a_id text := split_part(coalesce(p_name, ''), '/', 1); u_id text := split_part(coalesce(p_name, ''), '/', 2);
begin
  if a_id !~* '^[0-9a-f-]{36}$' or u_id <> coalesce((select auth.uid())::text, '-') then return false; end if;
  return exists (select 1 from public.assignments a where a.id = a_id::uuid and a.published and public.can_access_course(a.course_id)
                 and (a.allow_late or now() <= a.due_at) and 'file' = any (a.submission_types));
end; $$;
create or replace function public.can_read_submission_file(p_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare a_id text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if split_part(coalesce(p_name, ''), '/', 2) = coalesce((select auth.uid())::text, '-') then return true; end if;
  if a_id !~* '^[0-9a-f-]{36}$' then return false; end if;
  return exists (select 1 from public.assignments a where a.id = a_id::uuid and public.owns_course(a.course_id));
end; $$;
revoke all on function public.can_upload_submission(text) from public, anon;
grant execute on function public.can_upload_submission(text) to authenticated;
revoke all on function public.can_read_submission_file(text) from public, anon;
grant execute on function public.can_read_submission_file(text) to authenticated;

drop policy if exists "students upload submission files" on storage.objects;
create policy "students upload submission files" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.can_upload_submission(name));
drop policy if exists "read submission files" on storage.objects;
create policy "read submission files" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.can_read_submission_file(name));
drop policy if exists "students remove own submission files" on storage.objects;
create policy "students remove own submission files" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and split_part(name, '/', 2) = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 4. Instructor views
-- ---------------------------------------------------------------------
-- Every enrolled student with their submission (or none): drives "missing", "late", "to grade".
create or replace function public.assignment_roster(p_assignment uuid)
returns table(user_id uuid, student_name text, student_email text, student_number text, submission_id uuid, kind text,
              link_url text, body text, file_path text, file_name text, file_size bigint, submitted_at timestamptz,
              is_late boolean, score numeric, feedback text, graded_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare c text;
begin
  select course_id into c from public.assignments where id = p_assignment;
  if c is null or not public.owns_course(c) then raise exception 'You can only view submissions for your own courses' using errcode = '42501'; end if;
  return query
  select p.id, p.display_name, u.email::text, p.student_number, s.id, s.kind, s.link_url, s.body, s.file_path, s.file_name, s.file_size,
         s.submitted_at, s.is_late, s.score, s.feedback, s.graded_at
  from public.course_enrollments e
  join public.profiles p on p.id = e.user_id
  join auth.users u on u.id = e.user_id
  left join public.assignment_submissions s on s.assignment_id = p_assignment and s.user_id = e.user_id
  where e.course_id = c and (e.status = 'active' or s.id is not null)
  order by s.submitted_at nulls last, p.display_name;
end; $$;
revoke all on function public.assignment_roster(uuid) from public, anon;
grant execute on function public.assignment_roster(uuid) to authenticated;

-- Bytes stored: this course (materials + submission files) and the whole project (free plan: 1 GB).
create or replace function public.storage_usage(p_course text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.owns_course(p_course) then raise exception 'You can only view storage for your own courses' using errcode = '42501'; end if;
  return jsonb_build_object(
    'course_bytes',
      coalesce((select sum(f.file_size) from public.learning_materials f join public.learning_modules m on m.id = f.module_id where m.course_id = p_course), 0)
    + coalesce((select sum(s.file_size) from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = p_course), 0),
    'project_bytes',
      coalesce((select sum(file_size) from public.learning_materials), 0) + coalesce((select sum(file_size) from public.assignment_submissions), 0));
end; $$;
revoke all on function public.storage_usage(text) from public, anon;
grant execute on function public.storage_usage(text) to authenticated;
