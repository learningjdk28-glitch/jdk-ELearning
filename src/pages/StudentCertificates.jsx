import { useState } from 'react';
import { publicOrigin } from '../lib/native.js';
import { Link } from 'react-router-dom';
import { Award, Copy, Download, ShieldCheck } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { supabase } from '../lib/supabase.js';
import { loadMyLearning } from '../services/learn.js';
import { claimCertificate, downloadCertificate, myCertificates } from '../services/certificates.js';
import { coursePath } from '../lib/learningPath.js';
import { formatIssued, verifyUrl } from '../lib/certificateRules.js';
import { ProgressBar } from '../components/learn/PathList.jsx';
import { ErrorState, LoadingState } from '../components/learn/States.jsx';

async function load() {
  const [learning, certs, designs] = await Promise.all([
    loadMyLearning(),
    myCertificates(),
    supabase.from('certificate_templates').select('course_id').then(({ data, error }) => { if (error) throw new Error(error.message); return data; }),
  ]);
  return { learning, certs, designed: new Set(designs.map((d) => d.course_id)) };
}

/** The student's certificates: download as PDF, share the verification link, claim a finished course. */
export default function StudentCertificates() {
  const { data, loading, error, reload } = useLoad(load, []);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState({ error: '', info: '' });

  if (loading) return <LoadingState label="Loading your certificates..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { learning, certs, designed } = data;

  async function act(id, fn, ok) {
    setBusy(id); setMessage({ error: '', info: '' });
    try { await fn(); setMessage({ error: '', info: ok }); } catch (e) { setMessage({ error: e.message, info: '' }); } finally { setBusy(''); }
  }
  const copy = (code) => act(code, () => navigator.clipboard.writeText(verifyUrl(publicOrigin(), code)), 'Verification link copied.');
  const toClaim = learning.courses.filter(({ course }) => !certs.some((c) => c.course_id === course.id));

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl font-black text-text flex items-center gap-3"><Award className="text-brand" aria-hidden="true" /> My certificates</h1>
        <p className="text-text-muted mt-1">Each certificate has an ID that anyone can check on the <Link className="text-brand underline" to="/verify">verification page</Link>.</p>
      </header>
      {message.error && <p role="alert" className="rounded-xl bg-danger/10 border border-danger/30 text-danger p-3">{message.error}</p>}
      {message.info && <p role="status" className="rounded-xl bg-success/10 border border-success/30 text-success p-3">{message.info}</p>}

      <section aria-labelledby="mine">
        <h2 id="mine" className="text-xl font-black text-text mb-3">Issued</h2>
        {certs.length === 0 ? <p className="panel p-5 text-text-muted">No certificates yet. Finish a course to claim one.</p> : (
          <ul className="space-y-3">
            {certs.map((c) => (
              <li key={c.id} className="panel p-5 flex flex-wrap items-center gap-4">
                <Award size={28} className={c.revoked_at ? 'text-text-muted' : 'text-brand'} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-text">{c.course_title}</p>
                  <p className="text-sm text-text-muted">Issued {formatIssued(c.issued_at)} · <span className="font-mono">{c.code}</span></p>
                  {c.revoked_at && <p className="text-sm text-danger">Revoked on {formatIssued(c.revoked_at)}. Ask your instructor if this is a mistake.</p>}
                </div>
                {!c.revoked_at && (
                  <div className="flex flex-wrap gap-2">
                    <button className="primary text-sm" disabled={busy === c.id} onClick={() => act(c.id, () => downloadCertificate(c), 'Certificate saved.')}>
                      <Download size={16} aria-hidden="true" /> {busy === c.id ? 'Making the PDF...' : 'Download PDF'}
                    </button>
                    <button className="secondary text-sm" disabled={busy === c.code} onClick={() => copy(c.code)}><Copy size={16} aria-hidden="true" /> Copy link</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {toClaim.length > 0 && (
        <section className="panel p-5 sm:p-6" aria-labelledby="claim">
          <h2 id="claim" className="text-xl font-black text-text">Claim a certificate</h2>
          <p className="text-sm text-text-muted mt-1">Read every page and pass every quiz of a course, then claim its certificate here.</p>
          <ul className="mt-4 divide-y divide-border">
            {toClaim.map(({ course, modules, placement }) => {
              const path = coursePath(modules, learning.done, learning.passed, placement);
              const ready = designed.has(course.id);
              return (
                <li key={course.id} className="py-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-bold text-text">{course.title}</p>
                    <div className="mt-2 flex items-center gap-2 max-w-sm"><div className="flex-1"><ProgressBar percent={path.percent} label={`${course.title} progress`} /></div><span className="text-xs text-text-muted tabular-nums">{path.percent}%</span></div>
                    {!ready && <p className="text-xs text-text-muted mt-1">Your instructor has not set up a certificate for this course yet.</p>}
                  </div>
                  <button className="primary text-sm" disabled={!ready || busy === course.id}
                    onClick={() => act(course.id, async () => { await claimCertificate(course.id); await reload(); }, 'Certificate issued. Download it above.')}>
                    <ShieldCheck size={16} aria-hidden="true" /> {busy === course.id ? 'Checking...' : 'Claim certificate'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
