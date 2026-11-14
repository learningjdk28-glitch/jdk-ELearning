import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { isNative } from '../lib/native.js';
import { supabase } from '../lib/supabase.js';

/**
 * Android only (does nothing in the browser):
 *  - hardware back button goes back in the app, and exits only from a top-level screen
 *  - email links that open the app (password reset, confirm email) sign the user in
 */
const TOP_LEVEL = ['/', '/dashboard', '/login', '/admin/login', '/admin'];

export default function NativeBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    if (!isNative()) return undefined;
    const handles = [];

    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && !TOP_LEVEL.includes(path.current)) navigate(-1);
      else CapApp.exitApp();
    }).then((h) => handles.push(h));

    CapApp.addListener('appUrlOpen', async ({ url }) => {
      try {
        const hash = new URL(url.replace('#', '?hash&')).searchParams;
        const access_token = hash.get('access_token');
        const refresh_token = hash.get('refresh_token');
        if (access_token && refresh_token && supabase) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          navigate(hash.get('type') === 'recovery' ? '/reset-password' : '/dashboard', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      }
    }).then((h) => handles.push(h));

    return () => handles.forEach((h) => h.remove());
  }, [navigate]);

  return null;
}
