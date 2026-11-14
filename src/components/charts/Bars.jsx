// Small bar charts made of tokens only. Every bar carries a visible value label (two series colours sit below
// 3:1 contrast on white, so values are never read from colour alone), a hover title, and a legend for 2+ series.

export const SERIES = [
  { name: 'Pre-test', bar: 'bg-category-1', swatch: 'bg-category-1' },
  { name: 'Post-test', bar: 'bg-category-2', swatch: 'bg-category-2' },
];

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-text-muted" aria-label="Legend">
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-2">
          {s.marker ? <span className="w-0.5 h-4 bg-text" aria-hidden="true" /> : <span className={`w-3 h-3 rounded-sm ${s.swatch}`} aria-hidden="true" />}
          {s.name}
        </li>
      ))}
    </ul>
  );
}

const fmt = (v, unit) => (v == null ? '—' : `${Math.round(Number(v))}${unit}`);

/** One row per item, two bars per row (series a and b), 0..max. rows: [{ key, label, a, b }]. */
export function PairedBars({ rows, series = SERIES, max = 100, unit = '%', label }) {
  return (
    <div role="group" aria-label={label}>
      <Legend items={series} />
      <ul className="mt-4 space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <p className="text-sm font-semibold text-text">{r.label}</p>
            <div className="mt-1.5 space-y-0.5">
              {[r.a, r.b].map((v, i) => (
                <div key={i} className="flex items-center gap-2" title={`${r.label} · ${series[i].name}: ${fmt(v, unit)}`}>
                  <div className="flex-1 h-2.5 rounded bg-surface-muted overflow-hidden">
                    {v != null && <div className={`h-full rounded ${series[i].bar}`} style={{ width: `${Math.max(1, Math.min(100, (Number(v) / max) * 100))}%` }} />}
                  </div>
                  <span className="w-20 text-xs text-text-muted tabular-nums"><span className="sr-only">{series[i].name}: </span>{fmt(v, unit)}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "You" as a bar and the class average as a marker on the same 0..max scale. */
export function CompareBar({ label, mine, cls, max = 100, unit = '%', format }) {
  const show = format || ((v) => fmt(v, unit));
  const at = (v) => `${Math.max(0, Math.min(100, (Number(v) / max) * 100))}%`;
  return (
    <div title={`${label}: you ${show(mine)}${cls != null ? `, class average ${show(cls)}` : ''}`}>
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-semibold text-text">{label}</span>
        <span className="text-text-muted tabular-nums">You {show(mine)}{cls != null ? ` · class ${show(cls)}` : ''}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded bg-surface-muted">
        {mine != null && <div className="absolute inset-y-0 left-0 rounded bg-category-1" style={{ width: at(mine) }} />}
        {cls != null && <div className="absolute -top-1 -bottom-1 w-0.5 bg-text ring-2 ring-surface-raised" style={{ left: at(cls) }} aria-hidden="true" />}
      </div>
    </div>
  );
}
