# JDK Learn v2 — deployment, migration, and maintenance guide

**Release:** 2026-11-13. This source is an incremental upgrade of the existing JDK Learning System, not a new application. It retains the original offline lessons, diagnostic assessment, and learner data structures.

## 1. What is implemented

### Admin portal
- `/admin`: live summary, recent courses, and quick actions.
- `/admin/courses`: create, edit, publish/unpublish and delete empty courses.
- `/admin/content`: choose a course, create/publish/delete modules, create/edit/publish/delete text lessons and HTTPS video/resource links; upload, hide, publish, open and delete PDF, DOCX, PPTX, TXT, PNG and JPG learning materials (25 MB maximum).
- `/admin/students`: paginated, searchable directory with names, emails, registration date, enrollment counts and guarded role changes. The current administrator cannot demote themselves. An optional **secure student-invite action** is included; it requires deploying the accompanying Supabase Edge Function.
- `/admin/enrollments`: paginated course enrollments; find existing students; assign, revoke and restore access.
- `/admin/assessments`: create/publish quizzes, add/delete multiple-choice questions, set passing marks and inspect recent results. The answer key stays private.
- `/admin/analytics`: server-aggregated live course enrollment, lesson completion and quiz metrics.
- `/admin/assistant`: original analytics assistant, unchanged; external ChatBot backend may be needed.
- `/admin/certificates`: list and revoke awarded course certificates.
- `/profile`: existing profile and password controls.

### Student portal
- `/catalog`: browse published courses and enroll using the same account on all devices.
- `/learn/:courseId`: view enrolled-course modules, published text lessons, video/resource links, file downloads, mark lessons complete.
- `/learn/:courseId/quiz/:quizId`: take a quiz graded on the server; results and retakes are stored.
- `/materials`: materials from accessible published modules.
- `/certificates`: request a verified certificate after meeting course requirements; print or save as PDF using the browser print dialog.
- Existing `/courses`, offline quizzes, offline progress, pre-test and lessons remain available separately.

## 2. Back up FIRST

Export a database backup from Supabase or take a point-in-time backup (if your plan supports it). The migration adds tables, columns, indexes, security policies and functions. It also **replaces previous course/module/material SELECT policies with enrollment-based access**. Existing profiles, legacy lesson progress and prior quiz attempts are not deleted. Test on a Supabase staging project before production.

**Use this exact order in Supabase SQL Editor:**

1. On a **new, empty Supabase project**, run `supabase_setup.sql` first.
2. Run `supabase_lms_upgrade.sql` from the previous upgrade (included here).
3. Run **`supabase_lms_v2.sql`** (also under `supabase/migrations/20261113_lms_v2.sql`). This is the new upgrade to copy/paste and execute.
4. On a database where steps 1–2 were already applied, run **only step 3**.

The v2 migration was tested to run twice against a local PostgreSQL-compatible test database. Administrators can revoke an enrollment; a revoked student cannot delete the enrollment row or independently re-enroll until an admin restores access. Do not re-run `supabase_setup.sql` *after* v2, because the old script can re-create legacy policies. Do not directly insert students into `auth.users` or the `profiles` table to register accounts.

### Check orphaned v1 modules

The v2 migration adds a `NOT VALID` foreign key to preserve existing data if a legacy module has a nonexistent course ID. Check and fix these before enforcing the constraint:

```sql
select m.id, m.title, m.course_id
from public.learning_modules m
left join public.courses c on c.id = m.course_id
where c.id is null;
```

After fixing orphan records, optionally enforce the existing key:

```sql
alter table public.learning_modules validate constraint learning_modules_course_fk;
```

## 3. Give your administrator account the Admin role

Create and verify your own account via the web registration screen. Then in Supabase SQL Editor run (replace the sample email):

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'your-admin-email@example.com'
);
```

All public registrations receive the role `learner`. **There is no "register as admin" option** because that would allow unauthorized users to elevate themselves. The user profile is checked against Supabase before the admin interface is unlocked. Server-side Row Level Security is the ultimate permission guard.

## 4. Frontend environment variables

Create `.env` locally from `.env.example`, filling in only the *public* values from the same Supabase project:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
VITE_PUBLIC_URL=https://YOUR-DOMAIN.vercel.app
```

**NEVER** put a service-role/secret key in `.env` with the `VITE_` prefix or in React source code. Each student and admin signs in via Supabase Auth and the same hosted app, regardless of device or location. Different devices must use the same Supabase URL and public key.

In **Supabase → Authentication → URL Configuration**:
- Site URL: `https://YOUR-DOMAIN.vercel.app`
- Redirect URLs: `https://YOUR-DOMAIN.vercel.app/login` and `https://YOUR-DOMAIN.vercel.app/reset-password`
- Enable email/password authentication. Configure SMTP for reliable email confirmation and password resets before real launch.
- Follow existing Android deep-link setup if distributing the Capacitor build.

