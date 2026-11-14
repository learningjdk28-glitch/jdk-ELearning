import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { changePassword, resetMyProgress, updateDisplayName } from '../services/profile.js';
import { BackHeader, Callout } from '../components/ui.jsx';

/** Small helper: tracks loading, success and error for one action. */
function useAction() {
  const [state, setState] = useState({ busy: false, ok: '', error: '' });
  const run = async (fn, okMessage) => {
    setState({ busy: true, ok: '', error: '' });
    try {
      await fn();
      setState({ busy: false, ok: okMessage, error: '' });
      return true;
    } catch (e) {
      setState({ busy: false, ok: '', error: e.message || 'Something went wrong.' });
      return false;
    }
  };
  return [state, run];
}

function Result({ state }) {
  if (state.error) return <div className="mt-3"><Callout tone="bad">{state.error}</Callout></div>;
  if (state.ok) return <div className="mt-3"><Callout tone="good">{state.ok}</Callout></div>;
  return null;
}

export default function Profile() {
  const { user, offlineSession, setDisplayName, isAdmin, role } = useAuth();
  const { mode, sync, online, runSync } = useLearner();
  const [name, setName] = useState(user.name || '');
  const [password, setPassword] = useState('');
  const [nameState, runName] = useAction();
  const [pwState, runPw] = useAction();
  const [resetState, runReset] = useAction();
  const [confirmReset, setConfirmReset] = useState(false);

  async function saveName(e) {
    e.preventDefault();
    await runName(async () => {
      const p = await updateDisplayName(user.id, name);
      setDisplayName(p.display_name);
      setName(p.display_name);
    }, 'Name saved.');
  }

  async function savePassword(e) {
    e.preventDefault();
    const ok = await runPw(() => changePassword(password), 'Password updated.');
    if (ok) setPassword('');
  }

  async function doReset() {
    const ok = await runReset(() => resetMyProgress(user.id), 'Your progress was deleted.');
    setConfirmReset(false);
    if (ok) setTimeout(() => window.location.assign('/dashboard'), 800);
  }

  const offlineNote = !online && <p className="muted mt-2">You are offline. This action needs internet.</p>;

  return (
    <div className="w-full space-y-5 lg:space-y-0 lg:columns-2 lg:gap-5 [&>*]:lg:mb-5 [&>*]:break-inside-avoid">
      <div className="lg:[column-span:all]"><BackHeader title="Profile and settings" to="/dashboard" /></div>

      <section className="panel p-5 sm:p-6" aria-labelledby="acct">
        <h2 id="acct" className="font-extrabold text-lg">Account</h2>
        <p className="mt-2 font-semibold break-all">{user.email}</p>
        <p className="muted mt-1">Role: {role}</p>
        {offlineSession && <p className="muted mt-1">Offline session: connect to the internet to refresh your sign-in.</p>}
        <form onSubmit={saveName} className="mt-4" noValidate>
          <label className="block text-sm font-medium">
            Display name
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
          </label>
          <button className="primary mt-3 min-h-[44px]" disabled={nameState.busy || !online}>
            {nameState.busy ? 'Saving...' : 'Save name'}
          </button>
          {offlineNote}
          <Result state={nameState} />
        </form>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="mode">
        <h2 id="mode" className="font-extrabold text-lg">Learning mode</h2>
        <p className="mt-2 font-semibold">
          {mode} <Link to="/modes" className="text-brand underline ml-2 text-sm font-medium">Change</Link>
        </p>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="sync">
        <h2 id="sync" className="font-extrabold text-lg">Cloud sync</h2>
        <p className="mt-2 font-semibold">
          {!online ? 'Offline' : sync.state === 'syncing' ? 'Syncing...' : sync.state === 'error' ? 'Problem' : sync.lastAt ? 'Up to date' : 'Not synced yet'}
          {' '}&middot; {sync.pending} change{sync.pending === 1 ? '' : 's'} waiting
        </p>
        {sync.lastAt && <p className="muted">Last sync: {new Date(sync.lastAt).toLocaleString()}</p>}
        {sync.state === 'error' && <div className="mt-2"><Callout tone="bad">{sync.message}</Callout></div>}
        <button className="secondary mt-3 min-h-[44px]" onClick={runSync} disabled={!online || sync.state === 'syncing'}>
          <RefreshCw size={16} aria-hidden="true" /> Sync now
        </button>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="pw">
        <h2 id="pw" className="font-extrabold text-lg">Change password</h2>
        <form onSubmit={savePassword} className="mt-3" noValidate>
          <label className="block text-sm font-medium">
            New password (8 or more characters)
            <input className="field" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="primary mt-3 min-h-[44px]" disabled={pwState.busy || !online || !password}>
            {pwState.busy ? 'Updating...' : 'Update password'}
          </button>
          {offlineNote}
          <Result state={pwState} />
        </form>
      </section>

      {isAdmin && (
        <section className="panel p-5 sm:p-6">
          <h2 className="font-extrabold text-lg">Administration</h2>
          <Link to="/admin" className="secondary mt-3 min-h-[44px]"><Users size={18} aria-hidden="true" /> View all learners</Link>
        </section>
      )}

      <section className="panel p-5 sm:p-6 border-red-200" aria-labelledby="reset">
        <h2 id="reset" className="font-extrabold text-lg text-red-800">Reset my progress</h2>
        <p className="muted mt-1">Deletes your assessments, scores, lesson progress and notes from this device and from your account. This cannot be undone.</p>
        {!confirmReset ? (
          <button className="secondary mt-3 min-h-[44px] !border-red-300 !text-red-800" onClick={() => setConfirmReset(true)} disabled={!online}>
            Reset my progress
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="primary !bg-red-700 min-h-[44px]" onClick={doReset} disabled={resetState.busy}>
              {resetState.busy ? 'Deleting...' : 'Yes, delete everything'}
            </button>
            <button className="secondary min-h-[44px]" onClick={() => setConfirmReset(false)} disabled={resetState.busy}>Cancel</button>
          </div>
        )}
        {offlineNote}
        <Result state={resetState} />
      </section>

      <Callout>
        Your progress is stored in this browser under your account, so another account on the same device sees none of
        it. Lesson adaptation uses fixed score rules. It is not a trained AI model.
      </Callout>

    </div>
  );
}
