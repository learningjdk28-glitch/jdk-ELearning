-- JDK Learn v2 incremental migration. Run AFTER supabase_setup.sql and supabase_lms_upgrade.sql.
-- Designed to keep existing users, attempts, notes, and bundled courses intact.
-- Re-runnable. Apply in Supabase SQL Editor with your database administrator account.

alter table public.courses add column if not exists category text not null default 'General';
alter table public.courses add column if not exists published boolean not null default true;
alter table public.courses add column if not exists cover_url text;
alter table public.courses add column if not exists level text not null default 'Beginner';
alter table public.courses drop constraint if exists courses_level_check;
alter table public.courses add constraint courses_level_check check (level in ('Beginner','Intermediate','Advanced'));
create index if not exists courses_published_idx on public.courses (published, created_at desc);

alter table public.learning_modules add column if not exists updated_at timestamptz not null default now();
-- NOT VALID preserves installations that already have orphaned modules; new rows must have valid course IDs.
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'learning_modules_course_fk') then
   alter table public.learning_modules add constraint learning_modules_course_fk
     foreign key (course_id) references public.courses(id) on delete cascade not valid;
 end if;
end $$;
drop trigger if exists set_updated_at on public.learning_modules;
create trigger set_updated_at before update on public.learning_modules for each row execute function public.set_updated_at();

alter table public.learning_materials add column if not exists published boolean not null default true;
create table if not exists public.learning_units (
 id uuid primary key default gen_random_uuid(),
 module_id uuid not null references public.learning_modules(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 160),
 content text not null default '',
 kind text not null default 'article' check (kind in ('article','video','link')),
 position int not null default 0 check (position >= 0),
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists learning_units_module_idx on public.learning_units(module_id,position);
drop trigger if exists set_updated_at on public.learning_units;
create trigger set_updated_at before update on public.learning_units for each row execute function public.set_updated_at();

create table if not exists public.course_enrollments (
 course_id text not null references public.courses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'active' check (status in ('active','revoked')),
 enrolled_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (course_id,user_id)
);
create index if not exists course_enrollments_user_idx on public.course_enrollments(user_id,status);
drop trigger if exists set_updated_at on public.course_enrollments;
create trigger set_updated_at before update on public.course_enrollments for each row execute function public.set_updated_at();

create table if not exists public.unit_completions (
 unit_id uuid not null references public.learning_units(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 completed_at timestamptz not null default now(),
 primary key (unit_id,user_id)
);
create index if not exists unit_completions_user_idx on public.unit_completions(user_id);

-- RLS helpers use the authenticated JWT subject, never a user_id from client-supplied arguments.
create or replace function public.can_access_course(p_course text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select public.is_admin() or exists (
   select 1 from public.courses c
   join public.course_enrollments e on e.course_id = c.id
   where c.id = p_course and c.published = true
     and e.user_id = (select auth.uid()) and e.status = 'active'
 );
$$;
revoke all on function public.can_access_course(text) from public,anon;
grant execute on function public.can_access_course(text) to authenticated;

alter table public.learning_units enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.unit_completions enable row level security;

-- Published course catalog is visible to signed-in students. Drafts are admin-only.
drop policy if exists "courses read" on public.courses;
create policy "courses read" on public.courses for select to authenticated
 using (published or (select public.is_admin()));

-- An authenticated student can self-enroll only into a published course.
drop policy if exists "enrollments read" on public.course_enrollments;
create policy "enrollments read" on public.course_enrollments for select to authenticated
 using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "enrollments insert" on public.course_enrollments;
create policy "enrollments insert" on public.course_enrollments for insert to authenticated
 with check ((select public.is_admin()) or (
   user_id = (select auth.uid()) and status = 'active' and
   exists (select 1 from public.courses c where c.id = course_id and c.published)
 ));
drop policy if exists "enrollments update" on public.course_enrollments;
create policy "enrollments update" on public.course_enrollments for update to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));
-- Only an administrator may remove an enrollment. Otherwise a revoked learner could
-- delete the revoked row and sign up again to bypass the administrator's decision.
drop policy if exists "enrollments delete" on public.course_enrollments;
create policy "enrollments delete" on public.course_enrollments for delete to authenticated
 using ((select public.is_admin()));

-- Current install may contain v1 policies: drop them before defining the stricter version.
drop policy if exists "modules read published or admin" on public.learning_modules;
create policy "modules read published or admin" on public.learning_modules for select to authenticated
 using ((select public.is_admin()) or (published and public.can_access_course(course_id)));

drop policy if exists "units read" on public.learning_units;
create policy "units read" on public.learning_units for select to authenticated
 using ((select public.is_admin()) or (
   published and exists (select 1 from public.learning_modules m
    where m.id = module_id and m.published and public.can_access_course(m.course_id))
 ));
drop policy if exists "units write" on public.learning_units;
create policy "units write" on public.learning_units for all to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "materials read published or admin" on public.learning_materials;
create policy "materials read published or admin" on public.learning_materials for select to authenticated
 using ((select public.is_admin()) or (
  published and exists (select 1 from public.learning_modules m
   where m.id = module_id and m.published and public.can_access_course(m.course_id))
 ));
drop policy if exists "materials admin update" on public.learning_materials;
create policy "materials admin update" on public.learning_materials for update to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));

