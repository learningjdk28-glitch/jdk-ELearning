import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FullScreenMessage } from './ui.jsx';

/** Rejects unauthenticated access and remembers where the learner was going. */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenMessage>Loading JDK Learning System...</FullScreenMessage>;
  if (!user) {
    // Admin screens send signed-out visitors to the administrator login, everything else to the student login.
    const loginPath = location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
