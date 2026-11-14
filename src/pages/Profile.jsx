import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Award, BookOpen, ChartColumn, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { resetMyProgress } from '../services/profile.js';
import { listCourses, myEnrollments } from '../services/lms.js';
import { Callout } from '../components/ui.jsx';
import { DetailsForm, Loading, PasswordSection, ProfileHeader, Result, Section, useAction, useMyProfile } from '../components/ProfileSections.jsx';

/** Student profile: identity, contact details, enrolled courses, learning settings, sync and account. */
export default function Profile() {
  const { user, isAdmin, setDisplayName } = useAuth();
  if (isAdmin) return <Navigate to="/admin/profile" replace />;
  return <StudentProfile user={user} setDisplayName={setDisplayName} />;
}

function StudentProfile({ user, setDisplayName }) {
  const { mode, sync, online, runSync } = useLearner();
  const me = useMyProfile(user.id, online);
  const p = me.profile;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      <ProfileHeader
        name={p?.display_name || user.name}
        email={user.email}
        badge="Student"
        facts={[
          ['Student number', p?.student_number],
          ['School ID', p?.school_id],
          ['Joined', p ? new Date(p.created_at).toLocaleDateString() : null],
        ]}
      />

      <Section id="details" title="My details" description="Your instructors see these details. Your email is your sign-in and cannot be changed here.">
        {me.loading && <Loading label="Loading your details..." />}
        {me.error && <Callout tone={online ? 'bad' : 'warn'}>{me.error}{online && <button className="secondary mt-3" onClick={me.reload}>Try again</button>}</Callout>}
        {p && (
          <DetailsForm
            userId={user.id}
            profile={p}
            idLabel="School ID"
            online={online}
            onSaved={(saved) => { me.setProfile(saved); setDisplayName(saved.display_name); }}
          />
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <MyCourses online={online} />
        <Section id="learning" title="My learning">
          <dl className="space-y-1">
            <dt className="muted">Learning mode</dt>
            <dd className="font-semibold text-text">{mode} <Link to="/modes" className="text-brand underline ml-2 text-sm font-medium">Change</Link></dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/progress" className="secondary"><ChartColumn size={17} aria-hidden="true" /> My progress</Link>
            <Link to="/certificates" className="secondary"><Award size={17} aria-hidden="true" /> My certificates</Link>
          </div>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="sync" title="Offline and sync" description="Work you do offline is saved on this device and sent when you reconnect.">
          <p className="font-semibold text-text">
            {!online ? 'Offline' : sync.state === 'syncing' ? 'Syncing...' : sync.state === 'error' ? 'Problem syncing' : sync.lastAt ? 'Up to date' : 'Not synced yet'}
            {' '}&middot; {sync.pending} change{sync.pending === 1 ? '' : 's'} waiting
          </p>
          {sync.lastAt && <p className="muted">Last sync: {new Date(sync.lastAt).toLocaleString()}</p>}
          {sync.state === 'error' && <div className="mt-2"><Callout tone="bad">{sync.message}</Callout></div>}
          <button className="secondary mt-3" onClick={runSync} disabled={!online || sync.state === 'syncing'}>
            <RefreshCw size={16} aria-hidden="true" /> Sync now
          </button>
        </Section>
        <PasswordSection online={online} />
      </div>

      <ResetProgress userId={user.id} online={online} />
    </div>
  );
}

function MyCourses({ online }) {
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const load = async () => {
    setState({ loading: true, error: '', rows: [] });
    try {
      const [courses, enrollments] = await Promise.all([listCourses(), myEnrollments()]);
      const byId = new Map(courses.map((c) => [c.id, c]));
      const rows = enrollments.map((e) => ({ ...e, course: byId.get(e.course_id) })).filter((r) => r.course);
      setState({ loading: false, error: '', rows });
    } catch (e) {
      setState({ loading: false, error: e.message || 'Could not load your courses.', rows: [] });
    }
  };
  useEffect(() => {
    if (online) load();
    else setState({ loading: false, error: 'Connect to the internet to see your enrolled courses.', rows: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <Section id="courses" title="My courses">
      {state.loading && <Loading label="Loading your courses..." />}
      {state.error && <Callout tone={online ? 'bad' : 'warn'}>{state.error}</Callout>}
      {!state.loading && !state.error && state.rows.length === 0 && (
        <div>
          <p className="muted">You are not enrolled in any course yet.</p>
          <Link to="/catalog" className="primary mt-3"><BookOpen size={17} aria-hidden="true" /> Explore courses</Link>
        </div>
      )}
      {state.rows.length > 0 && (
        <ul className="divide-y divide-border">
          {state.rows.map((r) => (
            <li key={r.course_id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
              {r.status === 'active'
                ? <Link to={`/learn/${r.course_id}`} className="font-semibold text-text hover:text-brand truncate">{r.course.title}</Link>
                : <span className="font-semibold text-text-muted truncate">{r.course.title}</span>}
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${r.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                {r.status === 'active' ? 'Enrolled' : 'Access removed'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ResetProgress({ userId, online }) {
  const [confirm, setConfirm] = useState(false);
  const [state, run] = useAction();
  async function doReset() {
    const ok = await run(() => resetMyProgress(userId), 'Your progress was deleted.');
    setConfirm(false);
    if (ok) setTimeout(() => window.location.assign('/dashboard'), 800);
  }
  return (
    <Section id="reset" tone="danger" title="Reset my progress"
      description="Deletes your assessments, scores, lesson progress and notes from this device and from your account. This cannot be undone.">
      {!confirm ? (
        <button className="secondary !border-danger/40 !text-danger" onClick={() => setConfirm(true)} disabled={!online}>Reset my progress</button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button className="primary !bg-danger" onClick={doReset} disabled={state.busy}>{state.busy ? 'Deleting...' : 'Yes, delete everything'}</button>
          <button className="secondary" onClick={() => setConfirm(false)} disabled={state.busy}>Cancel</button>
        </div>
      )}
      {!online && <p className="muted mt-2">You are offline. This needs internet.</p>}
      <Result state={state} />
    </Section>
  );
}
