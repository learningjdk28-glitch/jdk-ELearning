-- JDK Learning System: READ-ONLY setup check. Changes nothing. Run any time in the Supabase SQL Editor.
-- One row per item: ok = true when it is set up. "optional" items are only needed for automatic invitation sending.
with items(grp, item, ok) as (values
  -- core tables
  ('tables', 'courses',                to_regclass('public.courses') is not null),
  ('tables', 'profiles',               to_regclass('public.profiles') is not null),
  ('tables', 'learning_modules',       to_regclass('public.learning_modules') is not null),
  ('tables', 'learning_units (pages)', to_regclass('public.learning_units') is not null),
  ('tables', 'learning_quizzes',       to_regclass('public.learning_quizzes') is not null),
  ('tables', 'pretest_attempts',       to_regclass('public.pretest_attempts') is not null),
  ('tables', 'assignments',            to_regclass('public.assignments') is not null),
  ('tables', 'activity_completions',   to_regclass('public.activity_completions') is not null),
  ('tables', 'invites',                to_regclass('public.invites') is not null),
  ('tables', 'study_time',             to_regclass('public.study_time') is not null),
  ('tables', 'certificate_templates',  to_regclass('public.certificate_templates') is not null),
  -- latest migrations
  ('columns', 'profiles.theme (appearance)',  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'theme')),
  ('columns', 'courses.brand_color',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'courses' and column_name = 'brand_color')),
  ('columns', 'certificate_templates.font_path', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'certificate_templates' and column_name = 'font_path')),
  ('retired', 'old lesson tables removed',    to_regclass('public.lesson_progress') is null and to_regclass('public.lessons') is null),
  ('analytics', 'chatbot views',              to_regclass('analytics.quiz_attempts') is not null),
  -- functions the app calls
  ('functions', 'submit_quiz',          exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'submit_quiz')),
  ('functions', 'queue_invites',        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'queue_invites')),
  ('functions', 'course_analytics',     exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'course_analytics')),
  ('functions', 'verify_certificate',   exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'verify_certificate')),
  -- storage
  ('storage', 'learning-materials bucket',    exists (select 1 from storage.buckets where id = 'learning-materials')),
  ('storage', 'submissions bucket',           exists (select 1 from storage.buckets where id = 'submissions')),
  ('storage', 'certificate-templates bucket', exists (select 1 from storage.buckets where id = 'certificate-templates')),
  -- accounts
  ('accounts', 'a super administrator exists', exists (select 1 from public.profiles where is_super_admin)),
  -- optional: automatic invitation sending (supabase/setup/invite_schedule.sql)
  ('optional', 'pg_cron extension',  exists (select 1 from pg_extension where extname = 'pg_cron')),
  ('optional', 'pg_net extension',   exists (select 1 from pg_extension where extname = 'pg_net'))
)
select grp, item, ok from items order by ok, grp, item;
