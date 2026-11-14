/** Numbered step diagram for Visual mode. Pure CSS/SVG-free, so it renders offline everywhere. */
export default function VisualFlow({ steps }) {
  return (
    <ol className="grid gap-3 md:grid-flow-col md:auto-cols-fr items-stretch" aria-label="Lesson steps">
      {steps.map((s, i) => (
        <li key={s.t} className="relative">
          <div className="h-full rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4">
            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white grid place-items-center font-extrabold mb-3" aria-hidden="true">
              {i + 1}
            </div>
            <h3 className="font-bold">{s.t}</h3>
            <p className="text-sm text-slate-700 mt-1">{s.d}</p>
          </div>
          {i < steps.length - 1 && (
            <span className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 text-indigo-500 font-extrabold z-10" aria-hidden="true">
              &rarr;
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
