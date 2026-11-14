import { Link } from 'react-router-dom';

export function AdminHeading({ eyebrow, title, description, action }) {
 return <div className="flex flex-wrap items-start justify-between gap-4 mb-7"><div><p className="uppercase tracking-[.2em] text-xs font-bold text-indigo-600 mb-2">{eyebrow || 'JDK Learn / Admin workspace'}</p><h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">{title}</h1><p className="text-slate-500 mt-2 max-w-2xl">{description}</p></div>{action}</div>;
}
export function Metric({ icon: Icon, label, value, hint }) {
 return <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex items-start gap-4"><div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700"><Icon size={23}/></div><div><p className="text-sm text-slate-500 font-medium">{label}</p><p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{value ?? '—'}</p>{hint&&<p className="text-xs text-slate-500 mt-2">{hint}</p>}</div></div>;
}
export function Status({ value }) {const on = value === true || ['active','published'].includes(value);return <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${on?'text-emerald-800 bg-emerald-100':'text-amber-800 bg-amber-100'}`}>{typeof value==='boolean'?(value?'Published':'Draft'):value}</span>;}
export function Notice({ error, info }) { return <>{error&&<p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3 mb-4">{error}</p>}{info&&<p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 mb-4">{info}</p>}</>;}
export function Empty({ text, to, action }) {return <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-9 text-center text-slate-500">{text}{to&&<div className="mt-4"><Link to={to} className="primary">{action}</Link></div>}</div>;}
export const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
