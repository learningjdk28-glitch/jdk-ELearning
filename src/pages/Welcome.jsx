import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Onboarding in four steps, following the "JDK Learn Onboarding Redesign" mockups:
// 1 Welcome, 2 J (Just), 3 D (Discover), 4 K (Knowledge).
// Illustrations are inline SVG so they work offline and scale to any screen.

// Colours are the fixed illustration tokens (illo-*), written as Tailwind fill-/stroke- classes.
const Letter = ({ x, y, size = 40, ink = false, children }) => (
  <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="800" fontFamily="inherit" className={ink ? 'fill-illo-ink' : 'fill-illo-paper'}>{children}</text>
);

function WelcomeArt() {
  return (
    <svg viewBox="0 0 340 260" className="w-full h-auto" role="img" aria-label="Blocks J, D and K resting on an open book">
      <path className="fill-illo-1-soft" d="M0 150 C60 105 120 115 170 130 C230 145 290 110 340 125 V232 H0Z" />
      <path className="fill-illo-1-mid" d="M0 175 C70 140 130 160 180 160 C240 160 290 140 340 150 V232 H0Z" />
      <circle className="fill-illo-sun" cx="262" cy="58" r="30" />
      <circle className="fill-illo-3" cx="62" cy="82" r="5" />
      <path className="fill-illo-1-light" d="M30 104 l8 14 l-8 14 l-8 -14z" />
      <path className="fill-illo-2-light" d="M302 132 l7 12 l-7 12 l-7 -12z" />
      <g transform="rotate(-6 173 82)">
        <rect className="fill-illo-3" x="142" y="50" width="62" height="62" rx="14" />
        <Letter x="173" y="96" size="38" ink>K</Letter>
      </g>
      <rect className="fill-illo-1" x="92" y="118" width="64" height="64" rx="14" />
      <Letter x="124" y="164">J</Letter>
      <rect className="fill-illo-2" x="188" y="118" width="64" height="64" rx="14" />
      <Letter x="220" y="164">D</Letter>
      <path className="fill-illo-paper stroke-illo-ink" d="M62 190 L170 172 L170 194 L62 210Z" strokeWidth="3" strokeLinejoin="round" />
      <path className="fill-illo-paper stroke-illo-ink" d="M170 172 L278 190 L278 210 L170 194Z" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function JustArt() {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-auto" role="img" aria-label="Three different learners standing together, one using a wheelchair">
      <circle className="fill-illo-1-tint" cx="150" cy="150" r="150" />
      <g className="stroke-illo-ink" strokeWidth="4">
        <circle className="fill-illo-paper" cx="88" cy="118" r="19" />
        <path className="fill-illo-sun" d="M68 196 V166 a20 20 0 0 1 40 0 V196" />
        <circle className="fill-illo-paper" cx="150" cy="104" r="21" />
        <path className="fill-illo-1" d="M128 196 V158 a22 22 0 0 1 44 0 V196" />
        <circle className="fill-illo-paper" cx="213" cy="126" r="19" />
        <path className="fill-illo-2-soft" d="M198 170 V152 a15 15 0 0 1 30 0 V170" />
        <path d="M228 170 H246 V184" fill="none" />
        <circle className="fill-illo-paper" cx="206" cy="186" r="19" />
        <circle className="fill-illo-ink" cx="206" cy="186" r="3" />
      </g>
      <rect className="fill-illo-1" x="50" y="198" width="200" height="12" rx="6" />
      <rect className="fill-illo-1" x="196" y="48" width="52" height="52" rx="12" />
      <Letter x="222" y="88" size="34">J</Letter>
    </svg>
  );
}

function DiscoverArt() {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-auto" role="img" aria-label="A dotted path with two steps leading up a hill to a flag, with a compass">
      <circle className="fill-illo-2-tint" cx="150" cy="150" r="150" />
      <path className="fill-illo-2-soft" d="M44 244 L196 128 L240 244Z" />
      <path className="stroke-illo-2" d="M78 244 C130 232 150 210 168 188 C186 170 196 150 196 128" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 12" />
      <circle className="fill-illo-paper stroke-illo-ink" cx="108" cy="228" r="11" strokeWidth="4" />
      <circle className="fill-illo-paper stroke-illo-ink" cx="150" cy="196" r="11" strokeWidth="4" />
      <path className="stroke-illo-ink" d="M196 128 V84" strokeWidth="5" strokeLinecap="round" />
      <path className="fill-illo-3 stroke-illo-ink" d="M198 86 H234 L222 98 L234 110 H198Z" strokeWidth="4" strokeLinejoin="round" />
      <circle className="fill-illo-paper stroke-illo-ink" cx="82" cy="118" r="36" strokeWidth="5" />
      <path className="fill-illo-2" d="M82 92 L94 118 L82 144 L70 118Z" />
      <circle className="fill-illo-ink" cx="82" cy="118" r="4" />
      <rect className="fill-illo-2" x="208" y="176" width="52" height="52" rx="12" />
      <Letter x="234" y="216" size="34">D</Letter>
    </svg>
  );
}

