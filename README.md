> **JDK Learn v2 upgrade:** See [UPGRADE_V2.md](UPGRADE_V2.md) for new admin/student pages, secure Supabase migrations, deployment steps, and limitations.

# JDK Learning System

Offline-first adaptive learning PWA. React + Vite + Tailwind + React Router + Supabase (auth and Postgres) + Dexie (IndexedDB) + Recharts.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon/publishable key only, never the service-role key).
3. Supabase SQL Editor: paste and run all of `supabase_setup.sql` (tables, row-level security, profile trigger, course seed). Safe to re-run.
4. Supabase Authentication: Email provider on. If "Confirm email" is on, new users must click the email link before logging in. For a quick demo, turn it off or create the demo user in the dashboard.
5. Supabase Authentication > URL Configuration: set **Site URL** to your hosted app address and add it (plus `http://localhost:5173`) to **Redirect URLs**. Set `VITE_PUBLIC_URL` to the hosted address so confirmation and reset emails open on phones and other devices, not on `localhost`.
6. `npm run dev`, or `npm run build` then `npm run preview` to test the PWA (service worker only runs in the production build).

Docs: docs/AUDIT.md (what was wired), docs/TEST_CHECKLIST.md (click here, see this row), docs/APK_BUILD.md (Android and web deploy).

Promote an admin once in the SQL Editor: update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');

Other scripts: npm run cap:sync, cap:open, cap:assets (Android); `npm test` (scoring and adaptive logic), `npm run build:sql` (regenerate `supabase_setup.sql` from `src/data`), `npm run build:icons`.

## Learner workflow

Register/Login, Courses, Learning mode, Diagnostic pre-test (16 questions), Competency results, Personalized path, Adaptive lesson, Post-lesson quiz, Progress dashboard.

## How adaptation works (rules-based, not a trained AI model)

- Competency score = correct answers / answered questions x 100, per competency, from real answers (pre-test plus lesson quizzes). Unanswered questions are excluded. Fewer than 3 answers means "insufficient evidence" and the Standard level is used.
- Level: below 50 Foundational, 50 to 79 Standard, 80 or more Advanced.
- Each lesson is linked to one competency; its level follows that competency only. Path order: unfinished lessons first, lowest linked score first.
- Quiz questions per lesson depend on level (easier mix for Foundational, harder for Advanced).
- Learning modes change presentation only (Visual, Read/Write, Auditory, Kinesthetic). Learning objectives are identical in every mode and level.

## Offline and sync

- App shell, lessons, quizzes, and glossary are precached by the service worker after the first online visit.
- Attempts, lesson progress, notes, and mode are stored in IndexedDB, keyed by user id (accounts on one device do not mix).
- Unsynced records upload on login, on reconnect, and after each save. Attempts use a client-generated uuid as primary key and upsert, so repeated sync cannot duplicate. Cloud records missing locally are pulled.
- Registration and first login need internet. After that, an offline restart resumes the last signed-in learner for local data only (cached user id in localStorage; cleared on logout).

## Demo script

1. Log in. 2. Courses, open the course, choose Read/Write or Visual. 3. Take the pre-test. 4. Results show four scores and weak areas. 5. My Path: weakest competency first at Foundational. 6. Open a lesson, use the difficulty buttons to show levels. 7. Switch Visual and Read/Write. 8. Tap an underlined term for ELI5. 9. Take the lesson quiz. 10. Progress dashboard. 11. Turn off network (DevTools Network offline): reload, lessons, glossary, quizzes still work; header shows Offline and "waiting to sync". 12. Reconnect: header returns to Synced; rows appear in Supabase.

## Status and known gaps

- Verified: 46 database checks on real Postgres (PGlite) covering RLS, roles, atomic RPC, idempotence, constraints; 13 logic tests; 60 headless-browser checks (protected routes, role guard, offline, persistence, account isolation, 14 pages at 375px).
- Not verified: live Supabase (register, login, email links, real sync, realtime) and the Android APK build. Neither was possible on the build machine. Follow docs/TEST_CHECKLIST.md and docs/APK_BUILD.md.
- All four learning modes work. Auditory uses the device text-to-speech voice (no audio files): it works offline only if the device has an offline voice installed, and voice quality varies by device. Kinesthetic has one practice activity per lesson (sort, order, spot red flags, password builder). Activities are practice only and never change scores.
- Conflicts: sync is last-write for preferences, union for progress and attempts. No merge UI.
- Bundle is one ~1 MB chunk (no code splitting).
- Offline resume trusts a cached user id on the device; it does not unlock any cloud data.

## Networking Basics course (file-based content)

Four modules, each with a lesson, a 12-question assessment (3 per competency) and a hands-on activity. All content lives in files, not in components:

```text
src/content/networking-basics/
  course.json                 module list and metadata
  glossary.json               ELI5 terms (merged into the glossary)
  module-0N/lesson.md         lesson text (front matter + ## sections)
  module-0N/assessment.json   12 questions, answer key, explanations, competency, difficulty
  module-0N/activity.json     Kinesthetic activity (sort, order or spot)
```

- One loader (`src/lib/courseContent.js`) bundles every file at build time (`import.meta.glob`), so content is cached for offline use. Parsers and validation (`src/lib/contentParse.js`, zod) reject malformed files with a readable message: wrong question count, not 3 per competency, duplicate ids, bad answer key.
- Lesson Markdown is rendered as React elements (headings, lists, bold, italic). HTML in a lesson file is shown as plain text, never executed.
- To change a lesson or question, edit its file, then run `npm run build:sql` so the database seed matches.
- Module quizzes are stored as attempts of kind `module` with the assessment version and a snapshot of the questions, so an old attempt always reviews exactly what the learner saw. They are scored separately from the Digital Literacy pre-test and lesson quizzes.
- Scores: per competency = correct / 3, total = correct / 12. Unanswered questions earn no credit. Results show raw fractions, percentages and a text label, a four-area chart, all tied strongest and weakest areas, a rules-based suggestion (not AI, not a mastery claim), and a full question review. Retakes keep every attempt.
- Not required offline and not used by the course: Supabase. Sync still uploads module attempts when online.
- If you already ran an earlier `supabase_setup.sql`, run the new one again: it upgrades the constraints for module quizzes and seeds the new course.

## Analytics chatbot (administrators)

An optional admin page (Analytics, `/admin/analytics`) asks the separate `ChatBot` service questions about
quiz results. It reads anonymous, read-only views created by `supabase_analytics.sql`, never the raw tables.
Setup steps are in `ChatBot/README.md`. Set `VITE_CHATBOT_URL` to enable it. The core learning flow does not
depend on it and everything else works offline.
