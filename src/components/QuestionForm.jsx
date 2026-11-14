import { Plus, Save, X } from 'lucide-react';
import { COMPETENCY_NAMES, DIFFICULTY_NAMES, QUESTION_LIMITS } from '../lib/questionRules.js';
import { panel } from './AdminUI.jsx';

/** Multiple-choice question editor shared by the pre-test and the quizzes. `modules` adds a module picker. */
export default function QuestionForm({ form, setForm, modules = null, error, busy, onSubmit, explanationHint = 'optional, shown to students when they review their answers' }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setOption = (i, value) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? value : o)) }));
  return (
    <form onSubmit={onSubmit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg text-text">{form.id ? 'Edit question' : 'New question'}</h2>
        <button type="button" className="secondary" aria-label="Close" onClick={() => setForm(null)}><X size={16} aria-hidden="true" /></button>
      </div>
      {modules && (
        <label className="block text-sm font-semibold text-text">Module this question tests
          <select className="field" value={form.module_id || ''} onChange={(e) => set({ module_id: e.target.value })}>
            {modules.map((m, i) => <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm font-semibold text-text">Question
        <textarea className="field min-h-20 font-normal" maxLength={QUESTION_LIMITS.prompt} value={form.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-text">Answer options — select the correct one</legend>
        {form.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} className="accent-brand w-4 h-4" checked={form.correct_index === i} onChange={() => set({ correct_index: i })} />
            <input className="field mt-0 flex-1" maxLength={QUESTION_LIMITS.option} placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => setOption(i, e.target.value)} />
            {form.options.length > QUESTION_LIMITS.minOptions && (
              <button type="button" className="secondary !p-2" aria-label={`Remove option ${i + 1}`}
                onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i), correct_index: f.correct_index === i ? null : f.correct_index > i ? f.correct_index - 1 : f.correct_index }))}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {form.options.length < QUESTION_LIMITS.maxOptions && <button type="button" className="secondary text-sm" onClick={() => set({ options: [...form.options, ''] })}><Plus size={14} aria-hidden="true" /> Add option</button>}
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm font-semibold text-text">Competency (optional)
          <select className="field" value={form.competency} onChange={(e) => set({ competency: e.target.value })}>
            <option value="">—</option>
            {COMPETENCY_NAMES.map((c, i) => <option key={c} value={i}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-text">Difficulty (optional)
          <select className="field" value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
            <option value="">—</option>
            {DIFFICULTY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-text">Explanation ({explanationHint})
        <textarea className="field min-h-16 font-normal" maxLength={QUESTION_LIMITS.explanation} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
      </label>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> Save question</button>
        <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
      </div>
    </form>
  );
}
