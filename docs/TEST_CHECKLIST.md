# Test checklist

Open Supabase > Table Editor in a second tab. Use two test accounts (A and B). Run `supabase_setup.sql` first.
Promote an admin once in the SQL Editor:
`update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'a@example.com');`

| # | Do this | Expect on screen | Expect in Supabase |
|---|---|---|---|
| 1 | Register A (name "Alice") | "Check your email" or lands on dashboard | `auth.users` has A. `profiles` has A with display_name Alice, role learner |
| 2 | Log in as A | Dashboard "Hi, Alice!" | none |
| 3 | Wrong password | Red error message, button re-enabled | none |
| 4 | Forgot password, open the email link | Reset page, set password, lands on dashboard | auth updated |
| 5 | Pre-test, answer all 16, Submit | Results page with 4 scores | `assessment_attempts` 1 row (kind diagnostic, total_answered 16). `assessment_answers` 16 rows. `competency_results` 4 rows |
| 6 | Pre-test, leave 4 questions unanswered | "Insufficient evidence" label on affected competency | answers rows with null `selected_index`. results only for answered |
| 7 | Learning mode: pick Visual | Card turns green | `learning_preferences` row learning_mode Visual |
| 8 | Open a lesson, click Foundational / Standard / Advanced | Content and badge change | none (display only) |
| 9 | Lesson, Read/Write mode, type a note, wait 1 s | "Saved on this device" | `lesson_notes` row with your text |
| 10 | Take the lesson quiz, Submit | Score, review with explanations | New `assessment_attempts` row (kind lesson, lesson_id set). `lesson_progress` row completed true |
| 11 | Progress page, all three tabs | Donut, bars, charts, history "Synced" | none |
| 12 | Glossary: search "phish", tap a term | 3 explanation cards | none |
| 13 | Turn network off, do a quiz | Works. Header "Offline". History "Waiting to sync" | nothing new yet |
| 14 | Turn network on | Header "Synced" within seconds | the offline attempt appears once. Repeat reconnect: still once |
| 15 | Profile > Display name, change and Save | "Name saved." Header and dashboard update | `profiles.display_name` changed |
| 16 | Profile > Display name, empty or 61+ characters | Red error, nothing saved | no change |
| 17 | Profile > Change password (7 chars) | "Use at least 8 characters." | no change |
| 18 | Profile > Change password (8+ chars) | "Password updated." | auth updated |
| 19 | Profile > Sync now | Last sync time updates | none |
| 20 | Profile > Reset my progress > confirm | "Your progress was deleted." Dashboard shows 0% | A's attempts, answers, results, progress, notes rows gone. B untouched |
| 21 | Log out, log in as B on the same browser | B sees none of A's progress | none |
| 22 | As B (learner) open `/admin` by URL | Redirected to dashboard | none |
| 23 | As admin, Profile > View all learners | Cards with attempts and lessons per learner | none |
| 24 | On two devices as the same user, finish a quiz on device 1 | Device 2 updates within about 2 s | none |
| 25 | Table Editor: look at any table as the anon role (API docs "anon") | Zero rows | RLS enabled on all 10 tables |
