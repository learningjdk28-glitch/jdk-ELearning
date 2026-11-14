# Audit: every screen, element and action

Audited before this pass (state after the mockup redesign). Status words: **working** (real, saved), **local** (real, saved on the device only), **not connected** (UI present, no database call), **broken**, **missing**.

## Assumptions

- Stack is React + Vite + Tailwind + Dexie (IndexedDB) + Supabase. APK method: **Capacitor** (recommended, reuses the web build).
- Roles: `learner` (default) and `admin`. The prompt had no role list, so these two were chosen. Admins are created in SQL only.
- Course content (lessons, questions, glossary) is bundled in the app so it works offline. The database copies of courses, lessons and questions exist for foreign keys and admin use; the app does not read them.
- Learner data is offline-first: every write goes to IndexedDB first, then syncs. Offline, the screen still works and shows "waiting to sync".
- No file uploads exist, so no Storage bucket is created.

## Table

| Screen | Element | Expected action | Status before | Table | Fix |
|---|---|---|---|---|---|
| Welcome | Get Started / Log in | Go to register / login | working | none | none |
| Login | Email, password, Log in | Supabase sign-in | working | auth.users | Offline banner added |
| Login | Forgot password link | Open reset page | working | none | none |
| Register | Name, email, passwords, Create account | Sign up, create profile | working in the app, **no profile table or trigger existed** | auth.users, profiles | Trigger creates profile (role forced to learner) |
| Register | Confirm email link | Return to the app | broken on Android (web URL only) | auth | `emailRedirectTo` is web URL or `com.navilearn.app://login` |
| Forgot password | Send reset link | Email a link | working on web, **broken in APK** | auth | Redirect per platform, deep link in manifest |
| Reset password | Update password | Set new password | working on web, broken in APK | auth | `NativeBridge` reads the link tokens and signs the user in |
| Dashboard | Course card, 4 tiles, competency bars | Navigate, show real scores | working (local) | attempts (local) | none |
| Dashboard | Online / Offline card | Show connection | working | none | none |
| Courses | Lesson cards, mode chip, path button | Navigate | working | none | none |
| Learning mode | 4 mode cards | Save preference | local only, **not in cloud**; Auditory and Kinesthetic were **disabled stubs** | learning_preferences | Synced by `services/sync.js`; CHECK limits modes. Auditory (speech) and Kinesthetic (4 activity types) now built |
| Pre-test | Option buttons, Previous/Next, jump dots, Submit | Grade and save attempt | local; cloud upload was **3 separate calls, not atomic, trusted client correctness** | assessment_attempts, assessment_answers, competency_results | Single RPC `sync_attempt`, correctness recomputed in SQL |
| Pre-test | Jump dots 32px | 44px tap target | too small | none | 44px |
| Results | Retake, Start path | Navigate | working | none | none |
| Learning path | Open lesson, Take quiz, Continue | Navigate | working | none | none |
| Lesson | Level buttons, mode buttons, term chips, tabs | Change presentation | working (mode saved as above) | learning_preferences | 44px targets |
| Lesson | My notes box | Save note | **local only, never uploaded** | lesson_notes (new) | New table, RLS, sync push and pull; saves only on real edits |
| Lesson | Take quiz | Open quiz | working | none | none |
| Quiz | Submit | Grade, mark lesson complete, save | local; same non-atomic upload problem | assessment_*, lesson_progress | RPC for attempt, upsert for progress |
| Glossary | Search, term chips, related terms | Show ELI5 | working, bundled by design (offline) | none | none |
| Progress | 3 tabs, charts, history | Show real data | working (local) | attempts | History shows "Synced" or "Waiting to sync" per attempt |
| Profile | Display name | Edit and save | **not connected** (profile table never read) | profiles | Form with validation, saving state, success and error |
| Profile | Change password | Update password | **missing** | auth | Added |
| Profile | Sync now | Force sync | working | all learner tables | none |
| Profile | Reset my progress | Delete cloud and local progress | **missing** | attempts, progress, notes | RPC `reset_my_progress` plus local clear, with confirmation |
| Profile | Log out | Clear session | working | auth | none |
| (none) | Role-based screen | Admin overview | **missing** | profiles and learner tables | `/admin` guarded by role, RPC `admin_learner_overview` |
| Layout | Hardware back button, deep links, safe areas, keyboard | Android behaviour | **missing** | none | `NativeBridge`, `viewport-fit=cover`, `adjustResize`, safe-area padding |
| All | Realtime | Update when another device saves | missing | learner tables | Realtime publication and one subscription per learner |

## Broken, unused or duplicated code

- `src/lib/sync.js` pushed attempts with three independent upserts (a failure between them left a half-saved attempt). Replaced by `src/services/sync.js` using one RPC.
- `supabase.sql` had no profile table, trigger, roles, delete policies, RPCs or realtime. Replaced by `supabase_setup.sql`.
- No function throws on load. No dead components were found.
- Roles: none existed, and a signup could not have been made an admin safely. Role now lives in `profiles.role`, cannot be set from signup metadata, and cannot be changed by the user (trigger).

## Networking Basics integration (audit and result)

| Existing item | Verified behavior | Change made | Risk handled |
|---|---|---|---|
| src/data/*.js (Digital Literacy) | Content in data modules, not in components; no file loader existed | Kept as is. New file-based loader for the new course only | No regression: 60 and 32 older browser checks still pass |
| Attempts (Dexie) | Course-agnostic, kinds diagnostic and lesson | Added kind module, courseId, assessmentVersion, snapshot | Digital Literacy stats and path filter out module attempts |
| Competency stats | Global over all attempts | Scoped: Digital Literacy and module scoring are separate | Module quizzes cannot change the pre-test baseline |
| Sync RPC and tables | kind limited to diagnostic and lesson; lessons required a focus competency | Allow kind module, nullable focus, seed course, modules and 48 questions | Upgrade block in supabase_setup.sql for existing databases |
| Glossary | Static data file | Networking terms merged from glossary.json | Existing terms untouched |
| Progress and Dashboard | Digital Literacy only | Course switcher on Progress, Networking card on Dashboard and Courses | Pre-test and module history shown separately |
