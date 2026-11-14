-- Sends waiting invitations every 5 minutes, even when nobody has the Students page open.
-- Run ONCE in the Supabase SQL Editor after:
--   1. Database > Extensions: turn on "pg_cron" and "pg_net".
--   2. Edge Functions > Secrets: add CRON_SECRET = a long random text (for example from a password manager).
--   3. Replace the three values below, then run this whole file.
--      - your project URL:          Project Settings > API > Project URL   (https://xxxx.supabase.co)
--      - your anon public key:      Project Settings > API > anon public   (it is public, not a secret)
--      - the same CRON_SECRET text as step 2
-- The values go into Supabase Vault (encrypted), not into this file or the app.
-- Safe to run again (it replaces the stored values and the schedule).

do $$
begin
  perform vault.create_secret('REPLACE_WITH_PROJECT_URL', 'invite_project_url');
exception when unique_violation then
  perform vault.update_secret((select id from vault.secrets where name = 'invite_project_url'), 'REPLACE_WITH_PROJECT_URL');
end $$;
do $$
begin
  perform vault.create_secret('REPLACE_WITH_ANON_KEY', 'invite_anon_key');
exception when unique_violation then
  perform vault.update_secret((select id from vault.secrets where name = 'invite_anon_key'), 'REPLACE_WITH_ANON_KEY');
end $$;
do $$
begin
  perform vault.create_secret('REPLACE_WITH_CRON_SECRET', 'invite_cron_secret');
exception when unique_violation then
  perform vault.update_secret((select id from vault.secrets where name = 'invite_cron_secret'), 'REPLACE_WITH_CRON_SECRET');
end $$;

select cron.unschedule('invite-queue') where exists (select 1 from cron.job where jobname = 'invite-queue');
select cron.schedule('invite-queue', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'invite_project_url') || '/functions/v1/invite-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'invite_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'invite_cron_secret')),
    body := '{"mode":"queue"}'::jsonb);
$job$);

-- Check: the schedule exists and recent runs succeeded.
--   select jobname, schedule, active from cron.job where jobname = 'invite-queue';
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- To stop it:  select cron.unschedule('invite-queue');
