-- =====================================================================
-- JDK Learn - Phase 0: course ownership, super administrator, profile fields.
-- Run AFTER: supabase_setup.sql, supabase_lms_upgrade.sql, 20261113_lms_v2.sql, 20261114_admin_allowlist.sql.
-- Safe to re-run. Back up first. Changes NO existing rows except: backfills student numbers for learners.
--
-- Model
--   learner                       student
--   admin                         instructor: manages ONLY courses they own and students enrolled in them
--   admin + is_super_admin        sees and manages everything, changes roles, manages the admin email list
--
-- Existing courses keep owner_id = NULL ("unassigned"): only the super administrator can edit them
-- until an owner is set:  update public.courses set owner_id = '<instructor uuid>' where id = '<course id>';
-- Make yourself super administrator (SQL Editor only):
--   update public.profiles set role = 'admin', is_super_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
--
-- NOTE: if you ever re-run supabase_setup.sql or 20261113_lms_v2.sql, re-run every later file in
-- supabase/migrations afterwards, in order. They restore older, broader policies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_super_admin boolean not null default false;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists school_id text;
alter table public.profiles add column if not exists student_number text;

-- Validation. Keep these patterns identical to src/lib/validation.js (tests/phase0.test.mjs checks both).
alter table public.profiles drop constraint if exists profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check
  check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{6,19}$');
alter table public.profiles drop constraint if exists profiles_address_check;
alter table public.profiles add constraint profiles_address_check
  check (address is null or char_length(btrim(address)) between 5 and 300);
