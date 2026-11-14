-- Phase 6: offline queue. A quiz attempt made offline is sent later with a client id, so a retry never counts twice.
-- Safe to run more than once.

alter table public.learning_quiz_attempts add column if not exists client_id uuid;
create unique index if not exists learning_quiz_attempts_client_idx on public.learning_quiz_attempts (client_id) where client_id is not null;

-- Same rules as submit_learning_quiz. When p_client_id was already received from this student,
-- the saved attempt is returned instead of creating a second one.
create or replace function public.submit_quiz(p_quiz uuid, p_answers jsonb, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  qz record; review jsonb; total int; correct int; pct numeric(5,2); late boolean; passed boolean; attempt_id uuid; me uuid := (select auth.uid());
begin
 if me is null then raise exception 'Login required' using errcode = '42501'; end if;
 if p_client_id is not null then
   select a.id into attempt_id from public.learning_quiz_attempts a where a.client_id = p_client_id and a.user_id = me and a.quiz_id = p_quiz;
   if attempt_id is not null then return public.quiz_attempt_review(attempt_id) || jsonb_build_object('replayed', true); end if;
 end if;
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

 insert into public.learning_quiz_attempts (quiz_id, user_id, correct_count, question_count, score, passed, is_late, answers, client_id)
 values (p_quiz, me, correct, total, pct, passed, late,
         (select coalesce(jsonb_agg(jsonb_build_object('questionId', r->>'questionId', 'choice', r->'choice')), '[]'::jsonb) from jsonb_array_elements(review) r),
         p_client_id)
 returning id into attempt_id;
 if passed or late then review := public.quiz_review(p_quiz, p_answers, true); end if;
 return jsonb_build_object('attempt_id', attempt_id, 'score', pct, 'correct', correct, 'total', total, 'passed', passed,
   'pass_mark', qz.pass_mark, 'is_late', late, 'review', review);
end; $$;
revoke all on function public.submit_quiz(uuid, jsonb, uuid) from public, anon;
grant execute on function public.submit_quiz(uuid, jsonb, uuid) to authenticated;

create or replace function public.submit_learning_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select public.submit_quiz(p_quiz, p_answers, null) $$;
revoke all on function public.submit_learning_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_learning_quiz(uuid, jsonb) to authenticated;