function KnowledgeArt() {
  return (
    <svg viewBox="0 0 300 300" className="w-full h-auto" role="img" aria-label="A glowing light bulb above a stack of books">
      <circle className="fill-illo-3-tint" cx="150" cy="150" r="150" />
      <g className="stroke-illo-3" strokeWidth="5" strokeLinecap="round">
        <path d="M150 42 V62" />
        <path d="M98 66 L112 80" />
        <path d="M202 66 L188 80" />
        <path d="M78 112 H98" />
        <path d="M202 112 H222" />
      </g>
      <path className="fill-illo-sun stroke-illo-ink" d="M126 168 V158 C108 148 104 130 106 118 a44 44 0 0 1 88 0 c2 12 -2 30 -20 40 V168Z" strokeWidth="5" strokeLinejoin="round" />
      <path className="stroke-illo-ink" d="M130 184 H170 M138 196 H162" strokeWidth="5" strokeLinecap="round" />
      <rect className="fill-illo-3 stroke-illo-ink" x="96" y="214" width="116" height="24" rx="6" strokeWidth="5" />
      <rect className="fill-illo-2 stroke-illo-ink" x="102" y="240" width="108" height="22" rx="6" strokeWidth="5" />
      <rect className="fill-illo-1 stroke-illo-ink" x="88" y="264" width="130" height="24" rx="6" strokeWidth="5" />
      <rect className="fill-illo-3" x="24" y="226" width="54" height="54" rx="12" />
      <Letter x="51" y="266" size="34" ink>K</Letter>
    </svg>
  );
}

const STEPS = [
  null,
  { key: 'J', label: 'J — JUST', color: 'text-brand', title: 'Learning that’s fair for everyone', text: 'Education should be simple, inclusive, and accessible to everyone.', Art: JustArt },
  { key: 'D', label: 'D — DISCOVER', color: 'text-success', title: 'Explore, grow, and overcome', text: 'Every learner deserves the opportunity to explore new ideas, develop skills, and overcome learning challenges.', Art: DiscoverArt },
  { key: 'K', label: 'K — KNOWLEDGE', color: 'text-warning', title: 'Knowledge that opens doors', text: 'Learning empowers individuals to grow, solve problems, and create better opportunities for their future.', Art: KnowledgeArt },
];

function Dots({ step }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {STEPS.map((_, i) => (
        <span key={i} className={`h-2.5 rounded-full ${i === step ? 'w-8 bg-brand' : 'w-2.5 bg-brand/30'}`} />
      ))}
    </div>
  );
}

function Chips() {
  const chips = [
    ['J', 'Just', 'text-brand'],
    ['D', 'Discover', 'text-success'],
    ['K', 'Knowledge', 'text-warning'],
  ];
  return (
    <ul className="flex flex-wrap justify-center lg:justify-start gap-2 mt-5">
      {chips.map(([k, word, color]) => (
        <li key={k} className={`rounded-full bg-surface-raised px-4 py-2 font-bold ${color}`}>
          <span aria-hidden="true">{k}</span> {word}
        </li>
      ))}
    </ul>
  );
}