alter table public.profiles drop constraint if exists profiles_school_id_check;
alter table public.profiles add constraint profiles_school_id_check
  check (school_id is null or school_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$');
alter table public.profiles drop constraint if exists profiles_student_number_check;
alter table public.profiles add constraint profiles_student_number_check
  check (student_number is null or student_number ~ '^S-[0-9]{4}-[0-9]{4,}$');
create unique index if not exists profiles_student_number_key on public.profiles (student_number);

alter table public.courses add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists courses_owner_idx on public.courses (owner_id);

-- ---------------------------------------------------------------------
-- 2. Permission helpers. SECURITY DEFINER so they read the tables without recursing through RLS.
--    All of them use the signed-in JWT subject, never a user id passed by the client.
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin' and p.is_super_admin);
$$;

-- True when the signed-in instructor owns the course (or is the super administrator).
create or replace function public.owns_course(p_course text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.courses c join public.profiles p on p.id = c.owner_id
    where c.id = p_course and c.owner_id = (select auth.uid()) and p.role = 'admin');
$$;

create or replace function public.owns_module(p_module uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.learning_modules m where m.id = p_module and public.owns_course(m.course_id));
$$;

-- True when the student is (or was) enrolled in a course the signed-in instructor owns.
create or replace function public.teaches_student(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_super_admin() or (public.is_admin() and exists (
    select 1 from public.course_enrollments e join public.courses c on c.id = e.course_id
    where e.user_id = p_user and c.owner_id = (select auth.uid())));
$$;

-- Storage paths are "<module uuid>/<file>". Malformed paths are super-admin only.
create or replace function public.owns_material_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare head text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if head ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.owns_module(head::uuid);
  end if;
  return public.is_super_admin();
end; $$;

do $$
declare f text;
begin
  foreach f in array array['is_super_admin()', 'owns_course(text)', 'owns_module(uuid)', 'teaches_student(uuid)', 'owns_material_path(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Enrolled learners keep access; course owners replace the old "any admin" shortcut.
create or replace function public.can_access_course(p_course text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select public.owns_course(p_course) or exists (
   select 1 from public.courses c
   join public.course_enrollments e on e.course_id = c.id
   where c.id = p_course and c.published = true
     and e.user_id = (select auth.uid()) and e.status = 'active'
 );
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers: course owner default, student numbers, profile guard
-- ---------------------------------------------------------------------
create or replace function public.set_course_owner()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.owner_id := coalesce(new.owner_id, (select auth.uid()));
  return new;
end; $$;
drop trigger if exists set_course_owner on public.courses;
create trigger set_course_owner before insert on public.courses
  for each row execute function public.set_course_owner();

create sequence if not exists public.student_number_seq;
revoke all on sequence public.student_number_seq from public, anon, authenticated;

-- Every learner gets a readable, unique, permanent number: S-<year>-<0001>.
create or replace function public.assign_student_number()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'learner' and new.student_number is null then
    new.student_number := 'S-' || to_char(now(), 'YYYY') || '-'
                          || lpad(nextval('public.student_number_seq')::text, 4, '0');
  end if;
  return new;
end; $$;
revoke all on function public.assign_student_number() from public, anon, authenticated;
drop trigger if exists assign_student_number on public.profiles;
create trigger assign_student_number before insert or update of role on public.profiles
  for each row execute function public.assign_student_number();

-- Roles and the super flag change only through the super administrator (or the SQL Editor,
-- where no user is signed in). The student number never changes once set.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    if new.role is distinct from old.role or new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'Only the super administrator can change a role' using errcode = '42501';
    end if;
    if old.student_number is not null and new.student_number is distinct from old.student_number then
      raise exception 'The student number cannot be changed' using errcode = '42501';
    end if;
  end if;
  new.id := old.id;
  return new;
end; $$;

-- Backfill learners that existed before this migration, oldest first, numbered by join year.
do $$
declare r record;
begin
  for r in select id, created_at from public.profiles
           where role = 'learner' and student_number is null order by created_at, id loop
    update public.profiles
      set student_number = 'S-' || to_char(r.created_at, 'YYYY') || '-'
                           || lpad(nextval('public.student_number_seq')::text, 4, '0')
      where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Policies: replace "any admin" with "owner of this course" (or super administrator)
-- ---------------------------------------------------------------------
-- profiles: own row; instructors read the students they teach; super administrator reads all.
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.teaches_student(id));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()))
  with check (id = (select auth.uid()) or (select public.is_super_admin()));

-- admin email list: super administrator only.
drop policy if exists "admins manage the admin list" on public.admin_allowlist;
create policy "admins manage the admin list" on public.admin_allowlist
  for all to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- courses: published catalog for everyone signed in; drafts and writes for the owner.
drop policy if exists "courses read" on public.courses;
create policy "courses read" on public.courses for select to authenticated
  using (published or public.owns_course(id));
drop policy if exists "courses admin insert" on public.courses;
create policy "courses admin insert" on public.courses for insert to authenticated
  with check ((select public.is_super_admin()) or ((select public.is_admin()) and owner_id = (select auth.uid())));
drop policy if exists "courses admin update" on public.courses;
create policy "courses admin update" on public.courses for update to authenticated
  using (public.owns_course(id))
  with check ((select public.is_super_admin()) or ((select public.is_admin()) and owner_id = (select auth.uid())));
drop policy if exists "courses admin delete" on public.courses;
create policy "courses admin delete" on public.courses for delete to authenticated
  using (public.owns_course(id));

-- legacy bundled-course tables (moved into the new tables in Phase 2).
drop policy if exists "lessons admin insert" on public.lessons;
create policy "lessons admin insert" on public.lessons for insert to authenticated with check (public.owns_course(course_id));
drop policy if exists "lessons admin update" on public.lessons;
create policy "lessons admin update" on public.lessons for update to authenticated using (public.owns_course(course_id)) with check (public.owns_course(course_id));
drop policy if exists "lessons admin delete" on public.lessons;
create policy "lessons admin delete" on public.lessons for delete to authenticated using (public.owns_course(course_id));
drop policy if exists "questions admin insert" on public.questions;
create policy "questions admin insert" on public.questions for insert to authenticated
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and public.owns_course(l.course_id)));
drop policy if exists "questions admin update" on public.questions;
create policy "questions admin update" on public.questions for update to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and public.owns_course(l.course_id)))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and public.owns_course(l.course_id)));
drop policy if exists "questions admin delete" on public.questions;
create policy "questions admin delete" on public.questions for delete to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and public.owns_course(l.course_id)));