-- Only students currently enrolled in a published course may mark a published lesson done.
drop policy if exists "completions read" on public.unit_completions;
create policy "completions read" on public.unit_completions for select to authenticated
 using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "completions insert" on public.unit_completions;
create policy "completions insert" on public.unit_completions for insert to authenticated
 with check (user_id = (select auth.uid()) and exists (
  select 1 from public.learning_units u
  join public.learning_modules m on m.id=u.module_id
  where u.id=unit_id and u.published and m.published and public.can_access_course(m.course_id)
 ));
drop policy if exists "completions delete" on public.unit_completions;
create policy "completions delete" on public.unit_completions for delete to authenticated
 using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Private bucket: a signed URL is issued only when object's SELECT policy permits access.
drop policy if exists "read published learning materials" on storage.objects;
create policy "read published learning materials" on storage.objects for select to authenticated
 using (bucket_id = 'learning-materials' and (
   (select public.is_admin()) or exists (
     select 1 from public.learning_materials f
     join public.learning_modules m on m.id=f.module_id
     where f.storage_path = name and f.published and m.published
       and public.can_access_course(m.course_id)
   )
 ));

-- Protect against student role changes. Admin profile editing is allowed; don't change passwords in public tables.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
 using (id = (select auth.uid()) or (select public.is_admin()))
 with check (id = (select auth.uid()) or (select public.is_admin()));

-- Admin summary query is bounded/aggregated and restricted server-side.
create or replace function public.lms_admin_summary()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'students',(select count(*) from public.profiles where role='learner'),
  'admins',(select count(*) from public.profiles where role='admin'),
  'courses',(select count(*) from public.courses),
  'published_courses',(select count(*) from public.courses where published),
  'modules',(select count(*) from public.learning_modules),
  'materials',(select count(*) from public.learning_materials),
  'enrollments',(select count(*) from public.course_enrollments where status='active'),
  'completed_lessons',(select count(*) from public.unit_completions)
 ) into result;
 return result;
end; $$;
revoke all on function public.lms_admin_summary() from public,anon;
grant execute on function public.lms_admin_summary() to authenticated;

