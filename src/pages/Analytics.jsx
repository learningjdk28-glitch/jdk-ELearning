import { useEffect, useRef, useState } from 'react';
import { Bot, Send, WifiOff } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { askAnalytics, isChatbotConfigured } from '../services/analyticsChat.js';
import { BackHeader, Callout } from '../components/ui.jsx';

const SUGGESTIONS = [
  'How many learners took each quiz, and what was the average score?',
  'Which competency is weakest across all learners?',
  'Which 5 questions are answered wrong most often?',
  'How many learners finished each Networking Basics module?',
  'Compare average scores of the pre-test and the lesson quizzes.',
];

export default function Analytics() {
  const { online } = useLearner();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy]);

  async function send(question) {
    const q = question.trim();
    if (!q || busy) return;
    setError('');
    setText('');
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const reply = await askAnalytics(next);
      setMessages([...next, { role: 'assistant', content: reply || 'No answer was returned.' }]);
    } catch (e) {
      setError(e.message);
      setMessages(messages); // drop the unanswered question so the history stays valid
      setText(q);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 11rem)' }}>
      <BackHeader title="Learning analytics assistant" to="/admin" />
      <p className="text-slate-600 mb-4">
        Ask questions about quiz results and progress. Answers come from read-only, anonymous data: learners appear only as a short code, never by name or email. Results from small groups are a small sample.
      </p>

      {!isChatbotConfigured && (
        <div className="mb-4">
          <Callout tone="warn">The analytics service is not connected. Set <b>VITE_CHATBOT_URL</b> to the chatbot address, then rebuild the app.</Callout>
        </div>
      )}
      {!online && (
        <div className="mb-4">
          <Callout tone="warn"><WifiOff size={16} className="inline mr-1" aria-hidden="true" />Analytics needs internet. Lessons and quizzes still work offline.</Callout>
        </div>
      )}

      <div className="flex-1 panel p-4 sm:p-5 space-y-3 overflow-y-auto" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div>
            <div className="flex items-center gap-2 text-slate-700 font-bold"><Bot size={20} aria-hidden="true" /> Try a question</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="secondary text-left !rounded-2xl" disabled={busy || !online || !isChatbotConfigured} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-2xl px-4 py-3 max-w-[90%] whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-brand text-white' : 'bg-indigo-50 text-slate-900'}`}
              aria-label={m.role === 'user' ? 'You said' : 'Assistant said'}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <p className="muted">Analyzing the data...</p>}
        <div ref={end} />
      </div>

      {error && (
        <div className="mt-3" role="alert">
          <Callout tone="bad">{error}</Callout>
        </div>
      )}

      <form
        className="flex gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Your question</span>
          <input
            className="field !mt-0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            placeholder="Ask an analytics question..."
            disabled={!online || !isChatbotConfigured}
            autoComplete="off"
          />
        </label>
        <button className="primary min-h-[44px]" disabled={busy || !text.trim() || !online || !isChatbotConfigured}>
          <Send size={18} aria-hidden="true" /> Send
        </button>
      </form>
    </div>
  );
}
