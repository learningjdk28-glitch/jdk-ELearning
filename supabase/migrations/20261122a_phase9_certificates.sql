-- Phase 9: certificates. The instructor uploads a design (PDF or PNG/JPEG, e.g. exported from Canva) and places fields on it;
-- each certificate gets a unique code anyone can check at /verify/<code>; issue to one or many students; students download a PDF.
-- Safe to run more than once.

-- ---------------------------------------------------------------------
-- 1. Certificate design per course
-- ---------------------------------------------------------------------
create table if not exists public.certificate_templates (
  course_id text primary key references public.courses(id) on delete cascade,
  file_path text not null check (split_part(file_path, '/', 1) = course_id),
  file_kind text not null check (file_kind in ('pdf', 'png', 'jpeg')),
  page_width numeric not null check (page_width between 100 and 5000),
  page_height numeric not null check (page_height between 100 and 5000),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 12),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_updated_at on public.certificate_templates;
create trigger set_updated_at before update on public.certificate_templates for each row execute function public.set_updated_at();
alter table public.certificate_templates enable row level security;
drop policy if exists "certificate templates read" on public.certificate_templates;
create policy "certificate templates read" on public.certificate_templates for select to authenticated
  using (public.owns_course(course_id) or public.can_access_course(course_id));
drop policy if exists "certificate templates write" on public.certificate_templates;
create policy "certificate templates write" on public.certificate_templates for all to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- ---------------------------------------------------------------------
-- 2. Certificates: a verifiable code, snapshots of what is printed, revocation instead of deletion
-- ---------------------------------------------------------------------
alter table public.lms_certificates add column if not exists code text;
alter table public.lms_certificates add column if not exists student_number text;
alter table public.lms_certificates add column if not exists instructor_name text;
alter table public.lms_certificates add column if not exists issued_by uuid references auth.users(id) on delete set null;
alter table public.lms_certificates add column if not exists revoked_at timestamptz;

create or replace function public.new_certificate_code() returns text language sql volatile set search_path = '' as $$
  select 'JDK-' || upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
  from (select md5(gen_random_uuid()::text || clock_timestamp()::text) h) x
$$;
update public.lms_certificates set code = public.new_certificate_code() where code is null;
alter table public.lms_certificates alter column code set default public.new_certificate_code();
alter table public.lms_certificates alter column code set not null;
create unique index if not exists lms_certificates_code_idx on public.lms_certificates (code);
alter table public.lms_certificates drop constraint if exists lms_certificates_code_check;
alter table public.lms_certificates add constraint lms_certificates_code_check check (code ~ '^JDK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$');

-- Revoke keeps the record so a verification shows "revoked" instead of "not found".
drop policy if exists "certificates admin revoke" on public.lms_certificates;

/** Inserts one certificate with today's snapshots, or returns the existing one. Internal. */
create or replace function public.award_certificate(p_course text, p_user uuid, p_by uuid)
returns public.lms_certificates language plpgsql security definer set search_path = ''
as $$
declare cert public.lms_certificates;
begin
  insert into public.lms_certificates (course_id, user_id, course_title, student_name, student_number, instructor_name, issued_by)
  select c.id, p_user, c.title, coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), p.student_number,
         (select o.display_name from public.profiles o where o.id = c.owner_id), p_by
  from public.courses c join auth.users u on u.id = p_user join public.profiles p on p.id = p_user where c.id = p_course
  on conflict (course_id, user_id) do update set revoked_at = null, issued_at = case when public.lms_certificates.revoked_at is null then public.lms_certificates.issued_at else now() end
  returning * into cert;
  return cert;
end; $$;
revoke all on function public.award_certificate(text, uuid, uuid) from public, anon, authenticated;

/** Pages read, quizzes passed and whether the student has finished, for one course. Internal. */
create or replace function public.certificate_progress(p_course text, p_user uuid)
returns table(pages_done bigint, pages_total bigint, quizzes_passed bigint, quizzes_total bigint, eligible boolean)
language sql stable security definer set search_path = ''
as $$
  with u as (select x.id from public.learning_units x join public.learning_modules m on m.id = x.module_id where m.course_id = p_course and m.published and x.published),
  q as (select x.id from public.learning_quizzes x join public.learning_modules m on m.id = x.module_id where m.course_id = p_course and m.published and x.published),
  r as (select
    (select count(*) from public.unit_completions c where c.user_id = p_user and c.unit_id in (select id from u)) pd,
    (select count(*) from u) pt,
    (select count(*) from q where exists (select 1 from public.learning_quiz_attempts a where a.quiz_id = q.id and a.user_id = p_user and a.passed)) qp,
    (select count(*) from q) qt)
  select pd, pt, qp, qt, pt > 0 and pd >= pt and qp >= qt from r;
$$;
revoke all on function public.certificate_progress(text, uuid) from public, anon, authenticated;

