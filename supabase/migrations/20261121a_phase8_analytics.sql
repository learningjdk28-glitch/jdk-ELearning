-- Phase 8: study time (batched, one row per student per module per day), pre-test vs post-test,
-- the student's comparison with the class (only for 3+ students), and course analytics for the instructor.
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Study time. The app counts only while the page is visible, focused and in use, and sends a total every few minutes.
-- ---------------------------------------------------------------------
create table if not exists public.study_time (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  day date not null,
  seconds int not null default 0 check (seconds between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id, day)
);
create index if not exists study_time_module_idx on public.study_time (module_id, day);
alter table public.study_time enable row level security;
drop policy if exists "study time read" on public.study_time;
create policy "study time read" on public.study_time for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_module(module_id));
-- No write policies: time is added only through add_study_time().

/** Most seconds one call may add to one module and day (covers time saved up while offline). */
create or replace function public.study_time_chunk_max() returns int language sql immutable as $$ select 14400 $$;

/** rows: [{ moduleId, day: 'YYYY-MM-DD', seconds }]. Ignores modules the student cannot open and days outside the last 14. */
create or replace function public.add_study_time(p_rows jsonb)
returns int language plpgsql security definer set search_path = ''
as $$
declare r jsonb; mid uuid; d date; s int; added int := 0; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Login required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'Invalid study time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      mid := (r->>'moduleId')::uuid;
      d := (r->>'day')::date;
      s := least(greatest(coalesce((r->>'seconds')::int, 0), 0), public.study_time_chunk_max());
    exception when others then continue;
    end;
    continue when s = 0 or d < current_date - 14 or d > current_date + 1;
    continue when not exists (select 1 from public.learning_modules m where m.id = mid and m.published and public.can_access_course(m.course_id));
    insert into public.study_time (user_id, module_id, day, seconds) values (me, mid, d, s)
    on conflict (user_id, module_id, day) do update set seconds = least(86400, public.study_time.seconds + excluded.seconds), updated_at = now();
    added := added + s;
  end loop;
  return added;
end; $$;
revoke all on function public.add_study_time(jsonb) from public, anon;
grant execute on function public.add_study_time(jsonb) to authenticated;

/** The smallest group shown as a class average, so one student's result can never be singled out. */
create or replace function public.class_min_size() returns int language sql immutable as $$ select 3 $$;

-- Per student of a course: pages read %, average best quiz score, minutes. Internal helper.
create or replace function public.course_student_stats(p_course text)
returns table(user_id uuid, progress numeric, quiz_avg numeric, minutes numeric, last_active timestamptz)
language sql stable security definer set search_path = ''
as $$
  with units as (
    select u.id from public.learning_units u join public.learning_modules m on m.id = u.module_id
    where m.course_id = p_course and m.published and u.published),
  quizzes as (
    select q.id from public.learning_quizzes q join public.learning_modules m on m.id = q.module_id
    where m.course_id = p_course and m.published and q.published),
  students as (select e.user_id from public.course_enrollments e where e.course_id = p_course and e.status = 'active')
  select s.user_id,
    case when (select count(*) from units) = 0 then 0
      else round(100.0 * (select count(*) from public.unit_completions x where x.user_id = s.user_id and x.unit_id in (select id from units)) / (select count(*) from units), 1) end,
    (select round(avg(best), 1) from (select max(a.score) best from public.learning_quiz_attempts a
       where a.user_id = s.user_id and a.quiz_id in (select id from quizzes) group by a.quiz_id) b),
    (select round(coalesce(sum(t.seconds), 0) / 60.0, 1) from public.study_time t join public.learning_modules m on m.id = t.module_id
       where t.user_id = s.user_id and m.course_id = p_course),
    greatest(
      (select max(x.completed_at) from public.unit_completions x where x.user_id = s.user_id and x.unit_id in (select id from units)),
      (select max(a.submitted_at) from public.learning_quiz_attempts a where a.user_id = s.user_id and a.quiz_id in (select id from quizzes)),
      (select max(t.updated_at) from public.study_time t join public.learning_modules m on m.id = t.module_id where t.user_id = s.user_id and m.course_id = p_course))
  from students s;
