import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';

// Reads a page aloud with the device's own voice (Web Speech API). No audio files; works offline with an offline voice.
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function pickVoice(voices) {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  return en.find((v) => v.localService) || en[0] || voices.find((v) => v.localService) || voices[0] || null;
}

/** parts: strings read in order. Playback stops when the parts change (another page or version). */
export default function ReadAloud({ parts }) {
  const [status, setStatus] = useState('idle'); // idle | playing | paused
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState(null);
  const run = useRef(0); // invalidates callbacks from an earlier playback
  const key = parts.join('\n');

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
  }, []);
  useEffect(() => stop, [stop, key]);

  function play() {
    run.current += 1;
    const token = run.current;
    window.speechSynthesis.cancel();
    const next = (i) => {
      if (token !== run.current) return;
      if (i >= parts.length) { setStatus('idle'); return; }
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.rate = rate;
      u.lang = voice?.lang || 'en-US';
      if (voice) u.voice = voice;
      u.onend = () => next(i + 1);
      u.onerror = (e) => { if (token === run.current && e.error !== 'canceled' && e.error !== 'interrupted') setStatus('idle'); };
      window.speechSynthesis.speak(u);
    };
    setStatus('playing');
    next(0);
  }
  function toggle() {
    if (status === 'idle') play();
    else if (status === 'playing') { window.speechSynthesis.pause(); setStatus('paused'); }
    else { window.speechSynthesis.resume(); setStatus('playing'); }
  }

  if (!supported || parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Read this page aloud" role="group">
      <button type="button" className="secondary text-sm" onClick={toggle}
        aria-label={status === 'playing' ? 'Pause reading' : status === 'paused' ? 'Resume reading' : 'Listen to this page'}>
        {status === 'playing' ? <Pause size={16} aria-hidden="true" /> : status === 'paused' ? <Play size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        {status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Listen'}
      </button>
      {status !== 'idle' && <button type="button" className="secondary text-sm" onClick={stop} aria-label="Stop reading"><Square size={14} aria-hidden="true" /> Stop</button>}
      <label className="text-sm text-text-muted flex items-center gap-1">Speed
        <select className="field mt-0 w-auto py-1 text-sm" value={rate} onChange={(e) => { setRate(Number(e.target.value)); stop(); }}>
          <option value={0.8}>Slow</option>
          <option value={1}>Normal</option>
          <option value={1.25}>Fast</option>
        </select>
      </label>
      {voice && !voice.localService && status !== 'idle' && <span className="text-xs text-text-muted">This voice needs internet.</span>}
    </div>
  );
}
