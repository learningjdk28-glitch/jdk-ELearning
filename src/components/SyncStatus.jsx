import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, RefreshCw, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { discardItem, flush, retryItem, startAutoSync, watchOutbox } from '../services/offline.js';
import { OUTBOX_KINDS, outboxSummary } from '../lib/offlineRules.js';

/** This account's outbox (work saved on the device, waiting to be sent), kept up to date. */
export function useOutbox() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  useEffect(() => watchOutbox(user?.id, setItems), [user?.id]);
  return items;
}

/**
 * Header badge: "Synced", "3 waiting to sync", or "1 problem". Opens a list where failed items can be retried or discarded.
 * `legacyPending` counts changes from the older offline lessons, which sync on their own.
 */
export default function SyncStatus({ online, legacyPending = 0 }) {
  const items = useOutbox();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => startAutoSync(), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onClick = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [open]);

  const { pending, failed } = outboxSummary(items);
  const waiting = pending + legacyPending;
  const label = failed ? `${failed} problem${failed === 1 ? '' : 's'}`
    : waiting ? `${waiting} waiting to sync`
    : online ? 'Synced' : 'Saved on device';
  const tone = failed ? 'text-danger' : waiting || !online ? 'text-warning' : 'text-success';
  const Icon = failed ? AlertTriangle : online ? Cloud : CloudOff;

  async function act(fn) { setBusy(true); try { await fn(); } finally { setBusy(false); } }

  return (
    <div className="relative" ref={box}>
      <button type="button" className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <Icon size={14} aria-hidden="true" /> <span className={waiting || failed ? '' : 'hidden sm:inline'}>{label}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Sync status" className="absolute right-0 top-8 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface-raised shadow-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-black text-text">Saved on this device</p>
            <button type="button" className="p-1 rounded-full hover:bg-surface-muted" aria-label="Close" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button>
          </div>
          <p className="text-sm text-text-muted mt-1">
            {online ? 'Work done offline is sent automatically.' : 'You are offline. Your work is kept here and sent when you reconnect.'}
          </p>
          {items.length === 0 && legacyPending === 0 ? <p className="text-sm text-success mt-3">Nothing is waiting. Everything is saved online.</p> : (
            <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {legacyPending > 0 && <li className="rounded-xl border border-border p-2 text-sm text-text">{legacyPending} change{legacyPending === 1 ? '' : 's'} from offline lessons</li>}
              {items.map((i) => (
                <li key={i.id} className={`rounded-xl border p-2 text-sm ${i.status === 'failed' ? 'border-danger/40 bg-danger/5' : 'border-border'}`}>
                  <p className="font-semibold text-text">{OUTBOX_KINDS[i.kind] || i.kind}{i.label ? `: ${i.label}` : ''}</p>
                  <p className="text-xs text-text-muted">{new Date(i.createdAt).toLocaleString()}</p>
                  {i.status === 'failed' && (
                    <>
                      <p className="text-xs text-danger mt-1">Not accepted: {i.error}</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className="secondary text-xs" disabled={busy || !online} onClick={() => act(() => retryItem(i.id))}><RefreshCw size={12} aria-hidden="true" /> Retry</button>
                        <button type="button" className="secondary text-xs !text-danger" disabled={busy}
                          onClick={() => { if (window.confirm('Discard this item? It will not be sent.')) act(() => discardItem(i.id)); }}>
                          <Trash2 size={12} aria-hidden="true" /> Discard
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pending > 0 && online && <button type="button" className="primary text-sm mt-3 w-full justify-center" disabled={busy} onClick={() => act(flush)}><RefreshCw size={14} aria-hidden="true" /> Send now</button>}
        </div>
      )}
    </div>
  );
}
