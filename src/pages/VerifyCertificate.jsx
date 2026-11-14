import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, CircleAlert, Search, ShieldX } from 'lucide-react';
import { verifyCertificate } from '../services/certificates.js';
import { formatIssued } from '../lib/certificateRules.js';

const CODE = /^JDK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

/** Public page (no sign-in): checks a certificate ID and shows what the certificate says. */
export default function VerifyCertificate() {
  const { code: param } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(param || '');
  const [result, setResult] = useState(null);
  const [state, setState] = useState(param ? 'loading' : 'idle');

  useEffect(() => {
    if (!param) { setState('idle'); setResult(null); return; }
    const c = param.toUpperCase();
    setCode(c);
    if (!CODE.test(c)) { setState('done'); setResult({ found: false }); return; }
    setState('loading');
    verifyCertificate(c).then((r) => { setResult(r); setState('done'); }).catch(() => setState('error'));
  }, [param]);

  return (
    <main className="min-h-screen bg-surface px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="text-center">
          <Link to="/" className="font-extrabold text-text">JDK <span className="text-brand">Learning System</span></Link>
          <h1 className="text-3xl font-black text-text mt-4">Check a certificate</h1>
          <p className="text-text-muted mt-2">Enter the certificate ID printed on the certificate, for example JDK-1A2B-3C4D-5E6F.</p>
        </header>
        <form className="panel p-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) navigate(`/verify/${encodeURIComponent(c)}`); }}>
          <label className="sr-only" htmlFor="code">Certificate ID</label>
          <input id="code" className="field mt-0 flex-1 font-mono uppercase" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="JDK-XXXX-XXXX-XXXX" />
          <button className="primary"><Search size={16} aria-hidden="true" /> Check</button>
        </form>

        {state === 'loading' && <p className="text-center text-text-muted" role="status">Checking...</p>}
        {state === 'error' && <p role="alert" className="panel p-5 text-danger">The check could not be done. Check your connection and try again.</p>}
        {state === 'done' && result && (
          !result.found ? (
            <section className="panel p-6 text-center" role="status">
              <CircleAlert size={40} className="mx-auto text-warning" aria-hidden="true" />
              <p className="text-xl font-black text-text mt-3">No certificate has this ID</p>
              <p className="text-text-muted mt-1">Check that it was typed exactly as printed.</p>
            </section>
          ) : (
            <section className={`panel p-6 text-center ${result.valid ? 'border-success/40' : 'border-danger/40'}`} role="status">
              {result.valid ? <BadgeCheck size={44} className="mx-auto text-success" aria-hidden="true" /> : <ShieldX size={44} className="mx-auto text-danger" aria-hidden="true" />}
              <p className={`text-xl font-black mt-3 ${result.valid ? 'text-success' : 'text-danger'}`}>{result.valid ? 'Valid certificate' : 'This certificate was revoked'}</p>
              <dl className="mt-5 text-left grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-text-muted">Awarded to</dt><dd className="font-bold text-text">{result.student_name}</dd>
                <dt className="text-text-muted">Course</dt><dd className="font-bold text-text">{result.course_title}</dd>
                <dt className="text-text-muted">Issued</dt><dd className="text-text">{formatIssued(result.issued_at)}</dd>
                {result.instructor_name && <><dt className="text-text-muted">Instructor</dt><dd className="text-text">{result.instructor_name}</dd></>}
                {result.revoked_at && <><dt className="text-text-muted">Revoked</dt><dd className="text-danger">{formatIssued(result.revoked_at)}</dd></>}
                <dt className="text-text-muted">ID</dt><dd className="font-mono text-text">{result.code}</dd>
              </dl>
            </section>
          )
        )}
      </div>
    </main>
  );
}
