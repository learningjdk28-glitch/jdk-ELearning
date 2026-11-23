# JDK Learning System

Learning management system for the Polytechnic College of La Union: a **student portal** and an **instructor portal**,
running on the web (installable PWA) and as an **Android app**, with **offline** study and sync.

Live web app: <https://jdk-elearning.learningjdk28.workers.dev> · Android APK: see the repository's **Releases**.

## What it does

- **Students:** enroll in courses; modules of 5 short pages (with easier/harder versions) then a check; course pre-test
  that sets the starting point and a post-test that shows what was learned; quizzes with answer review; practice
  activities; assignments (link, text or file) with deadlines; progress with class comparison; glossary; read aloud;
  verifiable PDF certificates; dark mode and own colour; works offline and syncs later.
- **Instructors:** courses (with a course colour), modules and pages, glossary, pre-test, quizzes, activities, assignments
  and grading, invitations by email (queued, sent automatically), enrollments with progress, analytics, certificate designer
  (upload a Canva PDF/PNG, place fields, QR code), and an AI analytics assistant (`ChatBot/`).

Built with React, Vite, Tailwind CSS, React Router, Supabase (Auth, Postgres with row-level security, Storage,
Edge Functions), Dexie (offline storage), pdf-lib, and Capacitor (Android).

## Set up a new copy

You need **Node.js 20+**, a **Supabase** project, and (for the Android app) **Android Studio** plus a Java 17–21 JDK.

### 1. App

```text
npm install
copy .env.example .env      (then fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_PUBLIC_URL)
```

### 2. Database (Supabase > SQL Editor), in this order

1. `supabase_setup.sql` — base tables, profiles, sign-up trigger
2. `supabase_lms_upgrade.sql` — modules and materials
3. every file in `supabase/migrations/`, **in name order** (`20261113_…` first, `20261124c_…` last)

Each file is safe to run more than once. Then run `supabase/checks/00_schema_check.sql`: every row except the
"optional" ones should say `ok = true`.

Make yourself the super administrator (after you have registered in the app):

```sql
update public.profiles set role = 'admin', is_super_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

### 3. Supabase settings

- **Authentication > Emails > SMTP:** your sender (for example Gmail with an app password).
- **Authentication > Rate limits:** emails per hour **100** (the app keeps 90 for invitations).
- **Authentication > URL Configuration:** Site URL = your web address; Redirect URLs: your web address `/**`,
  `http://localhost:5173/**`, and `ph.edu.pclu.jdklearn://**` (the Android app).
- **Edge Functions:** deploy `supabase/functions/invite-users/index.ts` as `invite-users`, and add the secret
  `PUBLIC_APP_URL` = your web address.
- **Optional, invitations sent every 5 minutes:** turn on the `pg_cron` and `pg_net` extensions, add the Edge Function
  secret `CRON_SECRET`, then fill in and run `supabase/setup/invite_schedule.sql` (see the instructions at its top).
  Save your filled-in copy as `*.local.sql` so git ignores it.

### 4. Run, test, deploy

```text
npm run dev        app on http://localhost:5173
npm test           all tests (database rules run in an in-memory Postgres)
npm run build      production build in dist/
```

**Web:** Cloudflare Workers builds from GitHub with `npm run build` and serves `dist/` (`wrangler.jsonc`).
Set the `VITE_*` variables in Cloudflare under Settings > Build > Variables.

**Android:** see `docs/APK_BUILD.md` (debug APK, signed release for Google Play).

**Analytics assistant:** see `ChatBot/README.md`.

## Project layout

| Folder / file | What it is |
| --- | --- |
| `src/` | The app: `pages/`, `components/`, `services/` (database calls), `lib/` (rules, tested), `hooks/` |
| `public/`, `assets/` | Logo (PCLU seal), app icons; `assets/` is the source for the Android icons and splash |
| `supabase/` | `migrations/` (database), `functions/` (Edge Function), `setup/` (invitation schedule), `checks/` |
| `supabase_setup.sql`, `supabase_lms_upgrade.sql` | Base schema, run before the migrations |
| `android/` | Capacitor Android project (package `ph.edu.pclu.jdklearn`) |
| `ChatBot/` | Python service behind the instructor analytics assistant |
| `tests/` | `npm test` |
| `docs/APK_BUILD.md` | Building the Android app |
| `credit.md` | Libraries, services and credits |

Never commit `.env`, `android/keystore.properties`, the signing key, or `*.local.sql`: they hold secrets (all are in `.gitignore`).
