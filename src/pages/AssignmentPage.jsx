import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CloudOff, ExternalLink, FileText, Send, Upload } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import useOnSynced from '../hooks/useOnSynced.js';
import { newClientId } from '../services/offline.js';
import { getAssignment, handIn, openSubmissionFile } from '../services/assignments.js';
import { ACCEPT_ATTR, SUBMISSION_KINDS, dueLabel, fileError, formatBytes, linkError, submissionStatus, textError } from '../lib/submissionRules.js';
import PageBody from '../components/learn/PageBody.jsx';
import { StatusBadge, formatDue } from '../components/learn/AssignmentList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** One assignment: instructions, deadline, status, grade, and the hand-in form. */
export default function AssignmentPage() {
  const { courseId, assignmentId } = useParams();
  const { data, loading, error, reload, setData } = useLoad(() => getAssignment(courseId, assignmentId), [courseId, assignmentId]);
  useOnSynced((item) => item.kind === 'submission' && item.payload.assignmentId === assignmentId, () => reload());
  const back = <Link to={`/learn/${encodeURIComponent(courseId)}`} className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Course</Link>;

  if (loading) return <LoadingState label="Loading assignment..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="max-w-3xl mx-auto space-y-4">{back}<EmptyState title="Assignment not available">It may be unpublished, or you may not be enrolled in this course.</EmptyState></div>;

  const sub = data.submission;
  const status = submissionStatus(data, sub);
  const pastDue = new Date() > new Date(data.due_at);
  const canHandIn = sub?.score == null && (!pastDue || data.allow_late);

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-5">
      {back}
      <header className="panel p-6">
        <p className="text-sm font-bold uppercase tracking-wider text-text-muted">Assignment · {data.max_points} points</p>
        <h1 className="text-2xl sm:text-3xl font-black text-text mt-1">{data.title}</h1>
        <p className="mt-3 text-text"><span className="font-semibold">Due:</span> {formatDue(data.due_at)} <span className="text-text-muted">({dueLabel(data.due_at)})</span></p>
        <div className="mt-3"><StatusBadge status={status} /></div>
        {data.instructions && <div className="mt-5 border-t border-border pt-5"><PageBody kind="article" content={data.instructions} glossary={[]} /></div>}
      </header>

      {sub?.score != null && (
        <section className="panel p-6 border-success/30" aria-labelledby="grade">
          <h2 id="grade" className="font-black text-lg text-text">Your grade</h2>
          <p className="text-4xl font-black text-success mt-1 tabular-nums">{Number(sub.score)} <span className="text-lg text-text-muted">/ {data.max_points}</span></p>
          {sub.feedback && <p className="mt-3 text-text whitespace-pre-line"><span className="font-semibold">Feedback:</span> {sub.feedback}</p>}
        </section>
      )}

      {sub && <Submitted sub={sub} />}

      {data.pending ? (
        <section className="panel p-5 border-warning/40" role="status">
          <p className="flex items-center gap-2 font-bold text-text"><CloudOff size={18} className="text-warning" aria-hidden="true" /> Handed in on this device — will be sent when you reconnect</p>
          <p className="text-sm text-text-muted mt-1">It is sent automatically when you are online. The deadline is checked when it reaches the server.</p>
        </section>
      ) : canHandIn ? (
        <HandInForm assignment={data} existing={sub} pastDue={pastDue}
          onDone={(saved) => setData((d) => (saved.queued ? { ...d, pending: { createdAt: new Date().toISOString() } } : { ...d, submission: saved }))} />
      ) : !sub && (
        <p className="panel p-5 text-danger" role="status">The deadline has passed and this assignment no longer accepts work.</p>
      )}
    </div>
  );
}

