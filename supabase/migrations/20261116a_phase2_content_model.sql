-- =====================================================================
-- JDK Learn - Phase 2a: content model.
-- Run AFTER 20261115_phase0_ownership_profiles.sql. Safe to re-run. Adds tables and rules; deletes nothing.
--
--   * module_page_count(): pages per module. MUST equal MODULE_PAGE_COUNT in src/lib/courseRules.js
--     (tests/phase2.test.mjs fails if they differ). A module is published only with exactly that many pages.
--   * learning_levels: lookup of content levels. Adding a level later = inserting a row, no migration.
--   * learning_unit_variants: OPTIONAL alternative versions of a page, one row per extra version.
--     A page without variants has no rows here and renders exactly like a flat page.
--   * learning_units.kind gains 'steps' ("Title | explanation" per line).
--   * learning_activities: practice activities (sort, order, spot, password).
--   * glossary_terms: per-course dictionary written by the instructor.
--   * learning_quiz_questions gains competency, difficulty and explanation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pages per module
-- ---------------------------------------------------------------------
create or replace function public.module_page_count()
returns int language sql immutable set search_path = ''
as $$ select 5 $$;

alter table public.learning_units drop constraint if exists learning_units_kind_check;
alter table public.learning_units add constraint learning_units_kind_check
  check (kind in ('article', 'steps', 'video', 'link'));
alter table public.learning_units drop constraint if exists learning_units_safe_url;
alter table public.learning_units add constraint learning_units_safe_url
  check (kind in ('article', 'steps') or content ~* '^https://[^[:space:]]+$');

-- Adding/moving a page: never more than module_page_count() pages in a module.
-- Changing pages of a PUBLISHED module (delete, move away, hide): unpublish the module first.
create or replace function public.guard_unit_change()
returns trigger language plpgsql set search_path = ''
as $$
declare n int;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.module_id is distinct from old.module_id) then
    select count(*) into n from public.learning_units where module_id = new.module_id;
    if n >= public.module_page_count() then
      raise exception 'A module has exactly % pages. Delete a page before adding another.', public.module_page_count()
        using errcode = '23514';
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (
       select 1 from public.learning_modules m where m.id = old.module_id and m.published) then
    if tg_op = 'DELETE' or new.module_id is distinct from old.module_id or (old.published and not new.published) then
      raise exception 'This module is published. Unpublish it before removing or hiding a page.' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists guard_unit_change on public.learning_units;
create trigger guard_unit_change before insert or update or delete on public.learning_units
  for each row execute function public.guard_unit_change();

-- Publishing a module requires exactly module_page_count() pages.
create or replace function public.guard_module_publish()
returns trigger language plpgsql set search_path = ''
as $$
declare n int; need int := public.module_page_count();
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    select count(*) into n from public.learning_units where module_id = new.id;
    if n <> need then
      raise exception 'This module has % of % pages. Add % more before publishing.', n, need, need - n using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists guard_module_publish on public.learning_modules;
create trigger guard_module_publish before insert or update of published on public.learning_modules
  for each row execute function public.guard_module_publish();

-- Publishing a module shows all of its pages: pages follow the module, not the other way round.
create or replace function public.publish_module_pages()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.published and not old.published then
    update public.learning_units set published = true where module_id = new.id and not published;
  end if;
  return new;
end; $$;
revoke all on function public.publish_module_pages() from public, anon, authenticated;
drop trigger if exists publish_module_pages on public.learning_modules;
create trigger publish_module_pages after update of published on public.learning_modules
  for each row execute function public.publish_module_pages();

-- ---------------------------------------------------------------------
-- 2. Levels and optional page variants
-- ---------------------------------------------------------------------
create table if not exists public.learning_levels (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  student_label text check (student_label is null or char_length(btrim(student_label)) between 1 and 40),
  position int not null unique,
  is_default boolean not null default false
);
create unique index if not exists learning_levels_one_default on public.learning_levels (is_default) where is_default;
insert into public.learning_levels (id, label, student_label, position, is_default) values
  ('foundational', 'Foundational', 'Simpler explanation', 1, false),
  ('standard', 'Standard', null, 2, true),
  ('advanced', 'Advanced', 'Go deeper', 3, false)
on conflict (id) do nothing;
alter table public.learning_levels enable row level security;
drop policy if exists "levels read" on public.learning_levels;
create policy "levels read" on public.learning_levels for select to authenticated using (true);
drop policy if exists "levels super write" on public.learning_levels;
create policy "levels super write" on public.learning_levels for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create table if not exists public.learning_unit_variants (
  unit_id uuid not null references public.learning_units(id) on delete cascade,
  level_id text not null references public.learning_levels(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 1 and 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (unit_id, level_id)
);
drop trigger if exists set_updated_at on public.learning_unit_variants;
create trigger set_updated_at before update on public.learning_unit_variants for each row execute function public.set_updated_at();

-- The default level IS the page body; variants exist only for reading pages (article / steps).
create or replace function public.guard_unit_variant()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.learning_levels l where l.id = new.level_id and l.is_default) then
    raise exception 'The default level is the page itself. Edit the page body instead.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.learning_units u where u.id = new.unit_id and u.kind in ('article', 'steps')) then
    raise exception 'Only reading and steps pages can have level versions.' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists guard_unit_variant on public.learning_unit_variants;
