-- Extras: a font file for certificate names in any alphabet, a course-wide brand colour,
-- and whether invitations are sent on a schedule (see supabase/setup/invite_schedule.sql). Safe to run more than once.

-- 1. Certificate font (TTF/OTF uploaded by the instructor, kept next to the design)
alter table public.certificate_templates add column if not exists font_path text;
alter table public.certificate_templates drop constraint if exists certificate_templates_font_path_check;
alter table public.certificate_templates add constraint certificate_templates_font_path_check
  check (font_path is null or split_part(font_path, '/', 1) = course_id);
-- Fonts with many alphabets (e.g. Noto Sans SC) can be ~20 MB; designs stay limited to 10 MB in the app.
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'font/ttf', 'font/otf']
where id = 'certificate-templates';

-- 2. Course colour: shown on that course's pages. Same values as a profile brand colour.
alter table public.courses add column if not exists brand_color text;
alter table public.courses drop constraint if exists courses_brand_color_check;
alter table public.courses add constraint courses_brand_color_check
  check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$' or brand_color in ('indigo', 'blue', 'teal', 'green', 'rose', 'orange'));

-- 3. Invitation stats also say whether the 5-minute sending schedule exists.
create or replace function public.invite_stats()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare scheduled boolean := false;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''invite-queue'' and active)' into scheduled;
  end if;
  return jsonb_build_object(
    'budget', public.invite_hourly_budget(),
    'sent_last_hour', (select count(*) from public.invites where sent_at > now() - interval '1 hour'),
    'sent_today', (select count(*) from public.invites where sent_at > now() - interval '24 hours'),
    'next_slot_at', (select min(sent_at) + interval '1 hour' from (select sent_at from public.invites where sent_at > now() - interval '1 hour') s),
    'queued', (select count(*) from public.invites where status in ('queued', 'failed') and (invited_by = (select auth.uid()) or public.is_super_admin())),
    'scheduled', scheduled);
end; $$;
revoke all on function public.invite_stats() from public, anon;
grant execute on function public.invite_stats() to authenticated;