-- Atomic enrollment. Revoked students cannot self-reactivate or bypass an administrator.
create or replace function public.enroll_in_course(p_course text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if (select auth.uid()) is null then raise exception 'Login required' using errcode='42501'; end if;
 if not exists (select 1 from public.courses where id=p_course and published=true) then
   raise exception 'Course unavailable' using errcode='42501';
 end if;
 insert into public.course_enrollments(course_id,user_id,status)
 values (p_course, (select auth.uid()),'active')
 on conflict (course_id,user_id) do update set status='active'
 where public.course_enrollments.status <> 'revoked';
 if not found then
   raise exception 'Access was revoked. Please contact an administrator.' using errcode='42501';
 end if;
end; $$;
revoke all on function public.enroll_in_course(text) from public,anon;
grant execute on function public.enroll_in_course(text) to authenticated;

-- NOTE: Access to prebundled offline lessons remains unchanged by design; their enrollment
-- rules must be migrated separately before treating them as private/restricted courses.

-- ---------------------------------------------------------------------
-- Self-graded multiple-choice assessments. Correct answers are never exposed
-- via student SELECT: only a server-side RPC evaluates submitted responses.
-- ---------------------------------------------------------------------
create table if not exists public.learning_quizzes (
 id uuid primary key default gen_random_uuid(),
 module_id uuid not null references public.learning_modules(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 160),
 pass_mark smallint not null default 70 check (pass_mark between 0 and 100),
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists learning_quizzes_module_idx on public.learning_quizzes(module_id);
drop trigger if exists set_updated_at on public.learning_quizzes;
create trigger set_updated_at before update on public.learning_quizzes for each row execute function public.set_updated_at();

create table if not exists public.learning_quiz_questions (
 id uuid primary key default gen_random_uuid(),
 quiz_id uuid not null references public.learning_quizzes(id) on delete cascade,
 prompt text not null check (char_length(btrim(prompt)) between 1 and 3000),
 options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
 correct_index smallint not null check (correct_index >= 0),
 position int not null default 0 check (position >= 0),
 created_at timestamptz not null default now(),
 check (correct_index < jsonb_array_length(options))
);
create index if not exists learning_quiz_questions_quiz_idx on public.learning_quiz_questions(quiz_id, position);

create table if not exists public.learning_quiz_attempts (
 id uuid primary key default gen_random_uuid(),
 quiz_id uuid not null references public.learning_quizzes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 correct_count int not null check (correct_count >= 0),
 question_count int not null check (question_count >= 1),
 score numeric(5,2) not null check (score between 0 and 100),
 passed boolean not null,
 submitted_at timestamptz not null default now(),
 check (correct_count <= question_count)
);
create index if not exists learning_quiz_attempts_user_idx on public.learning_quiz_attempts(user_id,submitted_at desc);
create index if not exists learning_quiz_attempts_quiz_idx on public.learning_quiz_attempts(quiz_id);
alter table public.learning_quizzes enable row level security;
alter table public.learning_quiz_questions enable row level security;
alter table public.learning_quiz_attempts enable row level security;

drop policy if exists "quizzes visible" on public.learning_quizzes;
create policy "quizzes visible" on public.learning_quizzes for select to authenticated
 using ((select public.is_admin()) or (published and exists (
  select 1 from public.learning_modules m where m.id=module_id
    and m.published and public.can_access_course(m.course_id)
 )));
drop policy if exists "quizzes admin write" on public.learning_quizzes;
create policy "quizzes admin write" on public.learning_quizzes for all to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "questions admin only" on public.learning_quiz_questions;
create policy "questions admin only" on public.learning_quiz_questions for all to authenticated
 using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "quiz attempts read" on public.learning_quiz_attempts;
create policy "quiz attempts read" on public.learning_quiz_attempts for select to authenticated
 using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.get_learning_quiz(p_quiz uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if not exists (
   select 1 from public.learning_quizzes q
   join public.learning_modules m on m.id=q.module_id
   where q.id=p_quiz and (public.is_admin() or (q.published and m.published and public.can_access_course(m.course_id)))
 ) then raise exception 'Quiz unavailable' using errcode='42501'; end if;
 select jsonb_build_object('id',q.id,'title',q.title,'pass_mark',q.pass_mark,
   'questions', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'prompt',x.prompt,'options',x.options) order by x.position)
    from public.learning_quiz_questions x where x.quiz_id=q.id), '[]'::jsonb)) into result
 from public.learning_quizzes q where q.id=p_quiz;
 return result;
