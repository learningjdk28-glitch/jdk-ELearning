import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Mobile-style page header: back arrow, centered title, optional right slot. */
export function BackHeader({ title, to, right }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 mb-5">
      <button
        onClick={() => (to ? navigate(to) : navigate(-1))}
        aria-label="Go back"
        className="w-10 h-10 grid place-items-center rounded-full hover:bg-brand-soft"
      >
        <ArrowLeft size={22} />
      </button>
      <h1 className="text-xl sm:text-2xl font-extrabold flex-1 min-w-0 truncate">{title}</h1>
      {right}
    </div>
  );
}

export function Callout({ tone = 'info', children }) {
  const tones = {
    info: 'bg-brand-soft text-text border-brand/30',
    warn: 'bg-warning/10 text-text border-warning/30',
    good: 'bg-success/10 text-text border-success/30',
    bad: 'bg-danger/10 text-text border-danger/30',
  };
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-2xl border p-4 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen grid place-items-center p-8 text-center text-text-muted" role="status">
      {children}
    </div>
  );
}
