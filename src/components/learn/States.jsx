import { Link } from 'react-router-dom';
import { Loader2, WifiOff } from 'lucide-react';

/** Shared loading / error / offline / empty states for student screens. */
export function LoadingState({ label = 'Loading...' }) {
  return <p className="flex items-center gap-2 text-text-muted p-6" role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> {label}</p>;
}

export function ErrorState({ error, onRetry }) {
  if (error?.offline) {
    return (
      <div className="panel p-6" role="status">
        <p className="flex items-center gap-2 font-bold text-text"><WifiOff size={18} className="text-warning" aria-hidden="true" /> You are offline</p>
        <p className="text-text-muted mt-1">Online courses need internet. Lessons you saved for offline use are under <Link className="text-brand underline" to="/courses">Offline lessons</Link>.</p>
        {onRetry && <button className="secondary mt-4" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  return (
    <div className="panel p-6 border-danger/30" role="alert">
      <p className="font-bold text-danger">Something went wrong</p>
      <p className="text-text-muted mt-1">{error?.message || String(error)}</p>
      {onRetry && <button className="secondary mt-4" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-border bg-surface-raised p-8 text-center">
      <p className="font-bold text-text">{title}</p>
      {children && <div className="text-text-muted mt-1">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