$$;
revoke all on function public.course_student_stats(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Student: me compared with the class
-- ---------------------------------------------------------------------
create or replace function public.course_compare(p_course text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare me uuid := (select auth.uid()); k int := public.class_min_size(); result jsonb;
begin
  if me is null or not exists (select 1 from public.course_enrollments e where e.course_id = p_course and e.user_id = me and e.status = 'active') then
    raise exception 'You are not enrolled in this course' using errcode = '42501';
  end if;
  with st as (select * from public.course_student_stats(p_course)),
  agg as (select count(*) n, count(quiz_avg) quiz_n, avg(progress) progress, avg(quiz_avg) quiz, avg(minutes) minutes from st),
  mine as (select * from st where user_id = me)
  select jsonb_build_object(
    'class_size', agg.n, 'min_size', k,
    'my_progress', (select progress from mine), 'my_quiz', (select quiz_avg from mine), 'my_minutes', (select minutes from mine),
    'class_progress', case when agg.n >= k then round(agg.progress, 1) end,
    'class_quiz', case when agg.quiz_n >= k then round(agg.quiz, 1) end,
    'class_minutes', case when agg.n >= k then round(agg.minutes, 1) end)
  into result from agg;
  return result;
end; $$;
revoke all on function public.course_compare(text) from public, anon;
grant execute on function public.course_compare(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Instructor: course analytics
-- ---------------------------------------------------------------------
create or replace function public.course_analytics(p_course text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.owns_course(p_course) then raise exception 'You can only view analytics for your own courses' using errcode = '42501'; end if;
  with stats as (select * from public.course_student_stats(p_course)),
  firsts as (  -- each student's first pre-test and latest post-test
    select distinct on (a.user_id, a.stage) a.user_id, a.stage, a.score, a.modules
    from public.pretest_attempts a join public.course_enrollments e on e.user_id = a.user_id and e.course_id = p_course and e.status = 'active'
    where a.course_id = p_course
    order by a.user_id, a.stage, case when a.stage = 'pre' then a.submitted_at end asc, a.submitted_at desc),
  paired as (
    select p.user_id, p.score pre, q.score post from firsts p join firsts q on q.user_id = p.user_id and q.stage = 'post' where p.stage = 'pre'),
  mods as (select m.id, m.title, m.position from public.learning_modules m where m.course_id = p_course and m.published),
  module_scores as (  -- per module correct share in pre and post attempts
    select (x->>'module_id')::uuid module_id, f.stage,
      round(avg(100.0 * (x->>'correct')::numeric / nullif((x->>'total')::numeric, 0)), 1) pct
    from firsts f cross join lateral jsonb_array_elements(f.modules) x
    where (x->>'total')::int > 0 group by 1, 2),
  answers as (  -- every quiz answer of this course's quizzes, scored against the current key
    select x.id question_id, x.prompt, m.title module_title,
      case when (j->>'choice') ~ '^[0-9]{1,2}$' then (j->>'choice')::int = x.correct_index else false end correct
    from public.learning_quiz_attempts a
    join public.learning_quizzes q on q.id = a.quiz_id
    join public.learning_modules m on m.id = q.module_id and m.course_id = p_course
    cross join lateral jsonb_array_elements(a.answers) j
    join public.learning_quiz_questions x on x.id::text = j->>'questionId')
  select jsonb_build_object(
    'enrolled', (select count(*) from stats),
    'min_size', public.class_min_size(),
    'active_7d', (select count(*) from stats where last_active > now() - interval '7 days'),
    'finished', (select count(*) from stats where progress >= 100),
    'avg_progress', (select round(avg(progress), 1) from stats),
    'avg_quiz', (select round(avg(quiz_avg), 1) from stats where quiz_avg is not null),
    'avg_minutes', (select round(avg(minutes), 1) from stats),
    'pre_avg', (select round(avg(score), 1) from firsts where stage = 'pre'),
    'pre_n', (select count(*) from firsts where stage = 'pre'),
    'post_avg', (select round(avg(score), 1) from firsts where stage = 'post'),
    'post_n', (select count(*) from firsts where stage = 'post'),
    'paired_n', (select count(*) from paired),
    'paired_gain', (select round(avg(post - pre), 1) from paired),
    'modules', coalesce((select jsonb_agg(jsonb_build_object(
        'module_id', m.id, 'title', m.title,
        'pre', (select pct from module_scores s where s.module_id = m.id and s.stage = 'pre'),
        'post', (select pct from module_scores s where s.module_id = m.id and s.stage = 'post'),
        'progress', (select round(avg(100.0 * (select count(*) from public.unit_completions c join public.learning_units u on u.id = c.unit_id
                        where c.user_id = st.user_id and u.module_id = m.id and u.published)
                      / nullif((select count(*) from public.learning_units u where u.module_id = m.id and u.published), 0)), 1) from stats st),
        'quiz_takers', (select count(distinct a.user_id) from public.learning_quiz_attempts a join public.learning_quizzes q on q.id = a.quiz_id
                        where q.module_id = m.id and a.user_id in (select user_id from stats)),
        'quiz_passed', (select count(distinct a.user_id) from public.learning_quiz_attempts a join public.learning_quizzes q on q.id = a.quiz_id
                        where q.module_id = m.id and a.passed and a.user_id in (select user_id from stats)),
        'minutes', (select round(coalesce(sum(t.seconds), 0) / 60.0 / greatest((select count(*) from stats), 1), 1)
                    from public.study_time t where t.module_id = m.id and t.user_id in (select user_id from stats))
      ) order by m.position) from mods m), '[]'::jsonb),
    'hardest', coalesce((select jsonb_agg(h order by (h->>'pct')::numeric) from (
        select jsonb_build_object('question_id', question_id, 'prompt', left(min(prompt), 160), 'module', min(module_title),
          'pct', round(100.0 * count(*) filter (where correct) / count(*), 1), 'answers', count(*)) h
        from answers group by question_id having count(*) >= public.class_min_size()
        order by count(*) filter (where correct)::numeric / count(*) asc limit 5) worst), '[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke all on function public.course_analytics(text) from public, anon;
grant execute on function public.course_analytics(text) to authenticated;
