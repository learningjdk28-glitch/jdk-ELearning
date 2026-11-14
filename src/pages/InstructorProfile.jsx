import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Layers, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useOnline from '../hooks/useOnline.js';
import { adminSummary, courseMetrics, listManagedCourses } from '../services/lms.js';
import { addAdminEmail, listAdminEmails, removeAdminEmail } from '../services/profile.js';
import { Callout } from '../components/ui.jsx';
import { Metric, Status } from '../components/AdminUI.jsx';
import { DetailsForm, Loading, PasswordSection, ProfileHeader, Result, Section, useAction, useMyProfile } from '../components/ProfileSections.jsx';

/** Instructor profile: identity, contact details, what they teach, and (super administrator) who may teach. */
export default function InstructorProfile() {
  const { user, isSuperAdmin, setDisplayName } = useAuth();
  const online = useOnline();
  const me = useMyProfile(user.id, online);
  const teaching = useTeaching(online);
  const p = me.profile;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      <ProfileHeader
        name={p?.display_name || user.name}
        email={user.email}
        badge={isSuperAdmin ? 'Super administrator' : 'Instructor'}
        facts={[
          ['Staff ID', p?.school_id],
          ['Courses I own', teaching.data ? String(teaching.data.courses.length) : null],
          ['Joined', p ? new Date(p.created_at).toLocaleDateString() : null],
        ]}
      />

      <Section id="details" title="My details" description="Only you and the super administrator can see these details. Your email is your sign-in and cannot be changed here.">
        {me.loading && <Loading label="Loading your details..." />}
        {me.error && <Callout tone={online ? 'bad' : 'warn'}>{me.error}{online && <button className="secondary mt-3" onClick={me.reload}>Try again</button>}</Callout>}
        {p && (
          <DetailsForm
            userId={user.id}
            profile={p}
            idLabel="Staff ID"
            online={online}
            onSaved={(saved) => { me.setProfile(saved); setDisplayName(saved.display_name); }}
          />
        )}
      </Section>

      <MyTeaching teaching={teaching} isSuperAdmin={isSuperAdmin} />

      <div className="grid gap-5 lg:grid-cols-2">
        {isSuperAdmin && <AdminAccess online={online} />}
        <PasswordSection online={online} />
      </div>
    </div>
  );
}

/** Courses this instructor manages, with enrollment counts, plus their summary numbers. */
function useTeaching(online) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const load = async () => {
    setState({ loading: true, error: '', data: null });
    try {
      const [courses, metrics, summary] = await Promise.all([listManagedCourses(), courseMetrics(), adminSummary()]);
      const enrolled = new Map(metrics.map((m) => [m.course_id, Number(m.enrollments)]));
      setState({ loading: false, error: '', data: { courses: courses.map((c) => ({ ...c, enrollments: enrolled.get(c.id) ?? 0 })), summary } });
    } catch (e) {
      setState({ loading: false, error: e.message || 'Could not load your courses.', data: null });
    }
  };
  useEffect(() => {
    if (online) load();
    else setState({ loading: false, error: 'Connect to the internet to see your courses.', data: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  return { ...state, reload: load };
}

function MyTeaching({ teaching, isSuperAdmin }) {
  const { loading, error, data } = teaching;
  return (
    <Section id="teaching" title={isSuperAdmin ? 'All courses' : 'My teaching'}
      description={isSuperAdmin ? 'As super administrator you can manage every course, including unassigned ones.' : 'Courses you own and the students enrolled in them.'}>
      {loading && <Loading label="Loading your courses..." />}
      {error && <Callout tone="bad">{error}<button className="secondary mt-3" onClick={teaching.reload}>Try again</button></Callout>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric icon={BookOpen} label="Courses" value={data.summary.courses} hint={`${data.summary.published_courses} published`} />
            <Metric icon={Users} label={isSuperAdmin ? 'Registered students' : 'My students'} value={data.summary.students} />
            <Metric icon={Layers} label="Active enrollments" value={data.summary.enrollments} />
          </div>
          {data.courses.length === 0 ? (
            <div className="mt-5">
              <p className="muted">You do not own any courses yet.</p>
              <Link to="/admin/courses" className="primary mt-3"><Plus size={17} aria-hidden="true" /> Create a course</Link>
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border">
              {data.courses.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text truncate">{c.title}</p>
                    <p className="muted">{c.enrollments} student{c.enrollments === 1 ? '' : 's'} enrolled{!c.owner_id ? ' · unassigned' : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Status value={c.published} />
                    <Link to="/admin/content" className="secondary text-sm">Manage content</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

/** Super administrator only: emails that become instructors when they register. */
function AdminAccess({ online }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [state, run] = useAction();
  const load = async () => {
    setLoadError('');
    try { setRows(await listAdminEmails()); } catch (e) { setLoadError(e.message); setRows([]); }
  };
  useEffect(() => { if (online) load(); else setLoadError('Connect to the internet to manage instructor access.'); }, [online]);

  async function add(e) {
    e.preventDefault();
    const ok = await run(async () => { await addAdminEmail(email); await load(); }, 'Added. That person becomes an instructor when they register (or right away, if they already have an account).');
    if (ok) setEmail('');
  }
  async function remove(value) {
    if (!window.confirm(`Remove ${value} from the instructor list? Anyone already registered keeps their current role; change it on the Students page.`)) return;
    await run(async () => { await removeAdminEmail(value); await load(); }, 'Removed from the list.');
  }

  return (
    <Section id="admin-access" title="Instructor access" description="Only emails on this list can register as instructors. Visible to you as super administrator only.">
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-3" noValidate>
        <label className="sr-only" htmlFor="admin-email">Instructor email</label>
        <input id="admin-email" className="field mt-0 flex-1" type="email" placeholder="teacher@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary" disabled={state.busy || !online || !email.trim()}><ShieldCheck size={17} aria-hidden="true" /> Add</button>
      </form>
      <Result state={state} />
      {loadError && <div className="mt-3"><Callout tone="warn">{loadError}</Callout></div>}
      {rows === null && !loadError && <div className="mt-4"><Loading /></div>}
      {rows && rows.length === 0 && !loadError && <p className="muted mt-4">No emails on the list yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.email} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-text break-all">{r.email}</span>
              <button type="button" className="secondary !text-danger text-sm" onClick={() => remove(r.email)} disabled={state.busy || !online} aria-label={`Remove ${r.email}`}>
                <Trash2 size={15} aria-hidden="true" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
