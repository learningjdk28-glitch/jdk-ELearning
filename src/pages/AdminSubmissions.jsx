import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Save } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { assignmentRoster, getAssignmentAdmin, gradeSubmission, openSubmissionFile } from '../services/assignments.js';
import { formatBytes } from '../lib/submissionRules.js';
import { Notice, panel } from '../components/AdminUI.jsx';

const FILTERS = [
  ['all', 'All'],
  ['to-grade', 'To grade'],
  ['late', 'Late'],
  ['missing', 'Missing'],
];

/** Every enrolled student for one assignment: missing, on time, late, graded — and grading. */
export default function AdminSubmissions() {
  const { assignmentId } = useParams();
  const { data, loading, error, reload, setData } = useLoad(async () => {
    const [assignment, roster] = await Promise.all([getAssignmentAdmin(assignmentId), assignmentRoster(assignmentId)]);
    return { assignment, roster };
  }, [assignmentId]);
  const [filter, setFilter] = useState('all');
  const [info, setInfo] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    return data.roster.filter((r) => filter === 'all' || (filter === 'missing' && !r.submission_id) || (filter === 'late' && r.is_late)
      || (filter === 'to-grade' && r.submission_id && r.score == null));
  }, [data, filter]);
  const counts = useMemo(() => {
    const r = data?.roster || [];
    return { all: r.length, 'to-grade': r.filter((x) => x.submission_id && x.score == null).length, late: r.filter((x) => x.is_late).length, missing: r.filter((x) => !x.submission_id).length };
  }, [data]);

  const back = <Link to="/admin/assignments" className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Assignments</Link>;
  if (loading) return <div className="space-y-4">{back}<p className="muted" role="status">Loading submissions...</p></div>;
  if (error) return <div className="space-y-4">{back}<Notice error={error.message} /><button className="secondary" onClick={reload}>Try again</button></div>;
  if (!data.assignment) return <div className="space-y-4">{back}<Notice error="Assignment not found." /></div>;
  const a = data.assignment;

  return (
    <div className="space-y-5 pb-12">
      {back}
      <header>
        <h1 className="text-3xl font-black text-text">{a.title}</h1>
        <p className="text-text-muted mt-1">Due {new Date(a.due_at).toLocaleString()} · {a.max_points} points · {a.allow_late ? 'late work accepted' : 'no late work'}</p>
      </header>
      <Notice info={info} />
      <div role="tablist" aria-label="Filter submissions" className="flex flex-wrap gap-2">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold border ${filter === id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface-raised text-text border-border'}`}>
            {label} ({counts[id]})
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className={`${panel} p-6 text-text-muted`}>{data.roster.length === 0 ? 'No students are enrolled in this course yet.' : 'Nobody in this list.'}</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <Row key={r.user_id} row={r} maxPoints={a.max_points}
              onGraded={(score, feedback) => {
                setInfo(`Grade saved for ${r.student_name || r.student_email}.`);
                setData((d) => ({ ...d, roster: d.roster.map((x) => (x.user_id === r.user_id ? { ...x, score, feedback } : x)) }));
              }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ row, maxPoints, onGraded }) {
  const [score, setScore] = useState(row.score ?? '');
  const [feedback, setFeedback] = useState(row.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const badge = !row.submission_id ? ['Missing', 'bg-danger/10 text-danger']
    : row.score != null ? [`Graded ${Number(row.score)}/${maxPoints}`, 'bg-success/10 text-success']
    : row.is_late ? ['Late', 'bg-warning/10 text-warning'] : ['On time', 'bg-success/10 text-success'];

  async function save(e) {
    e.preventDefault();
    if (score !== '' && (Number(score) < 0 || Number(score) > maxPoints)) { setError(`Score must be between 0 and ${maxPoints}.`); return; }
    setBusy(true); setError('');
    try { await gradeSubmission(row.submission_id, score, feedback); onGraded(score === '' ? null : Number(score), feedback.trim() || null); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <li className={`${panel} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-text">{row.student_name || 'Unnamed student'}</p>
          <p className="text-sm text-text-muted break-all">{row.student_email}{row.student_number ? ` · ${row.student_number}` : ''}</p>
          {row.submitted_at && <p className="text-sm text-text-muted">Handed in {new Date(row.submitted_at).toLocaleString()}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge[1]}`}>{badge[0]}</span>
      </div>
      {row.submission_id && (
        <>
          <div className="mt-3">
            {row.kind === 'link' && <a className="secondary break-all" href={row.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Open link</a>}
            {row.kind === 'file' && <button className="secondary" onClick={() => openSubmissionFile(row.file_path).catch((e) => setError(e.message))}><FileText size={16} aria-hidden="true" /> {row.file_name} ({formatBytes(Number(row.file_size))})</button>}
            {row.kind === 'text' && <p className="rounded-xl bg-surface-muted p-4 text-text whitespace-pre-line max-h-64 overflow-y-auto">{row.body}</p>}
          </div>
          <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto] items-end" noValidate>
            <label className="text-sm font-semibold text-text">Score / {maxPoints}
              <input className="field" type="number" min={0} max={maxPoints} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />
            </label>
            <label className="text-sm font-semibold text-text">Feedback (optional)
              <input className="field" maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </label>
            <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> {busy ? 'Saving...' : 'Save grade'}</button>
          </form>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-danger text-sm">{error}</p>}
    </li>
  );
}
