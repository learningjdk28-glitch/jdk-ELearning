import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { authRedirect } from '../lib/native.js';
import { fetchProfile } from '../services/profile.js';
import { applyAppearance } from '../lib/applyTheme.js';

const AuthContext = createContext(null);
const CACHE_KEY = 'navi:lastUser';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(user) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify({ id: user.id, email: user.email, name: user.name || null }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable: offline resume is skipped */
  }
}

const slim = (u) => {
  if (!u) return null;
  const meta = u.user_metadata || {};
  // Prefer display_name from sign-up; fall back to the common full_name / name metadata keys.
  const base = { id: u.id, email: u.email, name: meta.display_name || meta.full_name || meta.name || null, role: 'learner' };
  // Never trust cached roles. Only an online profiles query may grant admin UI access.
  const cached = readCache();
  return cached && cached.id === base.id ? { ...base, name: cached.name || base.name } : base;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [roleVerified, setRoleVerified] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data?.session?.user) {
          const u = slim(data.session.user);
          writeCache(u);
          setUser(u);
          setRoleVerified(false);
        } else if (navigator.onLine === false || error) {
          // Offline restart: resume with the last signed-in learner. Local data only.
          const cached = readCache();
          if (cached) {
            setUser({ ...cached, role: 'learner' });
            setRoleVerified(true);
            setOfflineSession(true);
          }
        } else {
          writeCache(null);
        }
      } catch {
        const cached = readCache();
        if (cached && !cancelled) {
          setUser({ ...cached, role: 'learner' });
          setRoleVerified(true);
          setOfflineSession(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (session?.user) {
        const u = slim(session.user);
        writeCache(u);
        setUser(u);
        setRoleVerified(false);
        setAuthVersion(n => n + 1);
        setOfflineSession(false);
      } else if (event === 'SIGNED_OUT') {
        writeCache(null);
        setUser(null);
        setRoleVerified(false);
        setAuthVersion(n => n + 1);
        setOfflineSession(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the profile row (role and display name). Offline: keep the cached values.
  useEffect(() => {
    if (!user?.id || !supabase || navigator.onLine === false || offlineSession) return undefined;
    let cancelled = false;
    fetchProfile(user.id)
      .then((p) => {
        if (cancelled) return;
        if (!p) { setRoleVerified(true); return; }
        applyAppearance({ theme: p.theme, brand: p.brand_color });
        setUser((prev) => {
          if (!prev || prev.id !== p.id) return prev;
          const next = { ...prev, name: p.display_name || prev.name, role: p.role, superAdmin: p.is_super_admin === true };
          writeCache(next);
          return next;
        });
        setRoleVerified(true);
      })
      .catch(() => { if (!cancelled) setRoleVerified(true); });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authVersion, offlineSession]);

  const setDisplayName = useCallback((name) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, name };
      writeCache(next);
      return next;
    });
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  // returnPath: where the confirmation link lands (/login for students, /admin/login for administrators).
  const signUp = useCallback(async (email, password, displayName, returnPath = '/login') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
        emailRedirectTo: authRedirect(returnPath),
      },
    });
    if (error) throw error;
    // With email confirmation enabled there is no session yet.
    return { needsConfirmation: !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirect('/login') },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    writeCache(null);
    applyAppearance(null); // the next person on this device starts with the default look
    setUser(null);
    setRoleVerified(false);
    setOfflineSession(false);
    try {
      await supabase?.auth.signOut();
    } catch {
      /* already cleared locally */
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect('/reset-password'),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecovery(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      roleVerified,
      offlineSession,
      recovery,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      resetPassword,
      resendConfirmation,
      updatePassword,
      setDisplayName,
      role: user?.role || 'learner',
      isAdmin: user?.role === 'admin' && roleVerified && !offlineSession,
      // Super administrator: sees every course, changes roles, manages the admin email list.
      isSuperAdmin: user?.role === 'admin' && user?.superAdmin === true && roleVerified && !offlineSession,
    }),
    [user, loading, roleVerified, offlineSession, recovery, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword, setDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