export default function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const finish = () => navigate(user ? '/dashboard' : '/register');
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex flex-col px-6 sm:px-8 py-4 sm:py-8">
      <header className="w-full max-w-md lg:max-w-5xl mx-auto flex items-center justify-between h-10">
        {step > 0 ? <span className="font-extrabold text-xl text-text">JDK <span className="text-brand">Learn</span></span> : <span />}
        {step > 0 && !last && (
          <button className="font-semibold text-text-muted hover:text-brand min-h-[44px] px-2" onClick={finish}>Skip</button>
        )}
      </header>

      <main className="flex-1 w-full max-w-md lg:max-w-5xl mx-auto grid lg:grid-cols-2 gap-6 lg:gap-16 items-center content-center py-4" aria-live="polite">
        <p className="sr-only">Step {step + 1} of {STEPS.length}</p>

        {step === 0 ? (
          <>
            <div className="text-center lg:text-left lg:order-2">
              <span className="inline-grid place-items-center w-16 h-16 sm:w-20 sm:h-20 rounded-[1.4rem] bg-brand text-brand-contrast" aria-hidden="true">
                <GraduationCap size={38} />
              </span>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mt-5 text-text">
                JDK <span className="text-brand">Learn</span>
              </h1>
              <p className="mt-4 font-bold tracking-[0.25em] text-text text-sm sm:text-base">JUST &middot; DISCOVER &middot; KNOWLEDGE</p>
              <p className="text-text mt-5 text-lg sm:text-xl leading-relaxed">
                Education should be simple, inclusive, and accessible to everyone &mdash; even without the internet.
              </p>
              <div className="hidden lg:block mt-8 max-w-sm">
                <Actions user={user} onStart={() => (user ? navigate('/dashboard') : setStep(1))} />
              </div>
            </div>
            <div className="lg:order-1">
              <div className="max-w-[17rem] sm:max-w-xs lg:max-w-none mx-auto lg:mx-0"><WelcomeArt /></div>
              <div className="lg:hidden"><Chips /></div>
              <div className="flex justify-center lg:justify-start mt-5 lg:mt-3"><Dots step={step} /></div>
              <div className="hidden lg:block"><Chips /></div>
            </div>
            <div className="lg:hidden">
              <Actions user={user} onStart={() => (user ? navigate('/dashboard') : setStep(1))} />
            </div>
          </>
        ) : (
          <>
            <div className="max-w-[20rem] sm:max-w-sm w-full mx-auto lg:max-w-md"><s.Art /></div>
            <div>
              <p className={`font-extrabold tracking-[0.2em] text-sm ${s.color}`}>{s.label}</p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mt-3 text-text leading-tight">{s.title}</h1>
              <p className="text-text mt-4 text-lg sm:text-xl leading-relaxed">{s.text}</p>
              {last && <p className="muted mt-4">Sign-up needs internet once. After that, lessons work offline.</p>}
              {last ? (
                <div className="mt-6">
                  <div className="flex justify-center lg:justify-start mb-5"><Dots step={step} /></div>
                  <div className="flex items-center gap-3">
                    {step > 0 && (
                      <button className="secondary text-lg !py-4 px-6" onClick={() => setStep(step - 1)}>Back</button>
                    )}
                    <button className="primary flex-1 text-lg !py-4" onClick={finish}>
                      {user ? 'Continue learning' : 'Start Learning'} <ArrowRight size={22} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-8 flex items-center justify-between gap-3">
                  <Dots step={step} />
                  <div className="flex items-center gap-2 ml-auto">
                    {step > 0 && (
                      <button className="text-text-muted font-semibold hover:text-brand min-h-[44px] px-3" onClick={() => setStep(step - 1)}>Back</button>
                    )}
                    <button className="primary text-lg !py-4 px-8" onClick={() => setStep(step + 1)}>
                      Next <ArrowRight size={22} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Actions({ user, onStart }) {
  return (
    <>
      <button className="primary w-full text-lg !py-4" onClick={onStart}>
        {user ? 'Continue learning' : 'Get Started'} <ArrowRight size={22} aria-hidden="true" />
      </button>
      {!user && (
        <p className="mt-4 text-center">
          <Link to="/login" className="font-bold text-brand">I already have an account</Link>
        </p>
      )}
    </>
  );
}
