import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Callout } from './ui.jsx';
import PasswordInput from './PasswordInput.jsx';
import { changePassword, fetchProfile, updateMyProfile } from '../services/profile.js';
import { profileFieldsSchema, LIMITS } from '../lib/validation.js';

/** Tracks loading, success and error for one action. */
export function useAction() {
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

export function Result({ state }) {
  if (state.error) return <div className="mt-3"><Callout tone="bad">{state.error}</Callout></div>;
  if (state.ok) return <div className="mt-3"><Callout tone="good">{state.ok}</Callout></div>;
  return null;
}

export function Section({ title, description, children, tone, id }) {
  return (
    <section className={`panel p-5 sm:p-6 ${tone === 'danger' ? 'border-danger/30' : ''}`} aria-labelledby={id}>
      <h2 id={id} className={`font-extrabold text-lg ${tone === 'danger' ? 'text-danger' : 'text-text'}`}>{title}</h2>
      {description && <p className="muted mt-1">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Loading({ label = 'Loading...' }) {
  return <p className="flex items-center gap-2 muted" role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {label}</p>;
}

/** Loads the signed-in user's profile row. Returns { profile, setProfile, loading, error, reload }. */
export function useMyProfile(userId, online) {
  const [state, setState] = useState({ profile: null, loading: true, error: '' });
  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const profile = await fetchProfile(userId);
      setState({ profile, loading: false, error: profile ? '' : 'Your profile was not found.' });
    } catch (e) {
      setState({ profile: null, loading: false, error: e.message || 'Could not load your profile.' });
    }
  };
  useEffect(() => {
    if (online) load();
    else setState({ profile: null, loading: false, error: 'You are offline. Connect to the internet to see and edit your details.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, online]);
  return { ...state, setProfile: (profile) => setState((s) => ({ ...s, profile })), reload: load };
}

function initials(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

/** Identity card at the top of a profile. `facts` is a list of [label, value]. */
export function ProfileHeader({ name, email, badge, facts = [] }) {
  return (
    <section className="panel p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-brand text-brand-contrast grid place-items-center text-2xl font-black shrink-0" aria-hidden="true">
        {initials(name, email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-text truncate">{name || 'Unnamed account'}</h1>
          {badge && <span className="rounded-full bg-brand-soft text-brand px-3 py-1 text-xs font-bold">{badge}</span>}
        </div>
        <p className="text-text-muted break-all">{email}</p>
        {facts.length > 0 && (
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-text-muted">{label}</dt>
                <dd className="font-semibold text-text break-all">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/** Editable contact details. `idLabel` names the school_id field per role (School ID / Staff ID). */
export function DetailsForm({ userId, profile, onSaved, idLabel, online }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || '',
    phone: profile.phone || '',
    address: profile.address || '',
    school_id: profile.school_id || '',
  });
  const [errors, setErrors] = useState({});
  const [state, run] = useAction();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const parsed = profileFieldsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    await run(async () => onSaved(await updateMyProfile(userId, form)), 'Details saved.');
  }

  const field = (key, label, props = {}) => (
    <label className="block text-sm font-medium text-text">
      {label}
      <input
        className={`field ${errors[key] ? 'border-danger' : ''}`}
        value={form[key]}
        onChange={set(key)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${key}-error` : undefined}
        {...props}
      />
      {errors[key] && <span id={`${key}-error`} className="block mt-1 text-danger text-sm">{errors[key]}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      {field('display_name', 'Full name', { maxLength: LIMITS.displayName, autoComplete: 'name' })}
      {field('phone', 'Phone (optional)', { type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '+63 912 345 6789' })}
      <div className="sm:col-span-2">{field('address', 'Address (optional)', { maxLength: LIMITS.addressMax, autoComplete: 'street-address' })}</div>
      {field('school_id', `${idLabel} (optional)`, { maxLength: 40 })}
      <div className="sm:col-span-2">
        <button className="primary" disabled={state.busy || !online}>{state.busy ? 'Saving...' : 'Save details'}</button>
        {!online && <p className="muted mt-2">You are offline. Saving needs internet.</p>}
        <Result state={state} />
      </div>
    </form>
  );
}

export function PasswordSection({ online }) {
  const [password, setPassword] = useState('');
  const [state, run] = useAction();
  async function submit(e) {
    e.preventDefault();
    const ok = await run(() => changePassword(password), 'Password updated.');
    if (ok) setPassword('');
  }
  return (
    <Section id="password" title="Password" description="Use 8 or more characters.">
      <form onSubmit={submit} noValidate>
        <label className="block text-sm font-medium text-text" htmlFor="new-password">New password</label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="primary mt-3" disabled={state.busy || !online || !password}>{state.busy ? 'Updating...' : 'Update password'}</button>
        {!online && <p className="muted mt-2">You are offline. This needs internet.</p>}
        <Result state={state} />
      </form>
    </Section>
  );
}
