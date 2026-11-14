import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Callout } from '../components/ui.jsx';

const emailSchema = z.string().trim().email('Enter a valid email address.');
const passwordSchema = z.string().min(8, 'Use at least 8 characters.');

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function Shell({ title, desc, eyebrow = 'Welcome to JDK Learn', children }) {
  const online = useOnline();
  return (
    <div className="min-h-screen bg-[#eef2ff] grid place-items-center p-4 sm:p-7">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] rounded-[2rem] overflow-hidden shadow-2xl shadow-indigo-950/10 bg-white border border-indigo-100">
        <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#111b38] via-indigo-950 to-indigo-700 text-white p-12 min-h-[640px]">
          <Link to="/" className="text-2xl font-black tracking-tight">JDK <span className="text-indigo-300">Learn</span></Link>
          <div><span className="inline-flex rounded-full bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold">Your digital learning campus</span><h2 className="text-5xl leading-tight font-black mt-6">Learn something new. Every day.</h2><p className="text-indigo-200 text-lg mt-5 leading-relaxed">Structured courses, downloadable notes, interactive quizzes, and progress that follows you from device to device.</p></div>
          <p className="text-indigo-300 text-sm">Secure sign-in · Powered by Supabase</p>
        </div>
        <div className="px-6 py-9 sm:px-12 sm:py-12 flex flex-col justify-center">
          <Link to="/" className="lg:hidden text-2xl font-black text-indigo-700 mb-8">JDK Learn</Link>
          <p className="text-xs font-black tracking-[.18em] uppercase text-indigo-600 mb-3">{eyebrow}</p>
          <h1 className="text-3xl font-black text-slate-900">{title}</h1>
          {desc && <p className="text-slate-500 mt-2 mb-5">{desc}</p>}
          {!online && <div className="mb-4"><Callout tone="warn">No internet connection. Login, registration and password reset require internet.</Callout></div>}
          {children}
          <p className="text-xs text-slate-400 mt-9">Student and administrator access are securely determined by your account role.</p>
        </div>
      </div>
    </div>
  );
}

function ConfigWarning() {
  return (
    <Callout tone="warn">
      Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the .env file and restart the
      dev server.
    </Callout>
  );
}

