import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/** Sends users without the needed role back to the dashboard. RLS is the real guard; this hides screens. */
export default function RequireRole({ role, children }) {
  const auth = useAuth();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return <Navigate to="/dashboard" replace />;
  if (!auth.roleVerified && !auth.offlineSession) return <div role="status" className="p-8 text-center text-slate-600">Checking permissions…</div>;
  if (auth.offlineSession || auth.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}
