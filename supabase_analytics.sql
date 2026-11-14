-- JDK Learning System: read-only analytics layer for the chatbot (run AFTER supabase_setup.sql).
-- Safe to run more than once.
--
-- What it creates
--   * schema "analytics" with VIEWS only. PostgREST exposes only "public", so the app API cannot reach it.
--   * no email, no display name, no notes: learners appear as a short anonymous reference (learner_ref).
--   * role "analytics_ro": NOLOGIN until you set a password, read-only, 5 second statement limit,
--     SELECT on the analytics views and nothing else.
--
-- After running this file, set the password yourself in the SQL Editor (never commit it):
--   alter role analytics_ro with login password 'PUT-A-LONG-RANDOM-PASSWORD-HERE';

create schema if not exists analytics;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analytics_ro') then
    create role analytics_ro nologin;
  end if;
end $$;

alter role analytics_ro set default_transaction_read_only = on;
alter role analytics_ro set statement_timeout = '5s';
alter role analytics_ro set search_path = analytics;

-- Views run with the owner's rights, so row level security on the base tables does not hide rows
-- from them. They expose only the columns below.

create or replace view analytics.courses as
  select id as course_id, title, created_at from public.courses;

create or replace view analytics.lessons as
  select id as lesson_id, course_id, title, position,
         case focus_competency
           when 0 then 'Foundational Knowledge'
           when 1 then 'Conceptual Understanding'
           when 2 then 'Practical Application'
           when 3 then 'Critical Thinking and Problem-Solving'
         end as focus_competency
  from public.lessons;

create or replace view analytics.learners as
  select left(md5(p.id::text), 8) as learner_ref,
         p.role,
         p.created_at as joined_at,
         lp.learning_mode
  from public.profiles p
  left join public.learning_preferences lp on lp.user_id = p.id;

-- One row per quiz attempt. kind: diagnostic (pre-test), lesson (Digital Literacy quiz), module (file-based course quiz).
create or replace view analytics.attempts as
  select a.id as attempt_id,
         left(md5(a.user_id::text), 8) as learner_ref,
         a.course_id, a.lesson_id, a.kind, a.level,
         a.total_answered, a.total_correct,
         case when a.total_answered > 0 then round(100.0 * a.total_correct / a.total_answered, 1) end as score_pct,
         a.created_at
  from public.assessment_attempts a;

-- Per competency result of each attempt.
create or replace view analytics.competency_scores as
  select r.attempt_id,
         left(md5(r.user_id::text), 8) as learner_ref,
         a.course_id, a.lesson_id, a.kind,
         r.competency,
         case r.competency
           when 0 then 'Foundational Knowledge'
           when 1 then 'Conceptual Understanding'
           when 2 then 'Practical Application'
           when 3 then 'Critical Thinking and Problem-Solving'
         end as competency_name,
         r.answered, r.correct, r.score as score_pct, a.created_at
  from public.competency_results r
  join public.assessment_attempts a on a.id = r.attempt_id;

-- One row per answered question. Useful for "which questions are hardest".
create or replace view analytics.answers as
  select aa.attempt_id,
         left(md5(aa.user_id::text), 8) as learner_ref,
         aa.question_id, q.lesson_id, q.kind, q.competency, q.difficulty,
         aa.is_correct, (aa.selected_index is null) as skipped, aa.created_at
  from public.assessment_answers aa
  join public.questions q on q.id = aa.question_id;

create or replace view analytics.lesson_progress as
  select left(md5(user_id::text), 8) as learner_ref,
         lesson_id, completed, completed_at
  from public.lesson_progress;

revoke all on schema analytics from public;
revoke all on all tables in schema analytics from public;
grant usage on schema analytics to analytics_ro;
grant select on all tables in schema analytics to analytics_ro;
alter default privileges in schema analytics grant select on tables to analytics_ro;

-- The role can see nothing in the public schema.
revoke all on all tables in schema public from analytics_ro;
revoke all on schema public from analytics_ro;