In Vercel project settings, add those three environment variables for production (and preview as appropriate), redeploy, and use the same project domain for email links. Local development uses `http://localhost:5173` or the address printed by Vite; add the local redirect URLs in Supabase while developing.

## 5. Deploy administrator student invitations (optional)

The **Invite student** form in `/admin/students` sends an email invitation; it does **not** create or expose passwords in React. This requires deploying the bundled server-only function:

```bash
# Install Supabase CLI and link your Supabase project first.
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy admin-invite-student
supabase secrets set PUBLIC_APP_URL=https://YOUR-DOMAIN.vercel.app
```

The function expects the Supabase-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets inside the Edge Function environment. **Never put those service-role credentials in Vercel client environment variables or the browser.** Configure email delivery in Supabase Authentication (SMTP provider) and allow `https://YOUR-DOMAIN.vercel.app/reset-password` in redirect URLs. An invited student follows the invite link, chooses a password, and signs in using the same Supabase backend from any device. Existing students should sign in normally and be assigned through the Enrollments page. The function validates the caller's Supabase session and checks their server-side admin role before inviting a user. If you do not deploy it, hide the invite button or use public student self-registration instead.

## 6. Install, run and verify

```bash
npm ci
npm run dev
npm test
npm run build
```

Use a clean installation of `node_modules` **on the same OS you are building on**, not copies of Windows modules on Linux. In this analysis container the supplied dependency tree contained Windows-native Rollup binaries; network installation was unavailable, so **the production bundle and real-browser interaction could not be verified here**. Syntax was independently checked, and the database migration was executed in a local PostgreSQL-compatible engine with permission tests. Run `npm ci && npm run build` on your Windows PC/Vercel before deploying.

For production QA, test with at least two separate browsers/accounts: one Admin and one Student. Create a draft course, add a module, lesson, document and quiz; publish everything; enroll as Student; take the quiz, complete lessons, view the file and issue a certificate; then revoke enrollment and confirm private resources are no longer accessible. Check sign-in again on a separate device.

## 7. Security, scaling, and operational constraints

- Client never contains the Supabase service-role secret. Server RLS restricts course content, quiz answers, files, progress, student emails and management permissions. Student-facing graded quiz questions are returned by a sanitized RPC; scoring and certificate eligibility are calculated by the database.
- Private uploads use the `learning-materials` Supabase Storage bucket with 90-second signed view URLs. File types are extension/MIME checked in the client and limited by the bucket; **add antivirus/content scanning and audit logging before handling untrusted public uploads at scale.**
- Admin directory and enrollments use server pagination, indexed lookup fields, and server-side aggregate functions. The course analytics view is capped at 100 courses and the certificates list at 200 recent results; add more pagination for very large installations.
- For maintainability, Supabase calls are centralized in `src/services/lms.js` and `src/services/materials.js`; shared admin UI elements are in `src/components/AdminUI.jsx`; migrations are versioned in `supabase/migrations/`. Add new migrations rather than editing prior applied versions.
- Data stored in pre-existing bundled offline lessons is a separate track, and its old access policies remain unchanged. New course enrollments/grades/certificates are for the **database-backed** LMS. They are not yet merged with the original offline diagnostic progress. The reports exclude original offline progress.
- Admins can invite new students through the bundled **optional Edge Function**, while other account administration (deleting arbitrary Auth users, sending administrator invitations, force-resetting other users' passwords, bulk import, and permanently suspending sign-in) still requires new audited server-side functions. Never implement these through a service-role key in React.
- Course and module deletion refuses to remove resources with uploaded files to avoid orphaned storage objects. Delete the files first, or unpublish the content instead. Deletion is irreversible; maintain database backups.
- Video content is currently an **HTTPS external link**, not transcoded/hosted video streaming. The certificate print view uses the browser's print/PDF support, not a signed third-party credential service.
- The existing ChatBot analytics assistant depends on the separate Python service in `ChatBot/`, and is optional.

## 8. Core project map

| Component | File |
|---|---|
| Login/registration | `src/pages/Auth.jsx` |
| Authentication and safe role refresh | `src/context/AuthContext.jsx` |
| Admin sidebar/layout | `src/components/Layout.jsx` |
| Admin pages | `src/pages/AdminOverview.jsx`, `AdminCourses.jsx`, `AdminContent.jsx`, `AdminStudents.jsx`, `AdminEnrollments.jsx`, `AdminAssessments.jsx`, `AdminReports.jsx`, `AdminCertificates.jsx` |
| Student pages | `src/pages/Catalog.jsx`, `CourseViewer.jsx`, `StudentQuiz.jsx`, `StudentCertificates.jsx`, `StudentMaterials.jsx` |
| Database API services | `src/services/lms.js`, `src/services/materials.js` |
| Secure student invitations | `supabase/functions/admin-invite-student/index.ts` |
| New database changes | `supabase_lms_v2.sql` |
| Automated migration/RLS tests | `tests/lms-v2.test.mjs` |

**Deployment status:** source implementation + local unit / SQL-security validation completed; live Supabase staging and browser acceptance testing still required.
