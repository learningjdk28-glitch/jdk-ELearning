-- =====================================================================
-- JDK Learn - Phase 4a: course pre-test and placement.
-- Run AFTER the Phase 2 migrations. Safe to re-run. Adds tables, columns and functions; deletes nothing.
--
--   * learning_levels.min_score: the pre-test score (%) from which a level applies. Placement level =
--     the level with the highest min_score <= score. Thresholds are data, not code.
--   * courses.pretest_published / pretest_pass_mark: per-course pre-test switch and module pass mark.
--   * pretest_questions: questions tagged with the module they test. Answer key never readable by students.
--   * pretest_attempts: graded only by submit_course_pretest(). The start module is the first module
--     scored below the pass mark; modules before it are "tested out". stage = pre | post (Phase 8).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Level thresholds
-- ---------------------------------------------------------------------
alter table public.learning_levels add column if not exists min_score smallint;
update public.learning_levels set min_score = case id when 'foundational' then 0 when 'standard' then 50 when 'advanced' then 80 else 0 end
  where min_score is null;
alter table public.learning_levels alter column min_score set default 0;
alter table public.learning_levels alter column min_score set not null;
alter table public.learning_levels drop constraint if exists learning_levels_min_score_check;
alter table public.learning_levels add constraint learning_levels_min_score_check check (min_score between 0 and 100);
create unique index if not exists learning_levels_min_score_key on public.learning_levels (min_score);

/** Placement level for a score (0-100). */
create or replace function public.level_for_score(p_score numeric)
returns text language sql stable set search_path = ''
as $$
  select id from public.learning_levels where min_score <= coalesce(p_score, 0) order by min_score desc limit 1;
$$;

-- ---------------------------------------------------------------------
-- 2. Course settings and questions
-- ---------------------------------------------------------------------
alter table public.courses add column if not exists pretest_published boolean not null default false;
alter table public.courses add column if not exists pretest_pass_mark smallint not null default 70;
alter table public.courses drop constraint if exists courses_pretest_pass_mark_check;
alter table public.courses add constraint courses_pretest_pass_mark_check check (pretest_pass_mark between 1 and 100);

create table if not exists public.pretest_questions (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 3000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_index smallint not null check (correct_index >= 0),
  competency smallint check (competency is null or competency between 0 and 3),
  difficulty smallint check (difficulty is null or difficulty between 1 and 3),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (correct_index < jsonb_array_length(options))
);
create index if not exists pretest_questions_course_idx on public.pretest_questions (course_id, module_id, position);
drop trigger if exists set_updated_at on public.pretest_questions;
create trigger set_updated_at before update on public.pretest_questions for each row execute function public.set_updated_at();

-- SECURITY DEFINER: the check must see the true answer; permission is RLS's job.
create or replace function public.guard_pretest_question()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.learning_modules m where m.id = new.module_id and m.course_id = new.course_id) then
    raise exception 'The module must belong to the same course.' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists guard_pretest_question on public.pretest_questions;
revoke all on function public.guard_pretest_question() from public, anon, authenticated;
create trigger guard_pretest_question before insert or update on public.pretest_questions
  for each row execute function public.guard_pretest_question();

-- A course's pre-test can be switched on only when it has questions.
-- SECURITY DEFINER: the check must see the true answer; permission is RLS's job.
create or replace function public.guard_pretest_publish()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.pretest_published and not coalesce(old.pretest_published, false)
     and not exists (select 1 from public.pretest_questions q where q.course_id = new.id) then
    raise exception 'Add at least one pre-test question before turning the pre-test on.' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists guard_pretest_publish on public.courses;
revoke all on function public.guard_pretest_publish() from public, anon, authenticated;
create trigger guard_pretest_publish before update of pretest_published on public.courses
  for each row execute function public.guard_pretest_publish();

alter table public.pretest_questions enable row level security;
-- Students never read this table (answer key). They get questions through get_course_pretest().
drop policy if exists "pretest questions owner" on public.pretest_questions;
create policy "pretest questions owner" on public.pretest_questions for all to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- ---------------------------------------------------------------------
-- 3. Attempts (written only by submit_course_pretest)
-- ---------------------------------------------------------------------
create table if not exists public.pretest_attempts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique,
  course_id text not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'pre' check (stage in ('pre', 'post')),
  correct_count int not null check (correct_count >= 0),
  question_count int not null check (question_count >= 1),
  score numeric(5,2) not null check (score between 0 and 100),
  level_id text references public.learning_levels(id) on delete set null,
  start_module_id uuid references public.learning_modules(id) on delete set null,
  tested_out uuid[] not null default '{}',
  modules jsonb not null default '[]'::jsonb check (jsonb_typeof(modules) = 'array'),
  submitted_at timestamptz not null default now(),
  check (correct_count <= question_count)
);
create index if not exists pretest_attempts_user_idx on public.pretest_attempts (user_id, course_id, submitted_at desc);
alter table public.pretest_attempts enable row level security;
drop policy if exists "pretest attempts read" on public.pretest_attempts;
create policy "pretest attempts read" on public.pretest_attempts for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_course(course_id));

