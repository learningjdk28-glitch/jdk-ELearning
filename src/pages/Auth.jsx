import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { emailSchema, passwordSchema } from '../lib/validation.js';
import { GraduationCap } from 'lucide-react';
import PasswordInput from '../components/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Callout } from '../components/ui.jsx';


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

/** One plain card per portal: logo, portal name, title, form. Nothing else. */
function Shell({ title, desc, portal = 'Student portal', children }) {
  const online = useOnline();
  return (
    <div className="min-h-screen bg-surface grid place-items-center p-4">
      <main className="w-full max-w-md bg-surface-raised border border-border rounded-3xl shadow-sm px-6 py-8 sm:px-9 sm:py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-xl font-black text-text">
          <span className="rounded-xl p-1.5 bg-brand-soft text-brand"><GraduationCap size={22} aria-hidden="true" /></span>
          JDK Learn
        </Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-brand">{portal}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-text">{title}</h1>
        {desc && <p className="text-text-muted mt-2">{desc}</p>}
        {!online && <div className="mt-4"><Callout tone="warn">No internet connection. Signing in, registering and resetting a password need internet.</Callout></div>}
        <div className="mt-5">{children}</div>
      </main>
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
      ? 'This account does not have instructor access. Students sign in on the student sign-in page.'
      : 'This is an instructor account. Please use the instructor sign-in page.');
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
    <Shell portal={admin ? 'Instructor portal' : 'Student portal'} title="Sign in">
      {!configured && <ConfigWarning />}
      <form onSubmit={submit} className="space-y-4 mt-3" noValidate>
        <label className="block text-sm font-medium">
          Email
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
          {f.busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <div className="flex justify-between flex-wrap gap-3 mt-5 text-sm text-brand">
        <Link to="/forgot-password" className="underline">Forgot password?</Link>
        <Link to={admin ? '/admin/register' : '/register'} className="underline">Create an account</Link>
      </div>
      <p className="mt-6 pt-5 border-t border-border text-sm text-text-muted">
        {admin
          ? <>Student? <Link to="/login" className="text-brand underline">Student sign in</Link></>
          : <>Instructor? <Link to="/admin/login" className="text-brand underline">Instructor sign in</Link></>}
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

/**
 * Shared sign-up form. `admin` is the administrator version: same account, but the confirmation link
 * returns to the admin login. The ROLE is never chosen here: the database gives 'admin' only to emails
 * on public.admin_allowlist, so registering on this page cannot make a stranger an administrator.
 */
function RegisterForm({ admin }) {
  const { user, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const f = useAuthForm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  if (user) return <Navigate to={admin ? '/admin' : '/dashboard'} replace />;

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
      const { needsConfirmation } = await signUp(em.data, password, name.trim(), admin ? '/admin/login' : '/login');
      if (needsConfirmation) {
        f.setInfo(admin
          ? 'Account created. Open the confirmation email, then sign in on the instructor sign-in page. Instructor access is given only to emails your school approved.'
          : 'Account created. Open the confirmation email, then log in.');
      } else navigate(admin ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      f.setError(friendly(err));
    } finally {
      f.setBusy(false);
    }
  }

  return (
    <Shell
      portal={admin ? 'Instructor portal' : 'Student portal'}
      title="Create an account"
      desc={admin ? 'Use the email your school approved for instructor access.' : undefined}
    >
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
        Already registered? <Link to={admin ? '/admin/login' : '/login'} className="text-brand underline">Sign in</Link>
      </p>
    </Shell>
  );
}

export function Register() {
  return <RegisterForm />;
}

export function AdminRegister() {
  return <RegisterForm admin />;
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
        <Link to="/login" className="text-brand underline">Back to sign in</Link>
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
