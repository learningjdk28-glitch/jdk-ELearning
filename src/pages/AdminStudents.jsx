import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, Search, Send, UserRoundPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { listManagedCourses } from '../services/lms.js';
import { cancelInvite, inviteStats, listInvites, queueInvites, runInviteQueue, searchAccounts, sendInvite, setRole } from '../services/accounts.js';
import { INVITE_STATUS, inviteActions, parseInviteList, sendingPlan } from '../lib/inviteRules.js';
import { AdminHeading, Empty, Notice, panel } from '../components/AdminUI.jsx';

const TONE = { success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger', muted: 'bg-surface-muted text-text-muted' };
const Badge = ({ tone, children }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${TONE[tone]}`}>{children}</span>;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Accounts and invitations. Invitations are queued, then sent one by one under the hourly email budget. */
export default function AdminStudents() {
  const { isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'invites' ? 'invites' : 'accounts';
  const [inviteOpen, setInviteOpen] = useState(Boolean(params.get('invite')));
  const [courses, setCourses] = useState([]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const queue = useInviteQueue(refresh);
  const [info, setInfo] = useState('');

  useEffect(() => { listManagedCourses().then(setCourses).catch(() => setCourses([])); }, []);
  const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('invite'); return n; });

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Students & accounts" description="Invite people by email, add them to your courses, and see who has accepted."
        action={<button className="primary" onClick={() => setInviteOpen((v) => !v)}><UserRoundPlus size={17} aria-hidden="true" /> Invite people</button>} />
      <Notice info={info} />
      {inviteOpen && (
        <InviteForm courses={courses} isSuperAdmin={isSuperAdmin} presetCourse={params.get('invite')} onClose={() => setInviteOpen(false)}
          onQueued={(result) => {
            setInviteOpen(false);
            setInfo(`${result.queued} invitation${result.queued === 1 ? '' : 's'} queued.${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`);
            setTab('invites');
            refresh();
            queue.start();
          }} />
      )}
      <QueuePanel queue={queue} version={version} />
      <div role="tablist" aria-label="People" className="flex gap-2">
        {[['accounts', 'Accounts'], ['invites', 'Invitations']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold border ${tab === id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface-raised text-text border-border'}`}>{label}</button>
        ))}
      </div>
      {tab === 'accounts' ? <Accounts /> : <Invitations version={version} refresh={refresh} queue={queue} />}
    </div>
  );
}

/** Runs the send queue while this page is open; resumes by itself when the hourly budget frees up. */
function useInviteQueue(onChange) {
  const [state, setState] = useState({ running: false, done: 0, total: 0, nextAt: null, error: '' });
  const stop = useRef(false);
  const timer = useRef(null);
  const start = useCallback(async () => {
    clearTimeout(timer.current);
    stop.current = false;
    let ids;
    try { ids = (await listInvites('queued', 200)).map((r) => r.id).reverse(); } catch (e) { setState((s) => ({ ...s, error: e.message })); return; }
    if (!ids.length) { setState((s) => ({ ...s, running: false, nextAt: null })); return; }
    setState({ running: true, done: 0, total: ids.length, nextAt: null, error: '' });
    const r = await runInviteQueue(ids, ({ done, total }) => { setState((s) => ({ ...s, done, total })); onChange(); }, () => stop.current);
    setState((s) => ({ ...s, running: false, nextAt: r.nextAt, error: r.error || '' }));
    onChange();
    if (r.nextAt && !stop.current) timer.current = setTimeout(start, Math.max(5000, new Date(r.nextAt) - Date.now() + 5000));
  }, [onChange]);
  useEffect(() => () => { stop.current = true; clearTimeout(timer.current); }, []);
  return { ...state, start, stop: () => { stop.current = true; clearTimeout(timer.current); setState((s) => ({ ...s, running: false, nextAt: null })); } };
}

