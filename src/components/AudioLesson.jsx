import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { Callout } from './ui.jsx';

// Auditory mode reads the lesson aloud with the device's own text-to-speech voice (Web Speech API).
// No audio files are bundled. It works offline when the device has an offline voice installed.
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function pickVoice(voices) {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  return en.find((v) => v.localService) || en[0] || voices.find((v) => v.localService) || voices[0] || null;
}

/** items: [{ label, text }] read in order. Shows a transcript and highlights the line being read. */
export default function AudioLesson({ items, resetKey }) {
  const [status, setStatus] = useState('idle'); // idle | playing | paused
  const [index, setIndex] = useState(-1);
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState(null);
  const run = useRef(0); // invalidates callbacks from an earlier playback

  useEffect(() => {
    if (!supported) return undefined;
    const load = () => setVoice(pickVoice(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    if (supported) window.speechSynthesis.cancel();
    setStatus('idle');
    setIndex(-1);
  }, []);

  // Stop when leaving the lesson or when the text changes (level or mode switched).
  useEffect(() => stop, [stop, resetKey]);

  const speakFrom = useCallback(
    (start) => {
      if (!supported) return;
      run.current += 1;
      const token = run.current;
      window.speechSynthesis.cancel();
      const next = (i) => {
        if (token !== run.current) return;
        if (i >= items.length) {
          setStatus('idle');
          setIndex(-1);
          return;
        }
        const u = new SpeechSynthesisUtterance(items[i].text);
        u.rate = rate;
        u.lang = voice?.lang || 'en-US';
        if (voice) u.voice = voice;
        u.onstart = () => token === run.current && setIndex(i);
        u.onend = () => next(i + 1);
        u.onerror = (e) => {
          if (token !== run.current || e.error === 'canceled' || e.error === 'interrupted') return;
          setStatus('idle');
          setIndex(-1);
        };
        window.speechSynthesis.speak(u);
      };
      setStatus('playing');
      setIndex(start);
      next(start);
    },
    [items, rate, voice],
  );

  const toggle = () => {
    if (status === 'idle') speakFrom(0);
    else if (status === 'playing') {
      window.speechSynthesis.pause();
      setStatus('paused');
    } else {
      window.speechSynthesis.resume();
      setStatus('playing');
    }
  };

  if (!supported) {
    return (
      <Callout tone="warn">
        This browser cannot read aloud. You can still read the transcript below, or switch to Read/Write or Visual mode.
      </Callout>
    );
  }

  return (
    <section aria-label="Audio lesson">
      <div className="rounded-3xl bg-violet-50 border border-violet-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button className="primary min-w-[10rem]" onClick={toggle} aria-label={status === 'playing' ? 'Pause lesson audio' : status === 'paused' ? 'Resume lesson audio' : 'Play lesson audio'}>
            {status === 'playing' ? <Pause size={20} /> : <Play size={20} />}
            {status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Listen to lesson'}
          </button>
          <button className="secondary" onClick={stop} disabled={status === 'idle'} aria-label="Stop lesson audio">
            <Square size={16} aria-hidden="true" /> Stop
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Speed
            <select
              className="border border-violet-200 rounded-xl min-h-[44px] px-2 bg-white"
              value={rate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setRate(r);
                if (status !== 'idle') stop();
              }}
            >
              <option value={0.8}>Slow</option>
              <option value={1}>Normal</option>
              <option value={1.25}>Fast</option>
            </select>
          </label>
        </div>
        <p className="muted mt-3">
          {voice
            ? `Voice: ${voice.name}${voice.localService ? ' (stored on this device, works offline)' : ' (online voice: needs internet)'}`
            : 'Using the default voice of this device.'}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <h3 className="font-extrabold">Transcript</h3>
        {items.map((it, i) => (
          <div
            key={it.label + i}
            className={`rounded-2xl p-4 border-2 ${index === i ? 'border-violet-500 bg-violet-50' : 'border-transparent bg-slate-50'}`}
            aria-current={index === i ? 'true' : undefined}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{it.label}</p>
            <p className="text-lg leading-8 mt-1">{it.text}</p>
            <button className="text-sm underline text-brand font-semibold mt-1 min-h-[44px]" onClick={() => speakFrom(i)} aria-label={`Play from: ${it.label}`}>
              Play from here
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
