# JDK Learn upgrade — deployment notes

## Delivered
- Admin course-content studio at `/admin/content` (create modules, publish/unpublish, upload and delete resources).
- Student learning resource browser at `/materials`.
- Supabase migration `supabase_lms_upgrade.sql` with private file storage and admin-only writes.
- Admin pages blocked when running from an offline cached session.

## Required setup
1. Run existing `supabase_setup.sql` in Supabase SQL Editor if not already applied.
2. Run `supabase_lms_upgrade.sql` in the same project.
3. Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point to the same project on all devices; deploy over HTTPS. Never publish service-role keys.
4. Configure Supabase Auth site URL, redirect allowlist and email confirmation/SMTP for your deployed domain.
5. Create admin accounts through Supabase Auth; promote selected users using a trusted SQL admin operation on `profiles`, not a client form. All other signups default to learner/student.
6. Install dependencies with `npm ci` on your target platform and run `npm run build && npm test`.

## Known limitations / follow-up
- New modules are resource collections; they are not yet integrated with the existing hardcoded course lesson renderer or quiz authoring.
- No student account suspension/invitation UI, enrollment approval, course certificates, or graded course builder yet.
- File cleanup when deleting an entire module requires a storage cleanup job (database cascades but storage objects remain).
- Browser cached offline learner identity is not suitable as proof of authorization; all privileged writes require online Supabase RLS.
- The existing UI uses `learner` as the database role name; displayed student terminology can be changed without modifying the role enum.
- Multi-device login relies on Supabase Auth sessions and successful email verification; it was not tested against a live deployment.

## Audit and verification
- Existing 36 Node tests passed in this environment.
- Vite production build could not be completed from the uploaded node_modules: missing native Rollup dependency. Reinstall dependencies on target platform.
