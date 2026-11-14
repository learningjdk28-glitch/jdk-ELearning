import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Award, BookOpen, ChartColumn, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useOnline from '../hooks/useOnline.js';
import { useOutbox } from '../components/SyncStatus.jsx';
import { flush } from '../services/offline.js';
import { outboxSummary } from '../lib/offlineRules.js';
import { listCourses, myEnrollments } from '../services/lms.js';
import { Callout } from '../components/ui.jsx';
import { AppearanceSection, DetailsForm, Loading, PasswordSection, ProfileHeader, Section, useMyProfile } from '../components/ProfileSections.jsx';

/** Student profile: identity, contact details, enrolled courses, sync and account. */
export default function Profile() {
  const { user, isAdmin, setDisplayName } = useAuth();
  if (isAdmin) return <Navigate to="/admin/profile" replace />;
  return <StudentProfile user={user} setDisplayName={setDisplayName} />;
}

function StudentProfile({ user, setDisplayName }) {
  const online = useOnline();
  const outbox = useOutbox();
  const { pending, failed } = outboxSummary(outbox);
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
          <div className="flex flex-wrap gap-3">
            <Link to="/progress" className="secondary"><ChartColumn size={17} aria-hidden="true" /> My progress</Link>
            <Link to="/certificates" className="secondary"><Award size={17} aria-hidden="true" /> My certificates</Link>
          </div>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="sync" title="Offline and sync" description="Work you do offline is saved on this device and sent when you reconnect.">
          <p className="font-semibold text-text">
            {!online ? 'Offline' : pending ? 'Sending...' : 'Up to date'}
            {' '}&middot; {pending} item{pending === 1 ? '' : 's'} waiting{failed ? ` · ${failed} not accepted` : ''}
          </p>
          <p className="muted mt-1">{failed ? 'Open the sync status at the top of the page to retry or discard items that were not accepted.' : 'Courses you saved for offline use stay on this device.'}</p>
          <button className="secondary mt-3" onClick={() => flush()} disabled={!online || pending === 0}>
            <RefreshCw size={16} aria-hidden="true" /> Send now
          </button>
        </Section>
        <PasswordSection online={online} />
      </div>

      {p && <AppearanceSection key={p.id} userId={user.id} profile={p} online={online} onSaved={me.setProfile} />}

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
