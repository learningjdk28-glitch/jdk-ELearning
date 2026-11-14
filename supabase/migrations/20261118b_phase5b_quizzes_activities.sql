-- Phase 5b: quiz deadlines and answer review, quiz results per student, activity validation and completion tracking.
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Quiz deadlines. An attempt after the deadline is marked late (server clock), or refused when late work is off.
-- ---------------------------------------------------------------------
alter table public.learning_quizzes add column if not exists due_at timestamptz;
alter table public.learning_quizzes add column if not exists allow_late boolean not null default true;
alter table public.learning_quiz_attempts add column if not exists is_late boolean not null default false;
alter table public.learning_quiz_attempts add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.learning_quiz_attempts drop constraint if exists learning_quiz_attempts_answers_check;
alter table public.learning_quiz_attempts add constraint learning_quiz_attempts_answers_check check (jsonb_typeof(answers) = 'array');

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
 select jsonb_build_object('id', q.id, 'title', q.title, 'pass_mark', q.pass_mark, 'module_id', q.module_id,
   'due_at', q.due_at, 'allow_late', q.allow_late,
   'questions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'prompt', x.prompt, 'options', x.options) order by x.position, x.id)
    from public.learning_quiz_questions x where x.quiz_id = q.id), '[]'::jsonb)) into result
 from public.learning_quizzes q where q.id = p_quiz;
 return result;
end; $$;

-- Per-question review. The correct option is shown only once the student has passed or the quiz has closed,
-- so a failed attempt cannot simply be copied into the next one. Explanations are always shown.
create or replace function public.quiz_review(p_quiz uuid, p_answers jsonb, p_reveal boolean)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'questionId', x.id,
      'choice', a.choice,
      'correct', coalesce(a.choice = x.correct_index, false),
      'explanation', nullif(x.explanation, ''),
      'correctIndex', case when p_reveal then x.correct_index end)) order by x.position, x.id), '[]'::jsonb)
  from public.learning_quiz_questions x
  left join lateral (
    select case when (j->>'choice') ~ '^[0-9]{1,2}$' then (j->>'choice')::int end as choice
    from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) j
    where j->>'questionId' = x.id::text limit 1) a on true
  where x.quiz_id = p_quiz;
$$;
revoke all on function public.quiz_review(uuid, jsonb, boolean) from public, anon, authenticated;

create or replace function public.submit_learning_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  qz record; review jsonb; total int; correct int; pct numeric(5,2); late boolean; passed boolean; attempt_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Login required' using errcode = '42501'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 200 then
  raise exception 'Invalid answers format';
 end if;
 select q.pass_mark, q.due_at, q.allow_late into qz
 from public.learning_quizzes q join public.learning_modules m on m.id = q.module_id
 where q.id = p_quiz and q.published and m.published and public.can_access_course(m.course_id);
 if not found then raise exception 'Quiz not available for this account' using errcode = '42501'; end if;
 late := qz.due_at is not null and now() > qz.due_at;
 if late and not qz.allow_late then raise exception 'This quiz is closed: the deadline has passed.' using errcode = '42501'; end if;

 review := public.quiz_review(p_quiz, p_answers, false);
 total := jsonb_array_length(review);
 if total = 0 then raise exception 'This quiz has no questions yet'; end if;
 select count(*) into correct from jsonb_array_elements(review) r where (r->>'correct')::boolean;
 pct := round(correct::numeric * 100 / total, 2);
 passed := pct >= qz.pass_mark;

 insert into public.learning_quiz_attempts (quiz_id, user_id, correct_count, question_count, score, passed, is_late, answers)
 values (p_quiz, (select auth.uid()), correct, total, pct, passed, late,
         (select coalesce(jsonb_agg(jsonb_build_object('questionId', r->>'questionId', 'choice', r->'choice')), '[]'::jsonb) from jsonb_array_elements(review) r))
 returning id into attempt_id;
 if passed or late then review := public.quiz_review(p_quiz, p_answers, true); end if;
 return jsonb_build_object('attempt_id', attempt_id, 'score', pct, 'correct', correct, 'total', total, 'passed', passed,
   'pass_mark', qz.pass_mark, 'is_late', late, 'review', review);
end; $$;
revoke all on function public.submit_learning_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_learning_quiz(uuid, jsonb) to authenticated;

