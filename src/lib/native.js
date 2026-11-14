import { Capacitor } from '@capacitor/core';

// Custom URL scheme registered by the Android app (see docs/APK_BUILD.md). Supabase email links
// (password reset, confirm email) open the app through it.
export const APP_SCHEME = 'com.navilearn.app';

export const isNative = () => Capacitor.isNativePlatform();

/** Where Supabase should send the user after an email link, for web and for the APK. */
// VITE_PUBLIC_URL is the address other devices can open (for example https://your-app.vercel.app).
// Without it, a link created while developing points at localhost, which a phone cannot reach.
export function authRedirect(path) {
  if (isNative()) return `${APP_SCHEME}://${path.replace(/^\//, '')}`;
  const base = (import.meta.env?.VITE_PUBLIC_URL || window.location.origin).replace(/\/+$/, '');
  return `${base}${path}`;
}

/** The public web address (for links printed on certificates): VITE_PUBLIC_URL, else this page's address. */
export const publicOrigin = () => (import.meta.env?.VITE_PUBLIC_URL || window.location.origin).replace(/\/+$/, '');