create trigger guard_unit_variant before insert or update on public.learning_unit_variants
  for each row execute function public.guard_unit_variant();

alter table public.learning_unit_variants enable row level security;
drop policy if exists "variants read" on public.learning_unit_variants;
create policy "variants read" on public.learning_unit_variants for select to authenticated
  using (exists (select 1 from public.learning_units u where u.id = unit_id and (
    public.owns_module(u.module_id) or (u.published and exists (
      select 1 from public.learning_modules m where m.id = u.module_id and m.published and public.can_access_course(m.course_id))))));
drop policy if exists "variants write" on public.learning_unit_variants;
create policy "variants write" on public.learning_unit_variants for all to authenticated
  using (exists (select 1 from public.learning_units u where u.id = unit_id and public.owns_module(u.module_id)))
  with check (exists (select 1 from public.learning_units u where u.id = unit_id and public.owns_module(u.module_id)));

-- ---------------------------------------------------------------------
-- 3. Activities (practice; answers are part of the activity, graded on the device)
-- ---------------------------------------------------------------------
create table if not exists public.learning_activities (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  kind text not null check (kind in ('sort', 'order', 'spot', 'password')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  prompt text not null default '' check (char_length(prompt) <= 2000),
  spec jsonb not null default '{}'::jsonb check (jsonb_typeof(spec) = 'object'),
  position int not null default 0 check (position >= 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learning_activities_module_idx on public.learning_activities (module_id, position);
drop trigger if exists set_updated_at on public.learning_activities;
create trigger set_updated_at before update on public.learning_activities for each row execute function public.set_updated_at();
alter table public.learning_activities enable row level security;
drop policy if exists "activities read" on public.learning_activities;
create policy "activities read" on public.learning_activities for select to authenticated
  using (public.owns_module(module_id) or (published and exists (
    select 1 from public.learning_modules m where m.id = module_id and m.published and public.can_access_course(m.course_id))));
drop policy if exists "activities write" on public.learning_activities;
create policy "activities write" on public.learning_activities for all to authenticated
  using (public.owns_module(module_id)) with check (public.owns_module(module_id));

-- ---------------------------------------------------------------------
-- 4. Glossary (one dictionary per course)
-- ---------------------------------------------------------------------
create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  term text not null check (char_length(btrim(term)) between 1 and 80),
  definition text not null check (char_length(btrim(definition)) between 1 and 2000),
  simple text not null default '' check (char_length(simple) <= 1000),
  example text not null default '' check (char_length(example) <= 1000),
  category text not null default '' check (char_length(category) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug)
);
create index if not exists glossary_terms_course_idx on public.glossary_terms (course_id, term);
drop trigger if exists set_updated_at on public.glossary_terms;
create trigger set_updated_at before update on public.glossary_terms for each row execute function public.set_updated_at();
alter table public.glossary_terms enable row level security;
drop policy if exists "glossary read" on public.glossary_terms;
create policy "glossary read" on public.glossary_terms for select to authenticated
  using (public.can_access_course(course_id));
drop policy if exists "glossary write" on public.glossary_terms;
create policy "glossary write" on public.glossary_terms for all to authenticated
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));

-- ---------------------------------------------------------------------
-- 5. Quiz question metadata (analytics, pre-test placement)
-- ---------------------------------------------------------------------
alter table public.learning_quiz_questions add column if not exists competency smallint;
alter table public.learning_quiz_questions add column if not exists difficulty smallint;
alter table public.learning_quiz_questions add column if not exists explanation text not null default '';
alter table public.learning_quiz_questions drop constraint if exists learning_quiz_questions_competency_check;
alter table public.learning_quiz_questions add constraint learning_quiz_questions_competency_check
  check (competency is null or competency between 0 and 3);
alter table public.learning_quiz_questions drop constraint if exists learning_quiz_questions_difficulty_check;
alter table public.learning_quiz_questions add constraint learning_quiz_questions_difficulty_check
  check (difficulty is null or difficulty between 1 and 3);
alter table public.learning_quiz_questions drop constraint if exists learning_quiz_questions_explanation_check;
alter table public.learning_quiz_questions add constraint learning_quiz_questions_explanation_check
  check (char_length(explanation) <= 2000);

-- ---------------------------------------------------------------------
-- 6. Seed bookkeeping: a seed runs once, so re-running it never overwrites instructor edits.
-- ---------------------------------------------------------------------
create table if not exists public.seed_runs (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.seed_runs enable row level security;
revoke all on public.seed_runs from public, anon, authenticated;
