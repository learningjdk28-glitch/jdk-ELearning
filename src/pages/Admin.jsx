import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, RefreshCw } from 'lucide-react';
import { learnerOverview } from '../services/admin.js';
import { BackHeader, Callout } from '../components/ui.jsx';

const fmt = (d) => (d ? new Date(d).toLocaleString() : 'No activity');

export default function Admin() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await learnerOverview());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (rows || []).filter((r) => (r.display_name || '').toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <BackHeader
        title="Learners (admin)"
        to="/dashboard"
        right={
          <button className="secondary !min-h-[44px]" onClick={load} disabled={loading} aria-label="Refresh learners">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        }
      />
      <Link to="/admin/content" className="secondary mb-4 mr-3">Manage courses & materials</Link>
      <Link to="/admin/analytics" className="secondary mb-4">
        <Bot size={18} aria-hidden="true" /> Open the analytics assistant
      </Link>
      <label className="block text-sm font-medium mb-4">
        Search by name
        <input className="field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a learner..." />
      </label>

      {error && <Callout tone="bad">{error}</Callout>}
      {loading && !rows && <p className="muted" role="status">Loading learners...</p>}
      {rows && shown.length === 0 && !error && <p className="muted">{rows.length === 0 ? 'No learners yet.' : 'No learner matches that name.'}</p>}

      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.user_id} className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold text-lg">{r.display_name || 'Unnamed learner'}</p>
              <span className={`text-xs font-bold rounded-full px-3 py-1 ${r.role === 'admin' ? 'bg-violet-100 text-violet-800' : 'bg-indigo-100 text-indigo-800'}`}>{r.role}</span>
            </div>
            <dl className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div className="rounded-2xl bg-indigo-50 p-3"><dt className="muted">Attempts</dt><dd className="font-extrabold text-xl">{r.attempts}</dd></div>
              <div className="rounded-2xl bg-indigo-50 p-3"><dt className="muted">Lessons done</dt><dd className="font-extrabold text-xl">{r.lessons_completed}</dd></div>
              <div className="rounded-2xl bg-indigo-50 p-3"><dt className="muted">Joined</dt><dd className="font-bold text-sm mt-1">{new Date(r.joined_at).toLocaleDateString()}</dd></div>
            </dl>
            <p className="muted mt-3">Last activity: {fmt(r.last_activity)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