-- learner records: the learner, or the owner of the course the record belongs to.
drop policy if exists "assessment_attempts select own" on public.assessment_attempts;
create policy "assessment_attempts select own" on public.assessment_attempts for select to authenticated
  using ((select auth.uid()) = user_id or public.owns_course(course_id));
drop policy if exists "assessment_answers select own" on public.assessment_answers;
create policy "assessment_answers select own" on public.assessment_answers for select to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from public.assessment_attempts a
         where a.id = attempt_id and public.owns_course(a.course_id)));
drop policy if exists "competency_results select own" on public.competency_results;
create policy "competency_results select own" on public.competency_results for select to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from public.assessment_attempts a
         where a.id = attempt_id and public.owns_course(a.course_id)));
drop policy if exists "learning_preferences select own" on public.learning_preferences;
create policy "learning_preferences select own" on public.learning_preferences for select to authenticated
  using ((select auth.uid()) = user_id or public.teaches_student(user_id));
drop policy if exists "lesson_progress select own" on public.lesson_progress;
create policy "lesson_progress select own" on public.lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from public.lessons l
         where l.id = lesson_id and public.owns_course(l.course_id)));
drop policy if exists "lesson_notes select own" on public.lesson_notes;
create policy "lesson_notes select own" on public.lesson_notes for select to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from public.lessons l
         where l.id = lesson_id and public.owns_course(l.course_id)));

-- modules
drop policy if exists "modules read published or admin" on public.learning_modules;
create policy "modules read published or admin" on public.learning_modules for select to authenticated
  using (public.owns_course(course_id) or (published and public.can_access_course(course_id)));
drop policy if exists "modules admin insert" on public.learning_modules;
create policy "modules admin insert" on public.learning_modules for insert to authenticated with check (public.owns_course(course_id));
drop policy if exists "modules admin update" on public.learning_modules;
create policy "modules admin update" on public.learning_modules for update to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));
drop policy if exists "modules admin delete" on public.learning_modules;
create policy "modules admin delete" on public.learning_modules for delete to authenticated using (public.owns_course(course_id));

-- units (lesson pages)
drop policy if exists "units read" on public.learning_units;
create policy "units read" on public.learning_units for select to authenticated
  using (public.owns_module(module_id) or (
    published and exists (select 1 from public.learning_modules m
      where m.id = module_id and m.published and public.can_access_course(m.course_id))));
drop policy if exists "units write" on public.learning_units;
create policy "units write" on public.learning_units for all to authenticated
  using (public.owns_module(module_id)) with check (public.owns_module(module_id));

-- materials
drop policy if exists "materials read published or admin" on public.learning_materials;
create policy "materials read published or admin" on public.learning_materials for select to authenticated
  using (public.owns_module(module_id) or (
    published and exists (select 1 from public.learning_modules m
      where m.id = module_id and m.published and public.can_access_course(m.course_id))));
drop policy if exists "materials admin insert" on public.learning_materials;
create policy "materials admin insert" on public.learning_materials for insert to authenticated with check (public.owns_module(module_id));
drop policy if exists "materials admin update" on public.learning_materials;
create policy "materials admin update" on public.learning_materials for update to authenticated
  using (public.owns_module(module_id)) with check (public.owns_module(module_id));
drop policy if exists "materials admin delete" on public.learning_materials;
create policy "materials admin delete" on public.learning_materials for delete to authenticated using (public.owns_module(module_id));

-- quizzes
drop policy if exists "quizzes visible" on public.learning_quizzes;
create policy "quizzes visible" on public.learning_quizzes for select to authenticated
  using (public.owns_module(module_id) or (published and exists (
    select 1 from public.learning_modules m where m.id = module_id
      and m.published and public.can_access_course(m.course_id))));
drop policy if exists "quizzes admin write" on public.learning_quizzes;
create policy "quizzes admin write" on public.learning_quizzes for all to authenticated
  using (public.owns_module(module_id)) with check (public.owns_module(module_id));