function QueuePanel({ queue, version }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { inviteStats().then(setStats).catch(() => setStats(null)); }, [version, queue.running]);
  if (!stats) return null;
  const waiting = Number(stats.queued || 0);
  const plan = sendingPlan(stats, waiting);
  if (!waiting && !queue.running && !queue.error && plan.used === 0) return null;
  return (
    <section className={`${panel} p-5 space-y-2`} aria-labelledby="queue-heading" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="queue-heading" className="font-black text-text flex items-center gap-2"><Mail size={18} className="text-brand" aria-hidden="true" /> Invitation emails</h2>
        {queue.running
          ? <button className="secondary text-sm" onClick={queue.stop}>Pause sending</button>
          : waiting > 0 && <button className="primary text-sm" onClick={queue.start} disabled={plan.left === 0}><Send size={14} aria-hidden="true" /> Send {waiting} waiting</button>}
      </div>
      <p className="text-sm text-text">This hour: <strong>{plan.used} of {plan.budget}</strong> emails used · last 24 hours: {stats.sent_today}</p>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-label="Emails used this hour" aria-valuemin={0} aria-valuemax={plan.budget} aria-valuenow={plan.used}>
        <div className={`h-full ${plan.left === 0 ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${Math.min(100, (plan.used / plan.budget) * 100)}%` }} />
      </div>
      {queue.running && <p className="text-sm text-text" role="status">Sending {queue.done} of {queue.total}... Keep this page open.</p>}
      {!queue.running && waiting > 0 && (
        <p className="text-sm text-text-muted">
          {waiting} waiting.{' '}
          {plan.left === 0 || queue.nextAt
            ? `The hourly limit is used up; sending continues${stats.next_slot_at || queue.nextAt ? ` from ${time(queue.nextAt || stats.next_slot_at)}` : ' later'} while this page is open.`
            : 'Press Send to continue.'}
        </p>
      )}
      {plan.dailyWarning && <p className="text-sm text-warning">More than 300 emails in a day can get the Gmail sender blocked. Consider sending the rest tomorrow.</p>}
      {queue.error && <p role="alert" className="text-sm text-danger">{queue.error}</p>}
    </section>
  );
}

