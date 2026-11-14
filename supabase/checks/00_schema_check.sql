-- JDK Learn: READ-ONLY schema check. Changes nothing. Safe to run any time in the Supabase SQL Editor.
-- One row per item. present = true/false. rows = row count where it is a table (null if missing).
with items(grp, item, kind, target) as (values
  ('1 core',     'profiles',                       'table',    'public.profiles'),
  ('1 core',     'courses',                        'table',    'public.courses'),
  ('1 core',     'lessons',                        'table',    'public.lessons'),
  ('1 core',     'questions',                      'table',    'public.questions'),
  ('1 core',     'assessment_attempts',            'table',    'public.assessment_attempts'),
  ('1 core',     'lesson_progress',                'table',    'public.lesson_progress'),
  ('1 core',     'admin_allowlist',                'table',    'public.admin_allowlist'),
  ('1 core',     'is_admin()',                     'function', 'is_admin'),
  ('1 core',     'handle_new_user()',              'function', 'handle_new_user'),
  ('1 core',     'signup trigger',                 'trigger',  'on_auth_user_created'),
  ('2 upgrade',  'learning_modules',               'table',    'public.learning_modules'),
  ('2 upgrade',  'learning_materials',             'table',    'public.learning_materials'),
  ('2 upgrade',  'storage bucket learning-materials','bucket', 'learning-materials'),
  ('3 v2',       'courses.published column',      'column',   'courses.published'),
  ('3 v2',       'courses.category column',       'column',   'courses.category'),
  ('3 v2',       'learning_units',                 'table',    'public.learning_units'),
  ('3 v2',       'course_enrollments',             'table',    'public.course_enrollments'),
  ('3 v2',       'unit_completions',               'table',    'public.unit_completions'),
  ('3 v2',       'learning_quizzes',               'table',    'public.learning_quizzes'),
  ('3 v2',       'learning_quiz_questions',        'table',    'public.learning_quiz_questions'),
  ('3 v2',       'learning_quiz_attempts',         'table',    'public.learning_quiz_attempts'),
  ('3 v2',       'lms_certificates',               'table',    'public.lms_certificates'),
  ('3 v2',       'can_access_course()',            'function', 'can_access_course'),
  ('3 v2',       'enroll_in_course()',             'function', 'enroll_in_course'),
  ('3 v2',       'get_learning_quiz()',            'function', 'get_learning_quiz'),
  ('3 v2',       'submit_learning_quiz()',         'function', 'submit_learning_quiz'),
  ('3 v2',       'lms_admin_summary()',            'function', 'lms_admin_summary'),
  ('3 v2',       'lms_admin_students()',           'function', 'lms_admin_students'),
  ('3 v2',       'lms_admin_course_metrics()',     'function', 'lms_admin_course_metrics'),
  ('3 v2',       'lms_admin_enrollments()',        'function', 'lms_admin_enrollments'),
  ('3 v2',       'issue_lms_certificate()',        'function', 'issue_lms_certificate')
)
select grp, item,
  case kind
    when 'table'    then to_regclass(target) is not null
    when 'column'   then exists (select 1 from information_schema.columns
                                 where table_schema = 'public' and table_name = split_part(target, '.', 1)
                                   and column_name = split_part(target, '.', 2))
    when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.proname = target)
    when 'trigger'  then exists (select 1 from pg_trigger where tgname = target and not tgisinternal)
    when 'bucket'   then to_regclass('storage.buckets') is not null and coalesce((xpath('/row/c/text()',
                           query_to_xml(format('select count(*) as c from storage.buckets where id = %L', target), false, true, '')))[1]::text::int, 0) > 0
  end as present,
  case when kind = 'table' and to_regclass(target) is not null
    then (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', target), false, true, '')))[1]::text::int
  end as rows
from items
order by grp, item;