end; $$;
revoke all on function public.get_learning_quiz(uuid) from public,anon;
grant execute on function public.get_learning_quiz(uuid) to authenticated;

create or replace function public.submit_learning_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r record; total int := 0; correct int := 0; selected int; pct numeric(5,2); passing int; attempt_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Login required' using errcode='42501'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 200 then
  raise exception 'Invalid answers format';
 end if;
 select q.pass_mark into passing from public.learning_quizzes q join public.learning_modules m on m.id=q.module_id
 where q.id=p_quiz and q.published and m.published and public.can_access_course(m.course_id);
 if passing is null then raise exception 'Quiz not available for this account' using errcode='42501'; end if;
 for r in select id, correct_index from public.learning_quiz_questions where quiz_id=p_quiz order by position loop
  total := total + 1;
  select case when (j->>'choice') ~ '^[0-9]{1,2}$' then (j->>'choice')::int else null end into selected
   from jsonb_array_elements(p_answers) j where j->>'questionId'=r.id::text limit 1;
  if selected=r.correct_index then correct:=correct+1; end if;
 end loop;
 if total=0 then raise exception 'This quiz has no questions yet'; end if;
 pct:=round(correct::numeric*100/total,2);
 insert into public.learning_quiz_attempts(quiz_id,user_id,correct_count,question_count,score,passed)
 values (p_quiz,(select auth.uid()),correct,total,pct,pct >= passing) returning id into attempt_id;
 return jsonb_build_object('attempt_id',attempt_id,'score',pct,'correct',correct,'total',total,'passed',pct >= passing,'pass_mark',passing);
end; $$;
revoke all on function public.submit_learning_quiz(uuid,jsonb) from public,anon;
grant execute on function public.submit_learning_quiz(uuid,jsonb) to authenticated;