function Submitted({ sub }) {
  const [error, setError] = useState('');
  return (
    <section className="panel p-5" aria-labelledby="your-work">
      <h2 id="your-work" className="font-black text-lg text-text">What you handed in</h2>
      <p className="text-sm text-text-muted mt-1">
        {new Date(sub.submitted_at).toLocaleString()} · <span className={sub.is_late ? 'text-warning font-semibold' : 'text-success font-semibold'}>{sub.is_late ? 'Late' : 'On time'}</span>
      </p>
      <div className="mt-3">
        {sub.kind === 'link' && <a className="secondary break-all" href={sub.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> {sub.link_url}</a>}
        {sub.kind === 'file' && (
          <button className="secondary" onClick={() => openSubmissionFile(sub.file_path).catch((e) => setError(e.message))}>
            <FileText size={16} aria-hidden="true" /> {sub.file_name} ({formatBytes(sub.file_size)})
          </button>
        )}
        {sub.kind === 'text' && <p className="rounded-xl bg-surface-muted p-4 text-text whitespace-pre-line">{sub.body}</p>}
      </div>
      {error && <p role="alert" className="mt-2 text-danger text-sm">{error}</p>}
    </section>
  );
}

function HandInForm({ assignment, existing, pastDue, onDone }) {
  const kinds = SUBMISSION_KINDS.filter((k) => assignment.submission_types.includes(k.id));
  const [kind, setKind] = useState(kinds[0].id);
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const current = kinds.find((k) => k.id === kind);

  function pickFile(f) {
    setFile(f || null);
    setProblem(f ? fileError(f) : '');
  }

  async function submit(e) {
    e.preventDefault();
    setDone('');
    const check = kind === 'link' ? linkError(url) : kind === 'text' ? textError(body) : fileError(file);
    setProblem(check);
    if (check) return;
    if (existing && !window.confirm('Replace what you handed in before?')) return;
    setBusy(true);
    try {
      const saved = await handIn(assignment, kind, { url, body, file }, existing, newClientId());
      onDone(saved);
      setUrl(''); setBody(''); setFile(null);
      if (saved.queued) return;
      setDone(saved.is_late ? 'Handed in. It was after the deadline, so it is marked late.' : 'Handed in on time.');
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel p-5 sm:p-6 space-y-4" noValidate aria-labelledby="hand-in">
      <h2 id="hand-in" className="font-black text-lg text-text">{existing ? 'Replace your work' : 'Hand in your work'}</h2>
      {pastDue && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/30 p-3 text-text">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" aria-hidden="true" /> The deadline has passed. If you hand in now, it will be marked late.
        </p>
      )}
      {kinds.length > 1 && (
        <div role="radiogroup" aria-label="How do you want to hand in?" className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <label key={k.id} className={`cursor-pointer rounded-xl border px-4 py-2 font-semibold ${kind === k.id ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-muted'}`}>
              <input type="radio" className="sr-only" name="kind" checked={kind === k.id} onChange={() => { setKind(k.id); setProblem(''); }} />
              {k.label}
            </label>
          ))}
        </div>
      )}
      <p className="text-sm text-text-muted">{current.hint}</p>

      {kind === 'link' && (
        <label className="block text-sm font-semibold text-text">Link
          <input className="field" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}
      {kind === 'text' && (
        <label className="block text-sm font-semibold text-text">Your answer
          <textarea className="field min-h-40 font-normal" maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
      )}
      {kind === 'file' && (
        <label className="block rounded-2xl border-2 border-dashed border-border bg-surface-muted p-5 text-center cursor-pointer hover:border-brand/50">
          <Upload size={26} className="mx-auto text-brand" aria-hidden="true" />
          <span className="block font-bold text-brand mt-2">{file ? file.name : 'Choose a file'}</span>
          {file && <span className="block text-sm text-text-muted">{formatBytes(file.size)}</span>}
          <input className="sr-only" type="file" accept={ACCEPT_ATTR} onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
      )}

      {problem && <p role="alert" className="rounded-xl bg-danger/10 border border-danger/30 text-danger p-3">{problem}</p>}
      {done && <p role="status" className="rounded-xl bg-success/10 border border-success/30 text-success p-3">{done}</p>}
      <button className="primary" disabled={busy || (kind === 'file' && (!file || Boolean(fileError(file))))}>
        <Send size={16} aria-hidden="true" /> {busy ? (kind === 'file' ? 'Uploading...' : 'Handing in...') : existing ? 'Replace' : 'Hand in'}
      </button>
    </form>
  );
}