drop policy if exists "questions admin only" on public.learning_quiz_questions;
create policy "questions admin only" on public.learning_quiz_questions for all to authenticated
  using (exists (select 1 from public.learning_quizzes q where q.id = quiz_id and public.owns_module(q.module_id)))
  with check (exists (select 1 from public.learning_quizzes q where q.id = quiz_id and public.owns_module(q.module_id)));
drop policy if exists "quiz attempts read" on public.learning_quiz_attempts;
create policy "quiz attempts read" on public.learning_quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.learning_quizzes q
         where q.id = quiz_id and public.owns_module(q.module_id)));

-- enrollments
drop policy if exists "enrollments read" on public.course_enrollments;
create policy "enrollments read" on public.course_enrollments for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_course(course_id));
drop policy if exists "enrollments insert" on public.course_enrollments;
create policy "enrollments insert" on public.course_enrollments for insert to authenticated
  with check (public.owns_course(course_id) or (
    user_id = (select auth.uid()) and status = 'active' and
    exists (select 1 from public.courses c where c.id = course_id and c.published)));
drop policy if exists "enrollments update" on public.course_enrollments;
create policy "enrollments update" on public.course_enrollments for update to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));
drop policy if exists "enrollments delete" on public.course_enrollments;
create policy "enrollments delete" on public.course_enrollments for delete to authenticated
  using (public.owns_course(course_id));

-- lesson completions
drop policy if exists "completions read" on public.unit_completions;
create policy "completions read" on public.unit_completions for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.learning_units u
         where u.id = unit_id and public.owns_module(u.module_id)));
drop policy if exists "completions delete" on public.unit_completions;
create policy "completions delete" on public.unit_completions for delete to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.learning_units u
         where u.id = unit_id and public.owns_module(u.module_id)));

-- certificates
drop policy if exists "certificates select" on public.lms_certificates;
create policy "certificates select" on public.lms_certificates for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_course(course_id));
drop policy if exists "certificates admin revoke" on public.lms_certificates;
create policy "certificates admin revoke" on public.lms_certificates for delete to authenticated
  using (public.owns_course(course_id));

-- storage: learning-materials bucket
drop policy if exists "read published learning materials" on storage.objects;
create policy "read published learning materials" on storage.objects for select to authenticated
  using (bucket_id = 'learning-materials' and (
    public.owns_material_path(name) or exists (
      select 1 from public.learning_materials f join public.learning_modules m on m.id = f.module_id
      where f.storage_path = name and f.published and m.published and public.can_access_course(m.course_id))));
drop policy if exists "admin uploads learning materials" on storage.objects;
create policy "admin uploads learning materials" on storage.objects for insert to authenticated
  with check (bucket_id = 'learning-materials' and public.owns_material_path(name));
drop policy if exists "admin deletes learning materials" on storage.objects;
create policy "admin deletes learning materials" on storage.objects for delete to authenticated
  using (bucket_id = 'learning-materials' and public.owns_material_path(name));

-- ---------------------------------------------------------------------
-- 5. Server functions scoped to the caller's own courses
-- ---------------------------------------------------------------------
create or replace function public.lms_admin_summary()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb; super boolean := public.is_super_admin();
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
 with mine as (select c.id, c.published from public.courses c where public.owns_course(c.id)),
      mods as (select m.id from public.learning_modules m where m.course_id in (select id from mine))
 select jsonb_build_object(
  'students', case when super then (select count(*) from public.profiles where role = 'learner')
                   else (select count(distinct e.user_id) from public.course_enrollments e
                         where e.course_id in (select id from mine) and e.status = 'active') end,
  'admins', case when super then (select count(*) from public.profiles where role = 'admin') end,
  'courses', (select count(*) from mine),
  'published_courses', (select count(*) from mine where published),
  'modules', (select count(*) from mods),
  'materials', (select count(*) from public.learning_materials f where f.module_id in (select id from mods)),
  'enrollments', (select count(*) from public.course_enrollments e
                  where e.course_id in (select id from mine) and e.status = 'active'),
  'completed_lessons', (select count(*) from public.unit_completions x join public.learning_units u on u.id = x.unit_id
                        where u.module_id in (select id from mods))
 ) into result;
 return result;
