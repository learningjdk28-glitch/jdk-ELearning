import { Link } from 'react-router-dom';

export function AdminHeading({ eyebrow, title, description, action }) {
 return <div className="flex flex-wrap items-start justify-between gap-4 mb-7"><div><p className="uppercase tracking-[.2em] text-xs font-bold text-brand mb-2">{eyebrow || 'JDK Learn / Instructor workspace'}</p><h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text">{title}</h1><p className="text-text-muted mt-2 max-w-2xl">{description}</p></div>{action}</div>;
}
export function Metric({ icon: Icon, label, value, hint }) {
 return <div className="rounded-2xl bg-surface-raised border border-border p-5 shadow-sm flex items-start gap-4"><div className="rounded-2xl bg-brand-soft p-3 text-brand"><Icon size={23}/></div><div><p className="text-sm text-text-muted font-medium">{label}</p><p className="text-3xl font-black text-text mt-1 tabular-nums">{value ?? '—'}</p>{hint&&<p className="text-xs text-text-muted mt-2">{hint}</p>}</div></div>;
}
export function Status({ value }) {const on = value === true || ['active','published'].includes(value);return <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${on?'text-success bg-success/10':'text-warning bg-warning/10'}`}>{typeof value==='boolean'?(value?'Published':'Draft'):value}</span>;}
export function Notice({ error, info }) { return <>{error&&<p role="alert" className="rounded-xl bg-danger/10 border border-danger/30 text-danger p-3 mb-4">{error}</p>}{info&&<p role="status" className="rounded-xl bg-success/10 border border-success/30 text-success p-3 mb-4">{info}</p>}</>;}
export function Empty({ text, to, action }) {return <div className="rounded-2xl border-2 border-dashed border-border bg-surface-raised p-9 text-center text-text-muted">{text}{to&&<div className="mt-4"><Link to={to} className="primary">{action}</Link></div>}</div>;}
export const panel = 'rounded-2xl border border-border bg-surface-raised shadow-sm';
