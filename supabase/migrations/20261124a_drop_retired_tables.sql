-- Removes the tables and functions of the retired bundled lessons (deleted from the app in Phase 6b).
-- THIS DELETES DATA: old lesson progress, lesson notes, old diagnostic and lesson-quiz results, learning-mode preferences,
-- and the old lesson and question copies. Nothing in the app reads them any more.
--
-- Before running: see what will go (run this on its own first):
--   select 'lessons' t, count(*) from public.lessons union all select 'questions', count(*) from public.questions
--   union all select 'assessment_attempts', count(*) from public.assessment_attempts
--   union all select 'assessment_answers', count(*) from public.assessment_answers
--   union all select 'competency_results', count(*) from public.competency_results
--   union all select 'learning_preferences', count(*) from public.learning_preferences
--   union all select 'lesson_progress', count(*) from public.lesson_progress
--   union all select 'lesson_notes', count(*) from public.lesson_notes;
-- To keep a copy, open each table in the Table Editor and use Export > CSV.
--
-- No CASCADE: if anything new depends on these tables, the drop stops with an error instead of removing it too.
-- Safe to run more than once. After this, do not re-run supabase_setup.sql or the Phase 0 migration
-- (they reference these tables); every later migration is fine.

drop function if exists public.sync_attempt(jsonb);
drop function if exists public.reset_my_progress();
drop function if exists public.admin_learner_overview();

drop table if exists public.assessment_answers;
drop table if exists public.competency_results;
drop table if exists public.assessment_attempts;
drop table if exists public.lesson_progress;
drop table if exists public.lesson_notes;
drop table if exists public.learning_preferences;
drop table if exists public.questions;
drop table if exists public.lessons;