-- Admin-only, server-paginated student directory (emails stay inside Auth otherwise).
create or replace function public.lms_admin_students(p_search text default '', p_limit int default 20, p_offset int default 0)
returns table(user_id uuid, display_name text, email text, role text, joined_at timestamptz, active_courses bigint, total_rows bigint)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return query
 select p.id, p.display_name, u.email, p.role, p.created_at,
   (select count(*) from public.course_enrollments e where e.user_id=p.id and e.status='active')::bigint,
   count(*) over()::bigint
 from public.profiles p join auth.users u on u.id=p.id
 where (p_search is null or p_search='' or p.display_name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
 order by p.created_at desc
 limit least(greatest(coalesce(p_limit,20),1),100)
 offset greatest(coalesce(p_offset,0),0);
end; $$;
revoke all on function public.lms_admin_students(text,int,int) from public,anon;
grant execute on function public.lms_admin_students(text,int,int) to authenticated;

-- Verified course certificates. Issuance is exclusively server-side; students cannot
-- award themselves a certificate without all published lessons and quizzes completed.
create table if not exists public.lms_certificates (
 id uuid primary key default gen_random_uuid(),
 course_id text not null references public.courses(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 course_title text not null,
 student_name text not null,
 issued_at timestamptz not null default now(),
 unique(course_id,user_id)
);
create index if not exists lms_certificates_user_idx on public.lms_certificates(user_id,issued_at desc);
alter table public.lms_certificates enable row level security;
drop policy if exists "certificates select" on public.lms_certificates;
create policy "certificates select" on public.lms_certificates for select to authenticated
 using (user_id=(select auth.uid()) or (select public.is_admin()));
drop policy if exists "certificates admin revoke" on public.lms_certificates;
create policy "certificates admin revoke" on public.lms_certificates for delete to authenticated
 using ((select public.is_admin()));

create or replace function public.issue_lms_certificate(p_course text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare total int; done int; pending_quizzes int; awarded public.lms_certificates%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if not exists (select 1 from public.courses c join public.course_enrollments e on e.course_id=c.id
   where c.id=p_course and c.published and e.user_id=(select auth.uid()) and e.status='active') then
   raise exception 'Enroll in the published course first' using errcode='42501'; end if;
 select count(*) into total from public.learning_units u
 join public.learning_modules m on m.id=u.module_id
 where m.course_id=p_course and m.published and u.published;
 if total=0 then raise exception 'This course has no published lessons yet'; end if;
 select count(*) into done from public.unit_completions x
 join public.learning_units u on u.id=x.unit_id
 join public.learning_modules m on m.id=u.module_id
 where m.course_id=p_course and m.published and u.published and x.user_id=(select auth.uid());
 if done<total then raise exception 'Complete all published lessons first'; end if;
 select count(*) into pending_quizzes from public.learning_quizzes q
 join public.learning_modules m on m.id=q.module_id
 where m.course_id=p_course and m.published and q.published and not exists (
   select 1 from public.learning_quiz_attempts a
   where a.quiz_id=q.id and a.user_id=(select auth.uid()) and a.passed=true
 );
 if pending_quizzes>0 then raise exception 'Pass all published quizzes first'; end if;
 insert into public.lms_certificates(course_id,user_id,course_title,student_name)
 select c.id,(select auth.uid()),c.title,coalesce(p.display_name,split_part(u.email,'@',1))
 from public.courses c join auth.users u on u.id=(select auth.uid())
 join public.profiles p on p.id=u.id where c.id=p_course
 on conflict(course_id,user_id) do nothing;
 select * into awarded from public.lms_certificates where course_id=p_course and user_id=(select auth.uid());
 return jsonb_build_object('id',awarded.id,'course',awarded.course_title,
  'student',awarded.student_name,'issued_at',awarded.issued_at);
end; $$;
revoke all on function public.issue_lms_certificate(text) from public,anon;
grant execute on function public.issue_lms_certificate(text) to authenticated;

create or replace function public.lms_admin_course_metrics()
returns table(course_id text, course_title text, enrollments bigint, completed_units bigint, quiz_submissions bigint, average_quiz_score numeric)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return query
 select c.id,c.title,
   (select count(*) from public.course_enrollments e where e.course_id=c.id and e.status='active')::bigint,
   (select count(*) from public.unit_completions x
     join public.learning_units u on u.id=x.unit_id
     join public.learning_modules m on m.id=u.module_id where m.course_id=c.id)::bigint,
   (select count(*) from public.learning_quiz_attempts a
     join public.learning_quizzes q on q.id=a.quiz_id
     join public.learning_modules m on m.id=q.module_id where m.course_id=c.id)::bigint,
   (select round(avg(a.score),1) from public.learning_quiz_attempts a
     join public.learning_quizzes q on q.id=a.quiz_id
     join public.learning_modules m on m.id=q.module_id where m.course_id=c.id)
 from public.courses c order by 3 desc,c.title limit 100;
end; $$;
revoke all on function public.lms_admin_course_metrics() from public,anon;
grant execute on function public.lms_admin_course_metrics() to authenticated;

create or replace function public.lms_admin_enrollments(p_course text, p_limit int default 20, p_offset int default 0)
returns table(course_id text, user_id uuid, student_name text, student_email text, status text, enrolled_at timestamptz, total_rows bigint)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return query
 select e.course_id,e.user_id,p.display_name,u.email,e.status,e.enrolled_at,count(*) over()::bigint
 from public.course_enrollments e join public.profiles p on p.id=e.user_id join auth.users u on u.id=e.user_id
 where e.course_id=p_course
 order by e.enrolled_at desc limit least(greatest(coalesce(p_limit,20),1),100)
 offset greatest(coalesce(p_offset,0),0);
end; $$;
revoke all on function public.lms_admin_enrollments(text,int,int) from public,anon;
grant execute on function public.lms_admin_enrollments(text,int,int) to authenticated;

-- Content validation for learner-facing external links; never allow javascript: URLs.
alter table public.learning_units drop constraint if exists learning_units_safe_url;
alter table public.learning_units add constraint learning_units_safe_url check (
 kind='article' or content ~* '^https://[^[:space:]]+$'
);