/** Password field with an eye button that shows or hides what was typed. */
function PasswordInput({ value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative mt-1">
      <input
        className="field mt-0 pr-12"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 hover:text-indigo-600 bg-transparent border-0 shadow-none"
      >
        <Icon size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function useAuthForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  return { busy, setBusy, error, setError, info, setInfo };
}

function friendly(err) {
  const msg = err?.message || 'Something went wrong.';
  if (/failed to fetch|network/i.test(msg)) return 'No internet connection. Signing in needs internet the first time.';
  if (/error sending .*email/i.test(msg)) return 'We could not send the email right now. The email service is not set up to deliver to this address yet. Please contact the administrator.';
  if (/rate limit|too many requests|429/i.test(msg)) return 'Too many sign-up or email requests were sent from this project. Wait about an hour and try again, or ask the administrator to turn off email confirmation or set up custom email sending.';
  return msg;
}

/**
 * Shared sign-in form. `admin` picks the administrator portal.
 * Each portal only accepts its own role: after the server confirms the role, a mismatched account is
 * signed out again and told which login to use. RLS stays the real guard; this keeps the two doors separate.
 */
function LoginForm({ admin }) {
  const { user, isAdmin, roleVerified, offlineSession, signIn, signOut, configured, resendConfirmation } = useAuth();
  const location = useLocation();
  const f = useAuthForm();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submitted = useRef(false);

  // Wait until the server has checked the account role before choosing the landing page.
  const ready = Boolean(user && (roleVerified || offlineSession));
  const wrongPortal = ready && submitted.current && (admin ? !isAdmin : isAdmin);

  useEffect(() => {
    if (!wrongPortal) return;
    submitted.current = false;
    signOut();
    f.setError(admin
      ? 'This account does not have administrator access. Students sign in on the student login.'
      : 'This is an administrator account. Please sign in on the administrator login.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongPortal]);

  if (ready && !wrongPortal) {
    // Already signed in from an earlier visit: go to the home of the role the account really has.
    if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
    return <Navigate to={location.state?.from || (isAdmin ? '/admin' : '/dashboard')} replace />;
  }

  async function submit(e) {
    e.preventDefault();
    f.setError('');
    f.setInfo('');
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return f.setError(parsed.error.issues[0].message);
    if (!password) return f.setError('Enter your password.');
    f.setBusy(true);
    submitted.current = true;
    try {
      await signIn(parsed.data, password);
      // Auth state + role verification perform the redirect (or the wrong-portal sign-out) above.
    } catch (err) {
      submitted.current = false;
      f.setError(friendly(err));
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <Shell
      eyebrow={admin ? 'JDK Learn Administration' : 'Student Portal'}
      title={admin ? 'Administrator sign in' : 'Welcome back'}
      desc={admin ? 'For teachers and administrators who manage courses, students and reports.' : 'Sign in to continue your courses on any device.'}
    >
      {!configured && <ConfigWarning />}
      <form onSubmit={submit} className="space-y-4 mt-3" noValidate>
        <label className="block text-sm font-medium">
          {admin ? 'Administrator email' : 'Email'}
          <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">
          Password
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {f.error && (
          <Callout tone="bad">
            {/not confirmed/i.test(f.error) ? 'Your email is not confirmed yet. Open the confirmation email we sent, or request a new one.' : f.error}
            {/not confirmed/i.test(f.error) && (
              <button
                type="button"
                className="secondary mt-3 w-full"
                disabled={f.busy}
                onClick={async () => {
                  f.setBusy(true);
                  try {
                    await resendConfirmation(email.trim());
                    f.setError('');
                    f.setInfo('Confirmation email sent. Check your inbox and spam folder.');
                  } catch (err) {
                    f.setError(friendly(err));
                  } finally {
                    f.setBusy(false);
                  }
                }}
              >
                Resend confirmation email
              </button>
            )}
          </Callout>
        )}
        {f.info && <Callout tone="good">{f.info}</Callout>}
        <button className="primary w-full" disabled={f.busy || !configured}>
          {f.busy ? 'Signing in...' : admin ? 'Sign in as administrator' : 'Log in'}
        </button>
      </form>
      <div className="flex justify-between flex-wrap gap-3 mt-5 text-sm text-indigo-700">
        <Link to="/forgot-password" className="underline">Forgot password?</Link>
        {!admin && <Link to="/register" className="underline">Create an account</Link>}
      </div>
      <p className="mt-6 pt-5 border-t border-slate-100 text-sm text-slate-500">
        {admin
          ? <>Are you a student? <Link to="/login" className="text-indigo-700 underline">Go to the student login</Link></>
          : <>Teacher or administrator? <Link to="/admin/login" className="text-indigo-700 underline">Administrator login</Link></>}
      </p>
    </Shell>
  );
}

export function Login() {
  return <LoginForm />;
}

export function AdminLogin() {
  return <LoginForm admin />;
}

export function Register() {
  const { user, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const f = useAuthForm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(e) {
    e.preventDefault();
    f.setError('');
    f.setInfo('');
    const em = emailSchema.safeParse(email);
    if (!em.success) return f.setError(em.error.issues[0].message);
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return f.setError(pw.error.issues[0].message);
    if (password !== confirm) return f.setError('The passwords do not match.');
    f.setBusy(true);
    try {
      const { needsConfirmation } = await signUp(em.data, password, name.trim());
      if (needsConfirmation) f.setInfo('Account created. Open the confirmation email, then log in.');
      else navigate('/dashboard', { replace: true });
    } catch (err) {
      f.setError(friendly(err));
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <Shell title="Create your account" desc="Create your free student account and start learning.">
      {!configured && <ConfigWarning />}
      <form onSubmit={submit} className="space-y-4 mt-3" noValidate>
        <label className="block text-sm font-medium">
          Name (optional)
          <input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">
          Password (8 or more characters)
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Confirm password
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {f.error && <Callout tone="bad">{f.error}</Callout>}
        {f.info && <Callout tone="good">{f.info}</Callout>}
        <button className="primary w-full" disabled={f.busy || !configured}>{f.busy ? 'Creating account...' : 'Create account'}</button>
      </form>
      <p className="mt-5 text-sm">
        Already registered? <Link to="/login" className="text-indigo-700 underline">Log in</Link>
      </p>
    </Shell>
  );
}

export function ForgotPassword() {
  const { resetPassword, configured } = useAuth();
  const f = useAuthForm();
  const [email, setEmail] = useState('');

  async function submit(e) {
    e.preventDefault();
    f.setError('');
    f.setInfo('');
    const em = emailSchema.safeParse(email);
    if (!em.success) return f.setError(em.error.issues[0].message);
    f.setBusy(true);
    try {
      await resetPassword(em.data);
      f.setInfo('If that email has an account, a reset link is on its way.');
    } catch (err) {
      f.setError(friendly(err));
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <Shell title="Reset your password" desc="We will email you a link to choose a new password.">
      {!configured && <ConfigWarning />}
      <form onSubmit={submit} className="space-y-4 mt-3" noValidate>
        <label className="block text-sm font-medium">
          Email
          <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {f.error && <Callout tone="bad">{f.error}</Callout>}
        {f.info && <Callout tone="good">{f.info}</Callout>}
        <button className="primary w-full" disabled={f.busy || !configured}>{f.busy ? 'Sending...' : 'Send reset link'}</button>
      </form>
      <p className="mt-5 text-sm">
        <Link to="/login" className="text-indigo-700 underline">Back to log in</Link>
      </p>
    </Shell>
  );
}

export function ResetPassword() {
  const { updatePassword, recovery, user, loading } = useAuth();
  const navigate = useNavigate();
  const f = useAuthForm();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [done, navigate]);

  async function submit(e) {
    e.preventDefault();
    f.setError('');
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return f.setError(pw.error.issues[0].message);
    f.setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      f.setError(friendly(err));
    } finally {
      f.setBusy(false);
    }
  }

  const allowed = recovery || user;
  return (
    <Shell title="Choose a new password" desc="Open this page from the link in your reset email.">
      {!loading && !allowed && (
        <Callout tone="warn">
          This link is not active. Request a new one from the <Link className="underline" to="/forgot-password">reset page</Link>.
        </Callout>
      )}
      <form onSubmit={submit} className="space-y-4 mt-3" noValidate>
        <label className="block text-sm font-medium">
          New password (8 or more characters)
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {f.error && <Callout tone="bad">{f.error}</Callout>}
        {done && <Callout tone="good">Password updated. Taking you to your dashboard.</Callout>}
        <button className="primary w-full" disabled={f.busy || !allowed || done}>{f.busy ? 'Updating...' : 'Update password'}</button>
      </form>
    </Shell>
  );
}
