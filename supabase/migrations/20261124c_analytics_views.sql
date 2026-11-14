-- Read-only, anonymous analytics layer for the analytics chatbot (ChatBot/), built on the current tables.
-- Replaces the old views of supabase_analytics.sql, which read the retired lesson tables. Safe to run more than once.
--
--   * schema "analytics" with VIEWS only. The app API (PostgREST) exposes only "public", so it cannot reach them.
--   * learners appear only as learner_ref, a short anonymous code. No name, email, student number,
--     written answers, links, feedback or notes are exposed.
--   * role "analytics_ro": NOLOGIN until you set a password, read-only, 5 second statement limit, SELECT on these views only.
--     Set the password yourself in the SQL Editor (never commit it):
--       alter role analytics_ro with login password 'PUT-A-LONG-RANDOM-PASSWORD-HERE';
-- Views run with the owner's rights, so row level security on the base tables does not hide rows from them.

create schema if not exists analytics;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analytics_ro') then create role analytics_ro nologin; end if;
end $$;
alter role analytics_ro set default_transaction_read_only = on;
alter role analytics_ro set statement_timeout = '5s';
alter role analytics_ro set search_path = analytics;

-- Columns change, so the views are dropped and created again (views only; no data lives here).
drop view if exists analytics.courses, analytics.modules, analytics.learners, analytics.enrollments, analytics.page_reads,
  analytics.quiz_attempts, analytics.quiz_answers, analytics.pretest_attempts, analytics.pretest_module_scores,
  analytics.assignment_submissions, analytics.activity_completions, analytics.study_time, analytics.certificates;

create view analytics.courses as
  select id as course_id, title, category, level, published, created_at from public.courses;

create view analytics.modules as
  select id as module_id, course_id, title, position, published,
         (select count(*) from public.learning_units u where u.module_id = m.id and u.published) as pages
  from public.learning_modules m;

create view analytics.learners as
  select left(md5(p.id::text), 8) as learner_ref, p.role, p.created_at as joined_at from public.profiles p;

create view analytics.enrollments as
  select left(md5(e.user_id::text), 8) as learner_ref, e.course_id, e.status, e.enrolled_at from public.course_enrollments e;

-- One row per page a learner has read.
create view analytics.page_reads as
  select left(md5(c.user_id::text), 8) as learner_ref, m.course_id, u.module_id, c.unit_id as page_id, c.completed_at
  from public.unit_completions c join public.learning_units u on u.id = c.unit_id join public.learning_modules m on m.id = u.module_id;

-- One row per module quiz attempt (retakes included).
create view analytics.quiz_attempts as
  select a.id as attempt_id, left(md5(a.user_id::text), 8) as learner_ref, m.course_id, q.module_id, a.quiz_id, q.title as quiz_title,
         a.correct_count, a.question_count, a.score as score_pct, a.passed, a.is_late, a.submitted_at
  from public.learning_quiz_attempts a join public.learning_quizzes q on q.id = a.quiz_id join public.learning_modules m on m.id = q.module_id;

-- One row per answered quiz question (attempts from Phase 5b on store their answers).
create view analytics.quiz_answers as
  select a.id as attempt_id, left(md5(a.user_id::text), 8) as learner_ref, m.course_id, q.module_id, x.id as question_id,
         x.competency,
         case x.competency when 0 then 'Foundational Knowledge' when 1 then 'Conceptual Understanding'
           when 2 then 'Practical Application' when 3 then 'Critical Thinking and Problem-Solving' end as competency_name,
         x.difficulty,
         case when (j->>'choice') ~ '^[0-9]{1,2}$' then (j->>'choice')::int = x.correct_index else false end as is_correct,
         (j->>'choice') is null as skipped,
         a.submitted_at
  from public.learning_quiz_attempts a
  join public.learning_quizzes q on q.id = a.quiz_id
  join public.learning_modules m on m.id = q.module_id
  cross join lateral jsonb_array_elements(a.answers) j
  join public.learning_quiz_questions x on x.id::text = j->>'questionId';

-- Pre-tests (stage 'pre') and post-tests (stage 'post').
create view analytics.pretest_attempts as
  select a.id as attempt_id, left(md5(a.user_id::text), 8) as learner_ref, a.course_id, a.stage,
         a.correct_count, a.question_count, a.score as score_pct, a.level_id, a.submitted_at
  from public.pretest_attempts a;

create view analytics.pretest_module_scores as
  select a.id as attempt_id, left(md5(a.user_id::text), 8) as learner_ref, a.course_id, a.stage,
         (x->>'module_id')::uuid as module_id, (x->>'correct')::int as correct, (x->>'total')::int as total,
         round(100.0 * (x->>'correct')::numeric / nullif((x->>'total')::numeric, 0), 1) as score_pct, a.submitted_at
  from public.pretest_attempts a cross join lateral jsonb_array_elements(a.modules) x;

-- Hand-ins: kind and timing only (no links, text or files).
create view analytics.assignment_submissions as
  select left(md5(s.user_id::text), 8) as learner_ref, a.course_id, a.module_id, s.assignment_id, a.title as assignment_title,
         a.due_at, s.kind, s.is_late, s.score, a.max_points, s.submitted_at, s.graded_at
  from public.assignment_submissions s join public.assignments a on a.id = s.assignment_id;

create view analytics.activity_completions as
  select left(md5(c.user_id::text), 8) as learner_ref, m.course_id, a.module_id, c.activity_id, a.kind, c.completed_at
  from public.activity_completions c join public.learning_activities a on a.id = c.activity_id join public.learning_modules m on m.id = a.module_id;

-- Active study time per learner, module and day (counted only while a page is visible, focused and in use).
create view analytics.study_time as
  select left(md5(t.user_id::text), 8) as learner_ref, m.course_id, t.module_id, t.day, round(t.seconds / 60.0, 1) as minutes
  from public.study_time t join public.learning_modules m on m.id = t.module_id;

create view analytics.certificates as
  select left(md5(c.user_id::text), 8) as learner_ref, c.course_id, c.issued_at, c.revoked_at is not null as revoked
  from public.lms_certificates c;

revoke all on schema analytics from public, anon, authenticated;
revoke all on all tables in schema analytics from public, anon, authenticated;
grant usage on schema analytics to analytics_ro;
grant select on all tables in schema analytics to analytics_ro;
alter default privileges in schema analytics grant select on tables to analytics_ro;
revoke all on all tables in schema public from analytics_ro;
revoke all on schema public from analytics_ro;
