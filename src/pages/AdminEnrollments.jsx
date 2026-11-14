import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, UserRoundPlus } from 'lucide-react';
import { listManagedCourses, revokeEnrollment, setEnrollment } from '../services/lms.js';
import { courseRoster, searchAccounts } from '../services/accounts.js';
import { AdminHeading, Empty, Notice, panel } from '../components/AdminUI.jsx';

const FILTERS = [
  ['all', 'All', () => true],
  ['invited', 'Not signed in yet', (r) => r.status === 'active' && !r.signed_in],
  ['active', 'Active', (r) => r.status === 'active' && r.signed_in],
  ['revoked', 'Revoked', (r) => r.status === 'revoked'],
];

/** Per course: who is enrolled, who has not signed in yet, how far each student is; revoke or restore access. */
export default function AdminEnrollments() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => { listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); }); }, []);
  const load = useCallback(async () => {
    if (!course) return;
    setRows(null);
    try { setRows(await courseRoster(course)); } catch (e) { setError(e.message); setRows([]); }
  }, [course]);
  useEffect(() => { load(); }, [load]);

  async function run(fn, ok) {
    setBusy(true); setError(''); setInfo('');
    try { await fn(); setInfo(ok); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id, , test]) => [id, (rows || []).filter(test).length])), [rows]);
  const shown = (rows || []).filter(FILTERS.find(([id]) => id === filter)[2]);

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Enrollments" description="Who is in each course, who has not signed in yet, and how far each student has got."
        action={course && <Link className="primary" to={`/admin/students?invite=${encodeURIComponent(course)}`}><UserRoundPlus size={16} aria-hidden="true" /> Invite to this course</Link>} />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 grid gap-4 md:grid-cols-[1fr_auto] items-end`}>
            <label className="font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => { setCourse(e.target.value); setFilter('all'); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <AddExisting course={course} busy={busy} run={run} />
          </div>

          <div role="group" aria-label="Filter students" className="flex flex-wrap gap-2">
            {FILTERS.map(([id, label]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold border ${filter === id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface-raised text-text border-border'}`}>
                {label} ({counts[id] ?? 0})
              </button>
            ))}
          </div>

          {rows === null ? <p className="muted" role="status">Loading students...</p> : shown.length === 0 ? (
            <Empty text={rows.length === 0 ? 'No one is enrolled in this course yet.' : 'Nobody in this list.'} />
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => {
                const pct = Number(r.pages_total) ? Math.round((Number(r.pages_done) / Number(r.pages_total)) * 100) : 0;
                return (
                  <li key={r.user_id} className={`${panel} p-4 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-center`}>
                    <div className="min-w-0">
                      <p className="font-bold text-text">{r.student_name || 'Unnamed student'}</p>
                      <p className="text-xs text-text-muted break-all">{r.student_email}{r.student_number ? ` · ${r.student_number}` : ''}</p>
                      <p className="text-xs text-text-muted mt-1">
                        Enrolled {new Date(r.enrolled_at).toLocaleDateString()} ·{' '}
                        {r.signed_in ? `last signed in ${new Date(r.last_sign_in_at).toLocaleDateString()}` : <span className="text-warning font-semibold">has not signed in yet</span>}
                        {r.last_activity_at ? ` · last page read ${new Date(r.last_activity_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-text-muted"><span>{r.pages_done} of {r.pages_total} pages</span><span>{pct}%</span></div>
                      <div className="mt-1 h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-label={`${r.student_name || r.student_email} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      {r.status === 'active'
                        ? <button className="secondary text-xs !text-danger" disabled={busy}
                            onClick={() => { if (window.confirm(`Remove ${r.student_name || r.student_email} from this course? Their work is kept and access can be restored.`)) run(() => revokeEnrollment(course, r.user_id), 'Access removed.'); }}>Revoke</button>
                        : <button className="secondary text-xs" disabled={busy} onClick={() => run(() => setEnrollment(course, r.user_id), 'Access restored.')}>Restore</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Adds a student who already has an account, by their exact email. No email is sent. */
function AddExisting({ course, busy, run }) {
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState('');
  async function add(e) {
    e.preventDefault();
    setProblem('');
    const match = (await searchAccounts(email, 5).catch(() => [])).find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) { setProblem('No account with this email. Use "Invite to this course" to send an invitation.'); return; }
    if (match.role !== 'learner') { setProblem('This account is an instructor.'); return; }
    await run(() => setEnrollment(course, match.user_id), `${match.display_name || match.email} added to the course.`);
    setEmail('');
  }
  return (
    <form onSubmit={add} className="flex flex-wrap items-end gap-2" noValidate>
      <label className="text-sm font-bold text-text">Add an existing student
        <input className="field" type="email" placeholder="student@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="secondary" disabled={busy || !email.includes('@')}><UserPlus size={16} aria-hidden="true" /> Add</button>
      {problem && <p role="alert" className="w-full text-sm text-danger">{problem}</p>}
    </form>
  );
}
