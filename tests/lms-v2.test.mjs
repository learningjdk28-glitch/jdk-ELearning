import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const db = new PGlite();
const root = new URL('../', import.meta.url);
const get = f => readFileSync(new URL(f, root), 'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const q=async(sql)=> (await db.query(sql)).rows;
const as=async(id,fn)=>{
 await db.exec(`set role ${id ? 'authenticated':'anon'}; select set_config('request.jwt.claim.sub', '${id||''}', false);`);
 try{return await fn();}finally{await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);}
};
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets (id text primary key,name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), name text, bucket_id text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
grant usage on schema auth, public, storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
alter default privileges in schema public grant all on tables to authenticated,anon;
alter default privileges in schema public grant all on functions to authenticated,anon;
`);
await db.exec(get('supabase_setup.sql'));
await db.exec(get('supabase_lms_upgrade.sql'));
await db.exec(get('supabase_lms_v2.sql'));
await db.exec(get('supabase_lms_v2.sql'));
await db.exec('grant all on all tables in schema public,storage to authenticated,anon');
await db.exec(`insert into auth.users (id,email) values ('${A}','admin@test.dev'),('${B}','b@test.dev'),('${C}','c@test.dev');`);
await db.exec(`update public.profiles set role='admin' where id='${A}'`);
const moduleId=(await as(A,()=>q(`insert into public.learning_modules (course_id,title,published) values ('networking-basics','Published module',true) returning id`)))[0].id;
const unitId=(await as(A,()=>q(`insert into public.learning_units (module_id,title,content,published) values ('${moduleId}','Unit one','Study this',true) returning id`)))[0].id;
const materialId=(await as(A,()=>q(`insert into public.learning_materials (module_id,title,storage_path,mime_type,file_size,published) values ('${moduleId}','Report','${moduleId}/report.pdf','application/pdf',100,true) returning id`)))[0].id;
await db.exec(`insert into storage.objects (name,bucket_id) values ('${moduleId}/report.pdf','learning-materials')`);

test('migration is safe to re-run and preserves seeded courses', async()=>{
 assert.equal((await q('select count(*)::int n from public.courses'))[0].n>=2,true);
 assert.equal((await q(`select count(*)::int n from public.learning_units where id='${unitId}'`))[0].n,1);
});
test('nonenrolled student sees catalog, but not course modules, units, or files', async()=>{
 const out=await as(B,()=>Promise.all([q(`select id from public.courses where id='networking-basics'`),q('select id from public.learning_modules'),q('select id from public.learning_units'),q('select id from public.learning_materials'),q('select name from storage.objects')]));
 assert.equal(out[0].length,1);for(const rows of out.slice(1))assert.equal(rows.length,0);
});
test('student can enroll only as themself in a published course',async()=>{
 await as(B,()=>q(`select public.enroll_in_course('networking-basics')`));
 assert.equal((await as(B,()=>q('select id from public.learning_units'))).length,1);
 assert.equal((await as(B,()=>q('select id from public.learning_materials'))).length,1);
 assert.equal((await as(B,()=>q('select name from storage.objects'))).length,1);
 await assert.rejects(as(C,()=>q(`insert into public.course_enrollments(course_id,user_id) values ('networking-basics','${B}')`)), /row-level security/);
});
test('nonenrolled student cannot forge progress for other student', async()=>{
 await assert.rejects(as(C,()=>q(`insert into public.unit_completions(unit_id,user_id) values ('${unitId}','${C}')`)),/row-level security/);
 await assert.rejects(as(B,()=>q(`insert into public.unit_completions(unit_id,user_id) values ('${unitId}','${C}')`)),/row-level security/);
 await as(B,()=>q(`insert into public.unit_completions(unit_id,user_id) values ('${unitId}','${B}')`));
 assert.equal((await as(C,()=>q('select * from public.unit_completions'))).length,0);
});
test('admin can publish, manage course enrollments, and see summary', async()=>{
 const rows=await as(A,()=>q('select public.lms_admin_summary() as stats'));
 assert.ok(Number(rows[0].stats.courses)>=2);
 await as(A,()=>q(`update public.course_enrollments set status='revoked' where user_id='${B}'`));
 // An administrator's revocation must not be bypassed by re-enrolling or deleting
 // the revoked row and re-enrolling (both previously possible).
 await assert.rejects(as(B,()=>q(`select public.enroll_in_course('networking-basics')`)), /Access was revoked/);
 await as(B,()=>q(`delete from public.course_enrollments where course_id='networking-basics' and user_id='${B}'`));
 assert.equal((await as(B,()=>q(`select status from public.course_enrollments where course_id='networking-basics'`)))[0].status,'revoked');
 assert.equal((await as(B,()=>q('select id from public.learning_units'))).length,0);
 assert.equal((await as(B,()=>q('select name from storage.objects'))).length,0);
 await assert.rejects(as(B,()=>q('select public.lms_admin_summary()')),/Admin access required/);
});
test('unpublished module or material is not shown to enrolled learner', async()=>{
 await as(A,()=>q(`update public.course_enrollments set status='active' where user_id='${B}'`));
 await as(A,()=>q(`update public.learning_materials set published=false where id='${materialId}'`));
 assert.equal((await as(B,()=>q('select id from public.learning_materials'))).length,0);
 assert.equal((await as(B,()=>q('select name from storage.objects'))).length,0);
 await as(A,()=>q(`update public.learning_modules set published=false where id='${moduleId}'`));
 assert.equal((await as(B,()=>q('select id from public.learning_units'))).length,0);
});

test('quiz correct answers are hidden and grading is server-side', async()=>{
 await as(A,()=>q(`update public.learning_modules set published=true where id='${moduleId}'`));
 const quizId=(await as(A,()=>q(`insert into public.learning_quizzes (module_id,title,published) values ('${moduleId}','Check your skills',true) returning id`)))[0].id;
 const questionId=(await as(A,()=>q(`insert into public.learning_quiz_questions (quiz_id,prompt,options,correct_index) values ('${quizId}','Which is correct?','["Correct","Incorrect"]'::jsonb,0) returning id`)))[0].id;
 assert.equal((await as(B,()=>q('select * from public.learning_quiz_questions'))).length,0);
 const response=(await as(B,()=>q(`select public.get_learning_quiz('${quizId}') as result`)))[0].result;
 assert.equal(response.questions.length,1);
 assert.ok(!('correct_index' in response.questions[0]));
 await assert.rejects(as(C,()=>q(`select public.get_learning_quiz('${quizId}')`)),/Quiz unavailable/);
 await assert.rejects(as(B,()=>q(`insert into public.learning_quiz_attempts (quiz_id,user_id,correct_count,question_count,score,passed) values ('${quizId}','${B}',1,1,100,true)`)),/row-level security/);
 const result=(await as(B,()=>q(`select public.submit_learning_quiz('${quizId}', '[{"questionId":"${questionId}","choice":0}]'::jsonb) as result`)))[0].result;
 assert.equal(Number(result.score),100);
 assert.equal(result.passed,true);
 const wrong=(await as(B,()=>q(`select public.submit_learning_quiz('${quizId}', '[{"questionId":"${questionId}","choice":1}]'::jsonb) as result`)))[0].result;
 assert.equal(Number(wrong.score),0);
 assert.equal(wrong.passed,false);
 assert.equal((await as(C,()=>q('select * from public.learning_quiz_attempts'))).length,0);
});

test('student directory is admin-only, paginated and includes email', async()=>{
 await assert.rejects(as(B,()=>q(`select * from public.lms_admin_students('',20,0)`)),/Admin access required/);
 const directory=await as(A,()=>q(`select * from public.lms_admin_students('c@test',20,0)`));
 assert.equal(directory.length,1);
 assert.equal(directory[0].email,'c@test.dev');
 const page=await as(A,()=>q(`select * from public.lms_admin_students('',1,1)`));
 assert.equal(page.length,1);
 assert.equal(Number(page[0].total_rows),3);
});

test('certificate requires enrollment, lessons and passing quizzes, without client-side forgery',async()=>{
 await assert.rejects(as(C,()=>q(`select public.issue_lms_certificate('networking-basics')`)),/Enroll in the published course first/);
 const cert=(await as(B,()=>q(`select public.issue_lms_certificate('networking-basics') as result`)))[0].result;
 assert.equal(cert.student,'b');
 assert.ok(cert.id);
 assert.equal((await as(C,()=>q('select id from public.lms_certificates'))).length,0);
 await assert.rejects(as(C,()=>q(`insert into public.lms_certificates(course_id,user_id,course_title,student_name) values ('networking-basics','${C}','Test','Fake')`)),/row-level security/);
 assert.equal((await as(B,()=>q('select id from public.lms_certificates'))).length,1);
 const certTwo=(await as(B,()=>q(`select public.issue_lms_certificate('networking-basics') as result`)))[0].result;
 assert.equal(certTwo.id,cert.id);
 await as(A,()=>q(`delete from public.lms_certificates where id='${cert.id}'`));
 assert.equal((await as(B,()=>q('select id from public.lms_certificates'))).length,0);
});
test('aggregated admin metrics are private',async()=>{
 const data=await as(A,()=>q('select * from public.lms_admin_course_metrics()'));
 assert.ok(data.length>=2);
 assert.ok(data.some(c=>c.course_id==='networking-basics'&&Number(c.quiz_submissions)>=2));
 await assert.rejects(as(C,()=>q('select * from public.lms_admin_course_metrics()')),/Admin access required/);
});