-- The student claims their own certificate once they have read every page and passed every quiz.
create or replace function public.issue_lms_certificate(p_course text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare me uuid := (select auth.uid()); pr record; cert public.lms_certificates;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.courses c join public.course_enrollments e on e.course_id = c.id
                 where c.id = p_course and c.published and e.user_id = me and e.status = 'active') then
    raise exception 'Enroll in the published course first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.certificate_templates t where t.course_id = p_course) then
    raise exception 'Your instructor has not set up a certificate for this course yet';
  end if;
  select * into pr from public.certificate_progress(p_course, me);
  if pr.pages_total = 0 then raise exception 'This course has no published lessons yet'; end if;
  if pr.pages_done < pr.pages_total then raise exception 'Read every page first (% of % done)', pr.pages_done, pr.pages_total; end if;
  if pr.quizzes_passed < pr.quizzes_total then raise exception 'Pass every quiz first (% of % passed)', pr.quizzes_passed, pr.quizzes_total; end if;
  if exists (select 1 from public.lms_certificates where course_id = p_course and user_id = me and revoked_at is not null) then
    raise exception 'Your certificate for this course was revoked. Ask your instructor.' using errcode = '42501';
  end if;
  cert := public.award_certificate(p_course, me, me);
  return jsonb_build_object('id', cert.id, 'code', cert.code, 'course', cert.course_title, 'student', cert.student_name, 'issued_at', cert.issued_at);
end; $$;
revoke all on function public.issue_lms_certificate(text) from public, anon;
grant execute on function public.issue_lms_certificate(text) to authenticated;

/** Instructor: issue to one or many enrolled students (also re-issues a revoked one). Returns how many. */
create or replace function public.issue_certificates(p_course text, p_users uuid[])
returns int language plpgsql security definer set search_path = ''
as $$
declare uid uuid; n int := 0;
begin
  if not public.owns_course(p_course) then raise exception 'You can only issue certificates for your own courses' using errcode = '42501'; end if;
  if not exists (select 1 from public.certificate_templates t where t.course_id = p_course) then raise exception 'Upload a certificate design first'; end if;
  if coalesce(array_length(p_users, 1), 0) > 500 then raise exception 'Issue at most 500 at a time'; end if;
  foreach uid in array coalesce(p_users, '{}') loop
    continue when not exists (select 1 from public.course_enrollments e where e.course_id = p_course and e.user_id = uid and e.status = 'active');
    perform public.award_certificate(p_course, uid, (select auth.uid()));
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.issue_certificates(text, uuid[]) from public, anon;
grant execute on function public.issue_certificates(text, uuid[]) to authenticated;

create or replace function public.revoke_certificate(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.lms_certificates set revoked_at = now() where id = p_id and revoked_at is null and public.owns_course(course_id);
  if not found then raise exception 'This certificate cannot be revoked' using errcode = '42501'; end if;
end; $$;
revoke all on function public.revoke_certificate(uuid) from public, anon;
grant execute on function public.revoke_certificate(uuid) to authenticated;

/** Instructor: every enrolled student with progress, eligibility and their certificate. */
create or replace function public.certificate_roster(p_course text)
returns table(user_id uuid, student_name text, student_email text, student_number text, pages_done bigint, pages_total bigint,
              quizzes_passed bigint, quizzes_total bigint, eligible boolean, certificate_id uuid, code text, issued_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.owns_course(p_course) then raise exception 'You can only view certificates for your own courses' using errcode = '42501'; end if;
  return query
  select e.user_id, p.display_name, u.email::text, p.student_number, pr.pages_done, pr.pages_total, pr.quizzes_passed, pr.quizzes_total, pr.eligible,
         c.id, c.code, c.issued_at, c.revoked_at
  from public.course_enrollments e
  join public.profiles p on p.id = e.user_id join auth.users u on u.id = e.user_id
  cross join lateral public.certificate_progress(p_course, e.user_id) pr
  left join public.lms_certificates c on c.course_id = p_course and c.user_id = e.user_id
  where e.course_id = p_course and e.status = 'active'
  order by pr.eligible desc, p.display_name nulls last;
end; $$;
revoke all on function public.certificate_roster(text) from public, anon;
grant execute on function public.certificate_roster(text) to authenticated;

/** Public check of a certificate code. Shows only what is printed on the certificate. */
create or replace function public.verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('found', true, 'valid', c.revoked_at is null, 'code', c.code, 'student_name', c.student_name,
        'course_title', c.course_title, 'issued_at', c.issued_at, 'revoked_at', c.revoked_at, 'instructor_name', c.instructor_name)
     from public.lms_certificates c where c.code = upper(btrim(coalesce(p_code, '')))),
    jsonb_build_object('found', false, 'valid', false));
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Storage for designs: private; the course owner writes; students with a valid certificate (or enrolled) read
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-templates', 'certificate-templates', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "certificate designs read" on storage.objects;
create policy "certificate designs read" on storage.objects for select to authenticated
  using (bucket_id = 'certificate-templates' and (public.owns_course(split_part(name, '/', 1))
         or exists (select 1 from public.lms_certificates c where c.course_id = split_part(name, '/', 1) and c.user_id = (select auth.uid()) and c.revoked_at is null)));
drop policy if exists "certificate designs upload" on storage.objects;
create policy "certificate designs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'certificate-templates' and public.owns_course(split_part(name, '/', 1)));
drop policy if exists "certificate designs delete" on storage.objects;
create policy "certificate designs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'certificate-templates' and public.owns_course(split_part(name, '/', 1)));