end; $$;

-- Directory. Super administrator: everyone. Instructor: the students they teach, plus an exact
-- email match on any learner (to enroll someone new) - never a browsable list of all students.
create or replace function public.lms_admin_students(p_search text default '', p_limit int default 20, p_offset int default 0)
returns table(user_id uuid, display_name text, email text, role text, joined_at timestamptz, active_courses bigint, total_rows bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare super boolean := public.is_super_admin(); term text := btrim(coalesce(p_search, ''));
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
 return query
 select p.id, p.display_name, u.email::text, p.role, p.created_at,
   (select count(*) from public.course_enrollments e join public.courses c on c.id = e.course_id
     where e.user_id = p.id and e.status = 'active' and (super or c.owner_id = (select auth.uid())))::bigint,
   count(*) over()::bigint
 from public.profiles p join auth.users u on u.id = p.id
 where (super or (p.role = 'learner' and (public.teaches_student(p.id) or (term <> '' and lower(u.email) = lower(term)))))
   and (term = '' or p.display_name ilike '%' || term || '%' or u.email ilike '%' || term || '%')
 order by p.created_at desc
 limit least(greatest(coalesce(p_limit, 20), 1), 100)
 offset greatest(coalesce(p_offset, 0), 0);
end; $$;

create or replace function public.lms_admin_course_metrics()
returns table(course_id text, course_title text, enrollments bigint, completed_units bigint, quiz_submissions bigint, average_quiz_score numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
 return query
 select c.id, c.title,
   (select count(*) from public.course_enrollments e where e.course_id = c.id and e.status = 'active')::bigint,
   (select count(*) from public.unit_completions x
     join public.learning_units u on u.id = x.unit_id
     join public.learning_modules m on m.id = u.module_id where m.course_id = c.id)::bigint,
   (select count(*) from public.learning_quiz_attempts a
     join public.learning_quizzes q on q.id = a.quiz_id
     join public.learning_modules m on m.id = q.module_id where m.course_id = c.id)::bigint,
   (select round(avg(a.score), 1) from public.learning_quiz_attempts a
     join public.learning_quizzes q on q.id = a.quiz_id
     join public.learning_modules m on m.id = q.module_id where m.course_id = c.id)
 from public.courses c where public.owns_course(c.id) order by 3 desc, c.title limit 100;
end; $$;

create or replace function public.lms_admin_enrollments(p_course text, p_limit int default 20, p_offset int default 0)
returns table(course_id text, user_id uuid, student_name text, student_email text, status text, enrolled_at timestamptz, total_rows bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not public.owns_course(p_course) then raise exception 'You can only view enrollments for your own courses' using errcode = '42501'; end if;
 return query
 select e.course_id, e.user_id, p.display_name, u.email::text, e.status, e.enrolled_at, count(*) over()::bigint
 from public.course_enrollments e join public.profiles p on p.id = e.user_id join auth.users u on u.id = e.user_id
 where e.course_id = p_course
 order by e.enrolled_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)
 offset greatest(coalesce(p_offset, 0), 0);
end; $$;

create or replace function public.get_learning_quiz(p_quiz uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
 if not exists (
   select 1 from public.learning_quizzes q
   join public.learning_modules m on m.id = q.module_id
   where q.id = p_quiz and (public.owns_course(m.course_id) or (q.published and m.published and public.can_access_course(m.course_id)))
 ) then raise exception 'Quiz unavailable' using errcode = '42501'; end if;
 select jsonb_build_object('id', q.id, 'title', q.title, 'pass_mark', q.pass_mark,
   'questions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'prompt', x.prompt, 'options', x.options) order by x.position)
    from public.learning_quiz_questions x where x.quiz_id = q.id), '[]'::jsonb)) into result
 from public.learning_quizzes q where q.id = p_quiz;
 return result;
end; $$;
