import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import { passwordChecks } from '../data/activities.js';

function Shell({ activity, children }) {
  return (
    <section aria-label={`Activity: ${activity.title}`} className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
      <h2 className="font-extrabold text-lg">{activity.title}</h2>
      <p className="text-slate-700 mt-1">{activity.prompt}</p>
      <div className="mt-4">{children}</div>
      <p className="muted mt-4">Practice only. This activity does not change your scores.</p>
    </section>
  );
}

function Feedback({ ok, children }) {
  return (
    <p role="status" className={`mt-3 rounded-2xl p-3 font-semibold ${ok ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-900'}`}>
      {children}
    </p>
  );
}

/* ---------- sort ---------- */
function SortActivity({ activity }) {
  const [placed, setPlaced] = useState({}); // itemId -> group
  const [picked, setPicked] = useState(null);
  const [checked, setChecked] = useState(false);
  const unplaced = activity.items.filter((i) => !placed[i.id]);
  const wrong = activity.items.filter((i) => placed[i.id] && placed[i.id] !== i.group).length;
  const done = unplaced.length === 0;

  const drop = (group) => {
    if (!picked) return;
    setPlaced((p) => ({ ...p, [picked]: group }));
    setPicked(null);
    setChecked(false);
  };
  const reset = () => {
    setPlaced({});
    setPicked(null);
    setChecked(false);
  };

  return (
    <Shell activity={activity}>
      <p className="font-bold mb-2">Items to sort</p>
      <div className="flex flex-wrap gap-2 min-h-[44px]">
        {unplaced.length === 0 && <span className="muted">All items placed.</span>}
        {unplaced.map((i) => (
          <button
            key={i.id}
            aria-pressed={picked === i.id}
            onClick={() => setPicked(picked === i.id ? null : i.id)}
            className={`rounded-xl border-2 px-4 min-h-[44px] font-semibold ${picked === i.id ? 'bg-brand text-white border-brand' : 'bg-white border-amber-300'}`}
          >
            {i.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        {activity.groups.map((g) => (
          <div key={g} className="rounded-2xl bg-white border border-amber-200 p-3">
            <button
              onClick={() => drop(g)}
              disabled={!picked}
              className="secondary w-full font-extrabold"
              aria-label={`Put the selected item in ${g}`}
            >
              {g}
            </button>
            <ul className="mt-2 space-y-2">
              {activity.items
                .filter((i) => placed[i.id] === g)
                .map((i) => {
                  const right = i.group === g;
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => {
                          setPlaced((p) => {
                            const n = { ...p };
                            delete n[i.id];
                            return n;
                          });
                          setChecked(false);
                        }}
                        title="Tap to take it out"
                        className={`w-full text-left rounded-xl px-3 min-h-[44px] font-medium border flex items-center justify-between gap-2 ${
                          checked ? (right ? 'bg-green-100 border-green-400' : 'bg-red-50 border-red-300') : 'bg-indigo-50 border-indigo-100'
                        }`}
                      >
                        <span>{i.label}</span>
                        {checked && (right ? <Check size={18} aria-label="Correct" /> : <X size={18} aria-label="Incorrect" />)}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mt-4">
        <button className="primary" disabled={!done} onClick={() => setChecked(true)}>Check answers</button>
        <button className="secondary" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Start again</button>
      </div>
      {checked && (wrong === 0 ? <Feedback ok>All correct. Well done!</Feedback> : <Feedback>{wrong} item{wrong === 1 ? ' is' : 's are'} in the wrong group. Tap a red item to take it out and try again.</Feedback>)}
    </Shell>
  );
}

/* ---------- order ---------- */
function OrderActivity({ activity }) {
  const [list, setList] = useState(activity.steps);
  const [checked, setChecked] = useState(false);
  const correctCount = list.filter((s, i) => s === activity.answer[i]).length;
  const perfect = correctCount === list.length;

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    setChecked(false);
  };

  return (
    <Shell activity={activity}>
      <ol className="space-y-2">
        {list.map((s, i) => {
          const right = s === activity.answer[i];
          return (
            <li
              key={s}
              className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${
                checked ? (right ? 'bg-green-100 border-green-400' : 'bg-red-50 border-red-300') : 'bg-white border-amber-200'
              }`}
            >
              <span className="w-8 h-8 shrink-0 rounded-full bg-brand text-white grid place-items-center font-bold" aria-hidden="true">{i + 1}</span>
              <span className="flex-1 font-medium">{s}</span>
              <button className="secondary !px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move "${s}" up`}><ArrowUp size={18} /></button>
              <button className="secondary !px-2" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move "${s}" down`}><ArrowDown size={18} /></button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3 mt-4">
        <button className="primary" onClick={() => setChecked(true)}>Check order</button>
        <button className="secondary" onClick={() => { setList(activity.steps); setChecked(false); }}><RotateCcw size={16} aria-hidden="true" /> Start again</button>
      </div>
      {checked && (perfect ? <Feedback ok>Perfect order. Well done!</Feedback> : <Feedback>{correctCount} of {list.length} steps are in the right place. Red steps need to move.</Feedback>)}
    </Shell>
  );
}

/* ---------- spot ---------- */
function SpotActivity({ activity }) {
  const [marked, setMarked] = useState(new Set());
  const [checked, setChecked] = useState(false);
  const flags = activity.segments.filter((s) => s.flag);
  const found = flags.filter((s) => marked.has(s.id)).length;
  const falsePos = activity.segments.filter((s) => !s.flag && marked.has(s.id)).length;
  const perfect = found === flags.length && falsePos === 0;

  const toggle = (id) => {
    setMarked((m) => {
      const n = new Set(m);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setChecked(false);
  };

  return (
    <Shell activity={activity}>
      <div className="rounded-2xl bg-white border border-amber-200 p-3 space-y-2">
        {activity.segments.map((s) => {
          const on = marked.has(s.id);
          const tone = checked ? (s.flag ? (on ? 'bg-green-100 border-green-400' : 'bg-amber-100 border-amber-400') : on ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200') : on ? 'bg-brand-soft border-brand' : 'bg-white border-slate-200';
          return (
            <div key={s.id}>
              <button
                aria-pressed={on}
                onClick={() => toggle(s.id)}
                className={`w-full text-left rounded-xl border-2 px-3 min-h-[44px] py-2 font-medium break-words ${tone}`}
              >
                {s.text}
              </button>
              {checked && (s.flag || on) && <p className="muted mt-1 pl-1">{s.flag ? (on ? 'Found. ' : 'Missed. ') : 'Not a red flag. '}{s.why}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-4">
        <button className="primary" onClick={() => setChecked(true)}>Check</button>
        <button className="secondary" onClick={() => { setMarked(new Set()); setChecked(false); }}><RotateCcw size={16} aria-hidden="true" /> Start again</button>
      </div>
      {checked && (perfect ? <Feedback ok>You found all {flags.length} red flags.</Feedback> : <Feedback>You found {found} of {flags.length} red flags{falsePos ? ` and marked ${falsePos} harmless part${falsePos === 1 ? '' : 's'}` : ''}. Read the notes above and try again.</Feedback>)}
    </Shell>
  );
}

/* ---------- password ---------- */
function PasswordActivity({ activity }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const checks = passwordChecks(value);
  const passed = checks.filter((c) => c.ok).length;
  const strong = value.length > 0 && passed === checks.length;

  return (
    <Shell activity={activity}>
      <label className="block text-sm font-medium" htmlFor="practice-pw">Practice password</label>
      <div className="flex gap-2 mt-1">
        <input
          id="practice-pw"
          className="field !mt-0 flex-1"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Try: blue-mango-river-42"
        />
        <button className="secondary !px-3" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <ul className="mt-3 space-y-2" aria-label="Password checklist">
        {checks.map((c) => (
          <li key={c.id} className={`flex items-start gap-2 rounded-xl px-3 py-2 ${value && c.ok ? 'bg-green-100' : 'bg-white border border-amber-200'}`}>
            {value && c.ok ? <Check className="text-green-700 shrink-0 mt-0.5" size={18} aria-label="Met" /> : <X className="text-slate-400 shrink-0 mt-0.5" size={18} aria-label="Not met" />}
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      {value && (strong ? <Feedback ok>Strong. Use a different one like this for every account.</Feedback> : <Feedback>{passed} of {checks.length} rules met. Longer and less predictable is better.</Feedback>)}
    </Shell>
  );
}

export default function Activity({ activity }) {
  if (!activity) return null;
  if (activity.type === 'sort') return <SortActivity activity={activity} />;
  if (activity.type === 'order') return <OrderActivity activity={activity} />;
  if (activity.type === 'spot') return <SpotActivity activity={activity} />;
  if (activity.type === 'password') return <PasswordActivity activity={activity} />;
  return null;
}
