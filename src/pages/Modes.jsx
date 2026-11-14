import { Link } from 'react-router-dom';
import { Check, FileText, Hand, Headphones, Image } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { LEARNING_MODES } from '../data/course.js';
import { BackHeader, Callout } from '../components/ui.jsx';

const LOOK = {
  Visual: { title: 'Visual Learning', Icon: Image, tile: 'bg-blue-100 text-blue-700', text: 'Diagrams, step flows, and illustrated explanations.' },
  Auditory: { title: 'Auditory Learning', Icon: Headphones, tile: 'bg-purple-100 text-purple-700', text: 'Lessons read aloud by your device voice, with a transcript to follow. Works offline when your device has an offline voice.' },
  'Read/Write': { title: 'Reading / Textual Learning', Icon: FileText, tile: 'bg-slate-200 text-slate-700', text: 'Text-based lessons, guides, step-by-step explanations, and notes.' },
  Kinesthetic: { title: 'Kinesthetic Learning', Icon: Hand, tile: 'bg-amber-100 text-amber-700', text: 'Hands-on activities: sort, put steps in order, spot red flags, and build a strong password.' },
};

export default function Modes() {
  const { mode, changeMode, hasDiagnostic } = useLearner();
  return (
    <div className="w-full">
      <BackHeader title="Choose a Learning Mode" to="/courses" />
      <p className="text-center text-slate-600 text-lg mb-5">
        Pick a content format you prefer. You can change this anytime. A mode changes presentation only, never your scores.
      </p>
      <div className="grid md:grid-cols-2 gap-4" role="radiogroup" aria-label="Learning mode">
        {LEARNING_MODES.map((m) => {
          const look = LOOK[m.id];
          const unavailable = m.status !== 'available';
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={active}
              disabled={unavailable}
              aria-label={m.id}
              onClick={() => changeMode(m.id)}
              className={`w-full text-left flex items-center gap-4 rounded-3xl border-2 p-5 disabled:opacity-60 disabled:cursor-not-allowed ${
                active ? 'border-green-600 bg-green-50' : 'border-indigo-100 bg-white hover:border-indigo-300'
              }`}
            >
              <div className={`tile !w-16 !h-16 ${look.tile}`}><look.Icon size={30} aria-hidden="true" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-lg">{look.title}</p>
                <p className="muted mt-1">{look.text}</p>
                {unavailable && <p className="text-amber-800 text-sm font-bold mt-2">Incomplete: not available in this MVP.</p>}
              </div>
              {active && (
                <span className="w-10 h-10 rounded-full bg-green-600 text-white grid place-items-center shrink-0">
                  <Check size={22} aria-label="Selected" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <Callout>Saved on this device and synced to your account when online. You can also switch modes inside any lesson.</Callout>
      </div>
      <Link to={hasDiagnostic ? '/path' : '/pretest'} className="primary w-full md:w-auto md:min-w-[22rem] text-lg !py-4 mt-6">
        {hasDiagnostic ? 'Back to my learning path' : 'Continue to the pre-test'}
      </Link>
    </div>
  );
}
