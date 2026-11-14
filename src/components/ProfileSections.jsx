import { useEffect, useState } from 'react';
import { applyAppearance, shownMode } from '../lib/applyTheme.js';
import { BRAND_PRESETS, MIN_TEXT_CONTRAST, SURFACES, THEME_MODES, brandBase, brandShades, channelsToHex, contrast } from '../lib/theme.js';
import { Loader2 } from 'lucide-react';
import { Callout } from './ui.jsx';
import PasswordInput from './PasswordInput.jsx';
import { changePassword, fetchProfile, saveAppearance, updateMyProfile } from '../services/profile.js';
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

/** Light / dark / same as the device, and the brand colour. Changes show at once; Save keeps them on the profile. */
export function AppearanceSection({ userId, profile, online, onSaved }) {
  const saved = { theme: profile?.theme || 'system', brand: profile?.brand_color || null };
  const [pick, setPick] = useState(saved);
  const [state, run] = useAction();
  const dirty = pick.theme !== saved.theme || (pick.brand || null) !== (saved.brand || null);
  const choose = (patch) => { const next = { ...pick, ...patch }; setPick(next); applyAppearance(next); };
  const base = brandBase(pick.brand) || BRAND_PRESETS[0].rgb;
  const shades = { light: brandShades(base, 'light'), dark: brandShades(base, 'dark') };
  const custom = pick.brand && pick.brand.startsWith('#') ? pick.brand : '';

  async function save() {
    const ok = await run(() => saveAppearance(userId, pick), 'Appearance saved. It follows you to every device you sign in on.');
    if (ok) onSaved?.({ ...profile, theme: pick.theme, brand_color: pick.brand || null });
  }
  return (
    <Section id="appearance" title="Appearance" description="How the app looks for you. Text is always kept readable: the brand colour is shaded darker in light mode and lighter in dark mode when needed.">
      <fieldset>
        <legend className="text-sm font-semibold text-text">Theme</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {THEME_MODES.map((m) => (
            <label key={m.id} className={`cursor-pointer rounded-xl border px-4 py-2 font-semibold ${pick.theme === m.id ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-muted'}`}>
              <input type="radio" className="sr-only" name="theme" checked={pick.theme === m.id} onChange={() => choose({ theme: m.id })} /> {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-text">Brand colour</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((p, i) => {
            const on = (pick.brand || BRAND_PRESETS[0].id) === p.id || (!pick.brand && i === 0);
            return (
              <button key={p.id} type="button" aria-pressed={on} aria-label={`${p.label}${i === 0 ? ' (default)' : ''}`} title={p.label}
                onClick={() => choose({ brand: i === 0 ? null : p.id })}
                className={`w-10 h-10 rounded-full border-2 ${on ? 'border-text ring-2 ring-brand' : 'border-surface-raised'}`}
                style={{ backgroundColor: `rgb(${brandShades(p.rgb, shownMode()).brand})` }} />
            );
          })}
          <label className="flex items-center gap-2 text-sm text-text ml-2">Own colour
            <input type="color" className="w-10 h-10 rounded border border-border bg-surface-raised p-0.5" value={custom || channelsToHex(base)} onChange={(e) => choose({ brand: e.target.value })} />
          </label>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Contrast of brand text on cards: light mode {contrast(shades.light.brand, SURFACES.light).toFixed(1)}:1, dark mode {contrast(shades.dark.brand, SURFACES.dark).toFixed(1)}:1 (at least {MIN_TEXT_CONTRAST}:1 is needed).
        </p>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="primary" disabled={!dirty || state.busy || !online} onClick={save}>{state.busy ? 'Saving...' : 'Save appearance'}</button>
        {dirty && <button className="secondary" onClick={() => { setPick(saved); applyAppearance(saved); }}>Undo</button>}
      </div>
      {!online && <p className="muted mt-2">You are offline. Changes show on this device; save them when you are back online.</p>}
      <Result state={state} />
    </Section>
  );
}
