-- Run after supabase_setup.sql. Auth users are created through Supabase Auth, never directly here.
create table if not exists public.learning_modules (
 id uuid primary key default gen_random_uuid(), course_id text not null,
 title text not null check (length(trim(title)) > 0), description text not null default '',
 position integer not null default 0, published boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists learning_modules_course_idx on public.learning_modules(course_id,position);
create table if not exists public.learning_materials (
 id uuid primary key default gen_random_uuid(), module_id uuid not null references public.learning_modules(id) on delete cascade,
 title text not null, storage_path text not null unique, mime_type text not null,
 file_size bigint not null check(file_size > 0 and file_size <= 26214400),
 created_at timestamptz not null default now()
);
create index if not exists learning_materials_module_idx on public.learning_materials(module_id);
alter table public.learning_modules enable row level security;
alter table public.learning_materials enable row level security;
create policy "modules read published or admin" on public.learning_modules for select to authenticated using (published or (select public.is_admin()));
create policy "modules admin insert" on public.learning_modules for insert to authenticated with check ((select public.is_admin()));
create policy "modules admin update" on public.learning_modules for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "modules admin delete" on public.learning_modules for delete to authenticated using ((select public.is_admin()));
create policy "materials read published or admin" on public.learning_materials for select to authenticated using (exists (select 1 from public.learning_modules m where m.id=module_id and (m.published or (select public.is_admin()))));
create policy "materials admin insert" on public.learning_materials for insert to authenticated with check ((select public.is_admin()));
create policy "materials admin delete" on public.learning_materials for delete to authenticated using ((select public.is_admin()));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('learning-materials','learning-materials',false,26214400,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','image/png','image/jpeg'])
 on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "admin uploads learning materials" on storage.objects for insert to authenticated with check (bucket_id='learning-materials' and (select public.is_admin()));
create policy "admin deletes learning materials" on storage.objects for delete to authenticated using (bucket_id='learning-materials' and (select public.is_admin()));
create policy "read published learning materials" on storage.objects for select to authenticated using (
 bucket_id='learning-materials' and exists (
 select 1 from public.learning_materials f join public.learning_modules m on m.id=f.module_id
 where f.storage_path=name and (m.published or (select public.is_admin()))
 ));