-- ---------------------------------------------------------------------
-- 4. Taking the pre-test
-- ---------------------------------------------------------------------
create or replace function public.get_course_pretest(p_course text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c record;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select id, title, pretest_published, pretest_pass_mark into c from public.courses where id = p_course;
  if c.id is null or not (public.owns_course(p_course) or (c.pretest_published and public.can_access_course(p_course))) then
    raise exception 'Pre-test unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'course_id', c.id, 'course_title', c.title, 'pass_mark', c.pretest_pass_mark, 'published', c.pretest_published,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options, 'module_id', q.module_id)
                       order by m.position, q.position, q.created_at)
      from public.pretest_questions q join public.learning_modules m on m.id = q.module_id
      where q.course_id = p_course and m.published), '[]'::jsonb));
end; $$;
revoke all on function public.get_course_pretest(text) from public, anon;
grant execute on function public.get_course_pretest(text) to authenticated;

create or replace function public.submit_course_pretest(p_course text, p_answers jsonb, p_stage text default 'pre', p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pass int; total int := 0; correct int := 0; pct numeric(5,2);
  r record; mod_rows jsonb := '[]'::jsonb; start_id uuid; out_ids uuid[] := '{}'; still_testing boolean := true;
  m_total int; m_correct int; m_passed boolean; attempt public.pretest_attempts%rowtype;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_stage not in ('pre', 'post') then raise exception 'Unknown pre-test stage'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 500 then raise exception 'Invalid answers format'; end if;
  if p_client_id is not null then
    select * into attempt from public.pretest_attempts where client_id = p_client_id and user_id = uid;
    if attempt.id is not null then
      return jsonb_build_object('attempt_id', attempt.id, 'score', attempt.score, 'correct', attempt.correct_count, 'total', attempt.question_count,
        'level_id', attempt.level_id, 'start_module_id', attempt.start_module_id, 'tested_out', to_jsonb(attempt.tested_out), 'modules', attempt.modules, 'stage', attempt.stage, 'duplicate', true);
    end if;
  end if;
  select pretest_pass_mark into pass from public.courses where id = p_course and pretest_published;
  if pass is null or not public.can_access_course(p_course) then raise exception 'Pre-test not available for this account' using errcode = '42501'; end if;

  -- Grade per module, in course order. Modules without questions cannot be tested out.
  for r in select m.id, m.title from public.learning_modules m where m.course_id = p_course and m.published order by m.position loop
    select count(*), count(*) filter (where (
             select case when (j->>'choice') ~ '^[0-9]{1,2}$' then (j->>'choice')::int end
             from jsonb_array_elements(p_answers) j where j->>'questionId' = q.id::text limit 1) = q.correct_index)
      into m_total, m_correct
      from public.pretest_questions q where q.module_id = r.id;
    total := total + m_total; correct := correct + m_correct;
    m_passed := m_total > 0 and (m_correct * 100.0 / m_total) >= pass;
    mod_rows := mod_rows || jsonb_build_object('module_id', r.id, 'title', r.title, 'correct', m_correct, 'total', m_total, 'passed', m_passed);
    if still_testing then
      if m_passed then out_ids := out_ids || r.id; else start_id := r.id; still_testing := false; end if;
    end if;
  end loop;
  if total = 0 then raise exception 'This pre-test has no questions yet'; end if;
  pct := round(correct * 100.0 / total, 2);

  insert into public.pretest_attempts (client_id, course_id, user_id, stage, correct_count, question_count, score, level_id, start_module_id, tested_out, modules)
  values (p_client_id, p_course, uid, p_stage, correct, total, pct, public.level_for_score(pct), start_id, out_ids, mod_rows)
  returning * into attempt;
  return jsonb_build_object('attempt_id', attempt.id, 'score', attempt.score, 'correct', correct, 'total', total,
    'level_id', attempt.level_id, 'start_module_id', start_id, 'tested_out', to_jsonb(out_ids), 'modules', mod_rows, 'stage', p_stage, 'duplicate', false);
end; $$;
revoke all on function public.submit_course_pretest(text, jsonb, text, uuid) from public, anon;
grant execute on function public.submit_course_pretest(text, jsonb, text, uuid) to authenticated;