-- The student's own past attempt, reviewed against the current questions.
create or replace function public.quiz_attempt_review(p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare att record; reveal boolean;
begin
 select a.quiz_id, a.answers, a.score, a.correct_count, a.question_count, a.passed, a.is_late, a.submitted_at, q.pass_mark, q.due_at
   into att
 from public.learning_quiz_attempts a join public.learning_quizzes q on q.id = a.quiz_id
 where a.id = p_attempt and a.user_id = (select auth.uid());
 if not found then raise exception 'Attempt not found' using errcode = '42501'; end if;
 reveal := att.passed or (att.due_at is not null and now() > att.due_at)
   or exists (select 1 from public.learning_quiz_attempts b where b.quiz_id = att.quiz_id and b.user_id = (select auth.uid()) and b.passed);
 return jsonb_build_object('attempt_id', p_attempt, 'score', att.score, 'correct', att.correct_count, 'total', att.question_count,
   'passed', att.passed, 'pass_mark', att.pass_mark, 'is_late', att.is_late, 'submitted_at', att.submitted_at,
   'review', public.quiz_review(att.quiz_id, att.answers, reveal));
end; $$;
revoke all on function public.quiz_attempt_review(uuid) from public, anon;
grant execute on function public.quiz_attempt_review(uuid) to authenticated;

-- Instructor: every enrolled student with attempts, best score, passed, late.
create or replace function public.quiz_results(p_quiz uuid)
returns table(user_id uuid, student_name text, student_email text, student_number text, attempts bigint,
              best_score numeric, passed boolean, any_late boolean, last_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare c text;
begin
  select m.course_id into c from public.learning_quizzes q join public.learning_modules m on m.id = q.module_id where q.id = p_quiz;
  if c is null or not public.owns_course(c) then raise exception 'You can only view results for your own courses' using errcode = '42501'; end if;
  return query
  select p.id, p.display_name, u.email::text, p.student_number,
         count(a.id), max(a.score), coalesce(bool_or(a.passed), false), coalesce(bool_or(a.is_late), false), max(a.submitted_at)
  from public.course_enrollments e
  join public.profiles p on p.id = e.user_id
  join auth.users u on u.id = e.user_id
  left join public.learning_quiz_attempts a on a.quiz_id = p_quiz and a.user_id = e.user_id
  where e.course_id = c
  group by p.id, p.display_name, u.email, p.student_number, e.status
  having e.status = 'active' or count(a.id) > 0
  order by max(a.submitted_at) desc nulls last, p.display_name;
end; $$;
revoke all on function public.quiz_results(uuid) from public, anon;
grant execute on function public.quiz_results(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Activity settings are checked by the database (same rules as src/lib/activityRules.js).
-- ---------------------------------------------------------------------
create or replace function public.activity_spec_error(p_kind text, p_spec jsonb)
returns text language plpgsql immutable set search_path = ''
as $$
declare g jsonb; x jsonb;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then return 'The activity settings are missing.'; end if;
  if p_kind = 'password' then return null; end if;
  if p_kind = 'sort' then
    g := p_spec->'groups'; x := p_spec->'items';
    if jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(g) not between 2 and 6 then return 'Give 2 to 6 groups.'; end if;
    if exists (select 1 from jsonb_array_elements(g) e where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 80) then
      return 'Name every group (80 characters or fewer).'; end if;
    if (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(g) e) <> jsonb_array_length(g) then return 'Two groups have the same name.'; end if;
    if jsonb_typeof(x) is distinct from 'array' or jsonb_array_length(x) not between 2 and 30 then return 'Give 2 to 30 items to sort.'; end if;
    if exists (select 1 from jsonb_array_elements(x) e where jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') = ''
               or char_length(btrim(coalesce(e->>'label', ''))) not between 1 and 200) then return 'Write every item (200 characters or fewer).'; end if;
    if exists (select 1 from jsonb_array_elements(x) e where not (g @> jsonb_build_array(e->'group'))) then return 'Put every item in one of the groups.'; end if;
    if (select count(distinct e->>'id') from jsonb_array_elements(x) e) <> jsonb_array_length(x) then return 'Every item needs its own id.'; end if;
    return null;
  end if;
  if p_kind = 'order' then
    x := p_spec->'steps'; g := p_spec->'answer';
    if jsonb_typeof(x) is distinct from 'array' or jsonb_array_length(x) not between 2 and 12 then return 'Give 2 to 12 steps.'; end if;
    if exists (select 1 from jsonb_array_elements(x) e where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 300) then
      return 'Write every step (300 characters or fewer).'; end if;
    if (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(x) e) <> jsonb_array_length(x) then return 'Two steps are the same.'; end if;
    if jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(g) <> jsonb_array_length(x) or not (g @> x and x @> g) then
      return 'The correct order must use exactly the same steps.'; end if;
    return null;
  end if;
  if p_kind = 'spot' then
    x := p_spec->'segments';
    if jsonb_typeof(x) is distinct from 'array' or jsonb_array_length(x) not between 2 and 20 then return 'Give 2 to 20 parts.'; end if;
    if exists (select 1 from jsonb_array_elements(x) e where jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') = ''
               or char_length(btrim(coalesce(e->>'text', ''))) not between 1 and 500
               or jsonb_typeof(e->'flag') is distinct from 'boolean' or char_length(coalesce(e->>'why', '')) > 500) then
      return 'Write every part (500 characters or fewer) and say whether it is a red flag.'; end if;
    if not exists (select 1 from jsonb_array_elements(x) e where e->'flag' = 'true'::jsonb) then return 'Mark at least one part as a red flag.'; end if;
    if (select count(distinct e->>'id') from jsonb_array_elements(x) e) <> jsonb_array_length(x) then return 'Every part needs its own id.'; end if;
    return null;
  end if;
  return 'Unknown activity type.';
end; $$;

create or replace function public.guard_activity()
returns trigger language plpgsql set search_path = ''
as $$
declare problem text := public.activity_spec_error(new.kind, new.spec);
begin
  if problem is not null then raise exception '%', problem using errcode = '23514'; end if;
  return new;
end; $$;
drop trigger if exists guard_activity on public.learning_activities;
create trigger guard_activity before insert or update of kind, spec on public.learning_activities
  for each row execute function public.guard_activity();

-- ---------------------------------------------------------------------
-- 3. Activity completion: first time a student gets an activity fully right.
-- ---------------------------------------------------------------------
create table if not exists public.activity_completions (
  activity_id uuid not null references public.learning_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index if not exists activity_completions_user_idx on public.activity_completions (user_id);
alter table public.activity_completions enable row level security;
drop policy if exists "activity completions read" on public.activity_completions;
create policy "activity completions read" on public.activity_completions for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.learning_activities a where a.id = activity_id and public.owns_module(a.module_id)));
-- No insert/update policy: completions are written only by complete_activity().

create or replace function public.complete_activity(p_activity uuid)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare done_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Login required' using errcode = '42501'; end if;
  if not exists (select 1 from public.learning_activities a join public.learning_modules m on m.id = a.module_id
                 where a.id = p_activity and a.published and m.published and public.can_access_course(m.course_id)) then
    raise exception 'Activity unavailable' using errcode = '42501';
  end if;
  insert into public.activity_completions (activity_id, user_id) values (p_activity, (select auth.uid())) on conflict do nothing;
  select completed_at into done_at from public.activity_completions where activity_id = p_activity and user_id = (select auth.uid());
  return done_at;
end; $$;
revoke all on function public.complete_activity(uuid) from public, anon;
grant execute on function public.complete_activity(uuid) to authenticated;

-- Instructor: how many actively enrolled students finished each activity of a module.
create or replace function public.activity_progress(p_module uuid)
returns table(activity_id uuid, completed bigint, enrolled bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare c text;
begin
  select course_id into c from public.learning_modules where id = p_module;
  if c is null or not public.owns_course(c) then raise exception 'You can only view progress for your own courses' using errcode = '42501'; end if;
  return query
  select a.id,
         (select count(*) from public.activity_completions x join public.course_enrollments e
            on e.user_id = x.user_id and e.course_id = c and e.status = 'active' where x.activity_id = a.id),
         (select count(*) from public.course_enrollments e where e.course_id = c and e.status = 'active')
  from public.learning_activities a where a.module_id = p_module;
end; $$;
revoke all on function public.activity_progress(uuid) from public, anon;
grant execute on function public.activity_progress(uuid) to authenticated;
