import { useEffect, useRef, useState } from 'react';
import { Bot, X, Minus, Send, BookOpen, CircleHelp, Lightbulb, ListChecks, BarChart3, TrendingDown, Users, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { askAnalytics } from '../services/analyticsChat.js';
import { askAssistant, isAssistantConfigured } from '../services/assistantChat.js';
import { offlineAnswer } from '../lib/offlineAnswer.js';
import { GLOSSARY } from '../data/glossary.js';

const MODES = {
  learn: {
    title: 'JDK Assistant',
    subtitle: 'Your learning companion',
    intro: 'How can I help you today?',
    placeholder: 'Type your message...',
    prompts: [
      ['Explain a topic', BookOpen],
      ['Help with a quiz', CircleHelp],
      ['Give study tips', Lightbulb],
      ['Tell me about Networking Basics', ListChecks],
    ],
  },
  analytics: {
    title: 'Analytics Assistant',
    subtitle: 'Learner results and progress',
    intro: 'I only answer analytics questions about quiz results and progress.',
    placeholder: 'Ask about your data...',
    prompts: [
      ['Average quiz score by course', BarChart3],
      ['Which competency is weakest?', TrendingDown],
      ['Top 5 most missed questions', ListChecks],
      ['Module completion for Networking Basics', Users],
    ],
  },
};

// Errors where the saved FAQs are a better answer than an error message.
const useFallback = (e) => !e.status || e.status === 404 || e.status >= 500;

/** Floating chat button and panel, fixed at the bottom right on every page. */
export default function ChatWidget() {
  const { user, isAdmin } = useAuth();
  const { online } = useLearner();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('learn');
  const [chats, setChats] = useState({ learn: [], analytics: [] });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const input = useRef(null);

  const view = isAdmin ? mode : 'learn';
  const cfg = MODES[view];
  const messages = chats[view];
  const first = (user?.name || user?.email || 'there').split(/[ @]/)[0];
  const offlineLearn = view === 'learn' && (!online || !isAssistantConfigured);
  const blocked = view === 'analytics' && (!online || !isAssistantConfigured);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const setMessages = (key, list) => setChats((c) => ({ ...c, [key]: list }));

  async function send(question) {
    const q = question.trim();
    if (!q || busy || blocked) return;
    const key = view;
    setError('');
    setText('');
    const next = [...chats[key], { role: 'user', content: q }];
    setMessages(key, next);
    setBusy(true);
    try {
      if (key === 'learn') {
        let reply;
        let local = false;
        if (offlineLearn) {
          reply = offlineAnswer(q, GLOSSARY);
          local = true;
        } else {
          try {
            reply = await askAssistant(next.filter((m) => !m.local));
          } catch (e) {
            if (!useFallback(e)) throw e;
            reply = offlineAnswer(q, GLOSSARY);
            local = true;
          }
        }
        setMessages(key, [...next, { role: 'assistant', content: reply || 'No answer was returned.', local }]);
      } else {
        const reply = await askAnalytics(next);
        setMessages(key, [...next, { role: 'assistant', content: reply || 'No answer was returned.' }]);
      }
    } catch (e) {
      setError(e.message);
      setMessages(key, chats[key]);
      setText(q);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed right-4 bottom-24 md:bottom-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <section
          aria-label={cfg.title}
          className="w-[min(22rem,calc(100vw-2rem))] h-[min(34rem,calc(100dvh-9.5rem))] bg-white rounded-2xl shadow-2xl border border-indigo-100 flex flex-col overflow-hidden"
        >
          <header className="bg-brand text-white px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-white/20 grid place-items-center" aria-hidden="true"><Bot size={20} /></span>
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight truncate">{cfg.title}</div>
              <div className="text-xs text-white/80 truncate">{cfg.subtitle}</div>
            </div>
            <button type="button" aria-label="Minimize chat" className="p-1 rounded hover:bg-white/20" onClick={() => setOpen(false)}><Minus size={18} /></button>
            <button
              type="button"
              aria-label="Close and clear chat"
              className="p-1 rounded hover:bg-white/20"
              onClick={() => { setOpen(false); setChats({ learn: [], analytics: [] }); setError(''); }}
            >
              <X size={18} />
            </button>
          </header>

          {isAdmin && (
            <div className="flex bg-brand-soft p-1 gap-1" role="tablist" aria-label="Assistant type">
              {[['learn', 'Learning'], ['analytics', 'Analytics']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => { setMode(id); setError(''); }}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-semibold ${mode === id ? 'bg-white text-brand shadow-sm' : 'text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface" aria-live="polite">
            <div className="bg-brand-soft text-slate-900 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
              Hi, {first}! {cfg.intro}
            </div>
            {messages.length === 0 && (
              <div className="space-y-2">
                {cfg.prompts.map(([label, Icon]) => (
                  <button
                    key={label}
                    type="button"
                    disabled={busy || blocked}
                    onClick={() => send(label)}
                    className="w-full flex items-center gap-3 text-left bg-brand-soft hover:bg-indigo-100 disabled:opacity-60 rounded-full px-4 py-2.5 font-semibold text-slate-800"
                  >
                    <Icon size={18} className="text-brand shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-2xl px-4 py-2.5 max-w-[90%] whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-brand text-white rounded-tr-sm' : 'bg-brand-soft text-slate-900 rounded-tl-sm'}`}>
                  {m.content}
                  {m.local && <div className="mt-1 text-xs text-slate-600 flex items-center gap-1"><WifiOff size={12} aria-hidden="true" /> Saved answer (offline)</div>}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm text-slate-600">Thinking...</p>}
            {offlineLearn && messages.length === 0 && (
              <p className="text-sm text-amber-800 flex items-center gap-1" role="status"><WifiOff size={14} aria-hidden="true" /> Offline: I answer from saved FAQs and the glossary.</p>
            )}
            {blocked && <p className="text-sm text-amber-800" role="alert">{online ? 'Analytics service not connected (VITE_CHATBOT_URL).' : 'Analytics needs internet.'}</p>}
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <div ref={end} />
          </div>

          <form className="flex items-center gap-2 p-3 border-t border-indigo-100 bg-white" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label className="flex-1">
              <span className="sr-only">Your message</span>
              <input
                ref={input}
                className="w-full rounded-full border border-indigo-200 bg-brand-soft/40 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                placeholder={cfg.placeholder}
                disabled={blocked}
                autoComplete="off"
              />
            </label>
            <button type="submit" aria-label="Send" disabled={busy || blocked || !text.trim()} className="w-11 h-11 rounded-full bg-brand text-white grid place-items-center disabled:opacity-50">
              <Send size={18} />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        aria-label={open ? 'Hide chat assistant' : 'Open chat assistant'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative w-16 h-16 rounded-full bg-brand text-white grid place-items-center shadow-xl hover:bg-brand-dark"
      >
        <Bot size={30} aria-hidden="true" />
        <span className={`absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-amber-500'}`} aria-hidden="true" />
      </button>
    </div>
  );
}