function InviteForm({ courses, isSuperAdmin, presetCourse, onClose, onQueued }) {
  const [text, setText] = useState('');
  const [role, setRoleChoice] = useState('learner');
  const [chosen, setChosen] = useState(() => (presetCourse ? [presetCourse] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { rows, problems } = parseInviteList(text);
  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function submit(e) {
    e.preventDefault();
    if (!rows.length) { setError('Add at least one email address.'); return; }
    setBusy(true); setError('');
    try { onQueued(await queueInvites(rows, role, chosen)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black text-lg text-text">Invite people</h2>
        <button type="button" className="secondary" aria-label="Close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <label className="block text-sm font-semibold text-text">Email addresses
        <span className="block font-normal text-text-muted">One person per line: <code>email</code> or <code>Name, email</code>. You can paste a column from a spreadsheet.</span>
        <textarea className="field min-h-32 font-normal" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Maria Santos, maria@example.com\njuan@example.com'} />
      </label>
      <p className="text-sm text-text" role="status">{rows.length} {rows.length === 1 ? 'person' : 'people'} ready{problems.length ? ` · ${problems.length} line${problems.length === 1 ? '' : 's'} skipped` : ''}</p>
      {problems.length > 0 && (
        <ul className="text-sm text-warning list-disc pl-5">
          {problems.slice(0, 5).map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ''}{p.reason}{p.text ? ` (${p.text.slice(0, 60)})` : ''}</li>)}
          {problems.length > 5 && <li>and {problems.length - 5} more</li>}
        </ul>
      )}
      {isSuperAdmin && (
        <fieldset>
          <legend className="text-sm font-semibold text-text">Role</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {[['learner', 'Student'], ['admin', 'Instructor']].map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 text-text"><input type="radio" className="accent-brand w-4 h-4" name="role" checked={role === id} onChange={() => setRoleChoice(id)} /> {label}</label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="text-sm font-semibold text-text">Add to courses {role === 'admin' ? '(optional)' : ''}</legend>
        {courses.length === 0 ? <p className="text-sm text-text-muted mt-1">You have no courses yet. People can still be invited and enrolled later.</p> : (
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-text">
                <input type="checkbox" className="accent-brand w-4 h-4" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /> {c.title}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <p className="text-sm text-text-muted">People who already have an account are added to the courses without an email. New people get an email to set their password.</p>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <button className="primary" disabled={busy || rows.length === 0}><Send size={16} aria-hidden="true" /> {busy ? 'Queueing...' : `Invite ${rows.length || ''}`.trim()}</button>
    </form>
  );
}

function Accounts() {
  const { user, isSuperAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => searchAccounts(query, 20, page * 20).then(setRows).catch((e) => { setError(e.message); setRows([]); }), [query, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const total = Number(rows?.[0]?.total_rows || 0);

  async function changeRole(a) {
    const next = a.role === 'admin' ? 'learner' : 'admin';
    if (!window.confirm(`Make ${a.display_name || a.email} ${next === 'admin' ? 'an instructor' : 'a student'}? This changes what they can see and do.`)) return;
    setBusy(true); setError(''); setInfo('');
    try { await setRole(a.user_id, next); setInfo('Role changed. They see the change the next time they open the app.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <section className={`${panel} overflow-hidden`} aria-label="Accounts">
      <div className="p-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted max-w-xl">{isSuperAdmin ? 'Everyone with an account.' : 'Students in your courses. Search an exact email address to find someone else.'}</p>
        <label className="flex gap-2 items-center rounded-xl border border-border bg-surface-raised px-3">
          <Search size={16} className="text-text-muted" aria-hidden="true" />
          <input className="py-2 text-sm bg-transparent text-text outline-none" aria-label="Search accounts" placeholder="Name, email or student number" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} />
        </label>
      </div>
      <div className="px-5"><Notice error={error} info={info} /></div>
      {rows === null ? <p className="muted p-5" role="status">Loading accounts...</p> : rows.length === 0 ? <p className="p-5 text-text-muted">No matching accounts.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-text-muted">
              <tr><th scope="col" className="p-4">Name / ID</th><th scope="col" className="p-4">Role</th><th scope="col" className="p-4">Courses</th><th scope="col" className="p-4">Joined</th><th scope="col" className="p-4">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.user_id} className="border-t border-border">
                  <td className="p-4">
                    <p className="font-bold text-text">{a.display_name || 'Unnamed'}</p>
                    <p className="text-xs text-text-muted break-all">{a.email}{a.student_number ? ` · ${a.student_number}` : ''}</p>
                  </td>
                  <td className="p-4"><Badge tone={a.role === 'admin' ? 'success' : 'muted'}>{a.role === 'admin' ? 'Instructor' : 'Student'}</Badge></td>
                  <td className="p-4 text-text">{a.active_courses}</td>
                  <td className="p-4 text-text">{day(a.joined_at)}{!a.last_sign_in_at && <span className="block text-xs text-warning">Never signed in</span>}</td>
                  <td className="p-4">
                    {isSuperAdmin
                      ? <button className="secondary text-xs" disabled={busy || a.user_id === user?.id} onClick={() => changeRole(a)}>{a.role === 'admin' ? 'Make student' : 'Make instructor'}</button>
                      : <span className="text-xs text-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="p-4 flex items-center justify-between border-t border-border">
        <span className="text-sm text-text-muted">Page {page + 1} · {total} account{total === 1 ? '' : 's'}</span>
        <div className="flex gap-2">
          <button className="secondary text-xs" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>Previous</button>
          <button className="secondary text-xs" disabled={(page + 1) * 20 >= total} onClick={() => setPage((v) => v + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}

const FILTERS = [['all', 'All'], ['waiting', 'Waiting'], ['sent', 'Not accepted'], ['accepted', 'Accepted'], ['enrolled', 'Added'], ['failed', 'Not sent'], ['cancelled', 'Cancelled']];

function Invitations({ version, refresh, queue }) {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => { listInvites(filter, 100).then(setRows).catch((e) => { setError(e.message); setRows([]); }); }, [filter, version]);

  async function act(id, fn) {
    setBusyId(id); setError('');
    try {
      const r = await fn();
      if (r?.status === 'failed') setError(r.error || 'Not sent.');
      if (r?.status === 'waiting') setError('The hourly email limit is used up. It is sent automatically later while this page is open.');
      refresh();
      if (r?.status === 'waiting') queue.start();
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  }

  return (
    <section className="space-y-3" aria-label="Invitations">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter invitations">
        {FILTERS.map(([id, label]) => (
          <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold border ${filter === id ? 'bg-brand-soft text-brand border-brand/40' : 'bg-surface-raised text-text-muted border-border'}`}>{label}</button>
        ))}
      </div>
      <Notice error={error} />
      {rows === null ? <p className="muted" role="status">Loading invitations...</p> : rows.length === 0 ? <Empty text="No invitations here." /> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const s = INVITE_STATUS[r.status] || INVITE_STATUS.queued;
            const can = inviteActions(r.status);
            return (
              <li key={r.id} className={`${panel} p-4 flex flex-wrap items-start justify-between gap-3`}>
                <div className="min-w-0">
                  <p className="font-bold text-text break-all">{r.display_name ? `${r.display_name} · ` : ''}{r.email}</p>
                  <p className="text-sm text-text-muted">
                    {r.role === 'admin' ? 'Instructor' : 'Student'} · {r.course_titles?.length ? r.course_titles.join(', ') : 'no course'}
                    {' · '}invited {day(r.created_at)}{r.invited_by_name ? ` by ${r.invited_by_name}` : ''}
                    {r.sent_at ? ` · sent ${day(r.sent_at)}` : ''}{r.accepted_at ? ` · signed in ${day(r.accepted_at)}` : ''}
                  </p>
                  {r.last_error && r.status !== 'accepted' && <p className="text-sm text-danger mt-1">{r.last_error}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {can.retry && <button className="secondary text-xs" disabled={busyId === r.id} onClick={() => act(r.id, () => sendInvite(r.id))}><RefreshCw size={12} aria-hidden="true" /> Retry</button>}
                  {can.resend && <button className="secondary text-xs" disabled={busyId === r.id} onClick={() => act(r.id, () => sendInvite(r.id, true))}><Send size={12} aria-hidden="true" /> Resend</button>}
                  {can.cancel && <button className="secondary text-xs !text-danger" disabled={busyId === r.id}
                    onClick={() => { if (window.confirm(`Cancel the invitation for ${r.email}? Their account and course access are not removed.`)) act(r.id, () => cancelInvite(r.id)); }}>Cancel</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
