import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { listManagedCourses, listModules } from '../services/lms.js';
import { deleteQuestion, deleteQuiz, listQuestions, listQuizzesAdmin, quizError, quizResults, saveQuestion, saveQuiz, setQuizPublished } from '../services/quizzes.js';
import { COMPETENCY_NAMES, DIFFICULTY_NAMES, questionError } from '../lib/questionRules.js';
import { dueLabel, toLocalInput } from '../lib/submissionRules.js';
import QuestionForm from '../components/QuestionForm.jsx';
import { AdminHeading, Empty, Notice, Status, panel } from '../components/AdminUI.jsx';

const blankQuiz = () => ({ id: null, title: '', pass_mark: 70, due_at: '', allow_late: true });
const blankQuestion = () => ({ id: null, prompt: '', options: ['', '', '', ''], correct_index: null, competency: '', difficulty: '', explanation: '' });
const formatWhen = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Instructor quizzes: settings with an optional deadline, questions with explanations, results per student. */
export default function AdminAssessments() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [modules, setModules] = useState([]);
  const [moduleId, setModuleId] = useState('');
  const [quizzes, setQuizzes] = useState(null);
  const [quizId, setQuizId] = useState('');
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  useEffect(() => {
    if (!course) return;
    setModules([]); setModuleId('');
    listModules(course).then((m) => { setModules(m); setModuleId(m[0]?.id || ''); }).catch((e) => setError(e.message));
  }, [course]);
  const loadQuizzes = useCallback(async (selectId) => {
    if (!moduleId) { setQuizzes([]); return; }
    try {
      const list = await listQuizzesAdmin(moduleId);
      setQuizzes(list);
      setQuizId((current) => selectId || (list.some((q) => q.id === current) ? current : list[0]?.id || ''));
    } catch (e) { setError(e.message); setQuizzes([]); }
  }, [moduleId]);
  useEffect(() => { setQuizzes(null); setSettings(null); loadQuizzes(); }, [loadQuizzes]);

  async function run(action, ok) {
    setBusy(true); setError(''); setInfo('');
    try { const out = await action(); setInfo(ok); return out ?? true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    const problem = quizError(settings);
    if (problem) { setSettings((s) => ({ ...s, error: problem })); return; }
    const row = await run(() => saveQuiz(moduleId, settings), settings.id ? 'Quiz settings saved.' : 'Quiz created. Add questions, then publish it.');
    if (row) { setSettings(null); await loadQuizzes(row.id); }
  }

  const active = quizzes?.find((q) => q.id === quizId);

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Quizzes" description="Multiple-choice quizzes, scored in the database. Set an optional deadline; students see which answers they got right and your explanations."
        action={<Link to="/admin/content" className="secondary"><BookOpen size={16} aria-hidden="true" /> Manage modules</Link>} />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 grid md:grid-cols-2 gap-4`}>
            <label className="font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="font-bold text-sm text-text">Module
              <select className="field" value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={modules.length === 0}>
                {modules.length === 0 && <option value="">No modules yet</option>}
                {modules.map((m, i) => <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>)}
              </select>
            </label>
          </div>

          {!moduleId ? <Empty text="Add a module to this course first." to="/admin/content" action="Add modules" /> : quizzes === null ? <p className="muted" role="status">Loading quizzes...</p> : (
            <div className="grid xl:grid-cols-[320px_1fr] gap-5 items-start">
              <aside className={`${panel} p-4 space-y-2`} aria-label="Quizzes in this module">
                <button className="primary w-full justify-center" disabled={busy} onClick={() => setSettings(blankQuiz())}><Plus size={16} aria-hidden="true" /> New quiz</button>
                {quizzes.length === 0 && <p className="text-text-muted text-sm p-2">No quizzes in this module yet.</p>}
                {quizzes.map((q) => (
                  <button key={q.id} onClick={() => { setQuizId(q.id); setSettings(null); }} aria-current={quizId === q.id || undefined}
                    className={`w-full p-3 border rounded-xl text-left ${quizId === q.id ? 'bg-brand-soft border-brand/50' : 'border-border bg-surface-raised'}`}>
                    <p className="font-bold text-text">{q.title}</p>
                    <p className="text-xs text-text-muted mt-1">Pass {q.pass_mark}% · {q.published ? 'Published' : 'Draft'}{q.due_at ? ` · ${dueLabel(q.due_at)}` : ''}</p>
                  </button>
                ))}
              </aside>

              <div className="space-y-5 min-w-0">
                {settings && <SettingsForm form={settings} setForm={setSettings} busy={busy} onSubmit={saveSettings} />}
                {active ? (
                  <QuizDetail key={active.id} quiz={active} busy={busy} run={run}
                    onEdit={() => setSettings({ ...active, due_at: active.due_at ? toLocalInput(active.due_at) : '' })}
                    onChanged={loadQuizzes} onDeleted={() => { setQuizId(''); loadQuizzes(); }} />
                ) : !settings && (
                  <div className={`${panel} p-8 text-center text-text-muted`}><ClipboardCheck size={34} className="mx-auto text-brand mb-3" aria-hidden="true" />Choose or create a quiz to edit its questions.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SettingsForm({ form, setForm, busy, onSubmit }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch, error: '' }));
  return (
    <form onSubmit={onSubmit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg text-text">{form.id ? 'Quiz settings' : 'New quiz'}</h2>
        <button type="button" className="secondary" aria-label="Close" onClick={() => setForm(null)}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-semibold text-text sm:col-span-2">Title
          <input className="field" maxLength={160} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Pass mark (%)
          <input className="field" type="number" min={0} max={100} value={form.pass_mark} onChange={(e) => set({ pass_mark: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Deadline (optional)
          <input className="field" type="datetime-local" value={form.due_at} onChange={(e) => set({ due_at: e.target.value })} />
        </label>
      </div>
      {form.due_at && (
        <label className="flex items-center gap-2 text-text">
          <input type="checkbox" className="accent-brand w-4 h-4" checked={form.allow_late} onChange={(e) => set({ allow_late: e.target.checked })} />
          Accept attempts after the deadline (marked late)
        </label>
      )}
      {form.due_at && !form.allow_late && <p className="text-sm text-warning">After the deadline students cannot take this quiz, so they cannot pass it or finish the module.</p>}
      {form.error && <p role="alert" className="text-danger text-sm">{form.error}</p>}
      <div className="flex gap-2">
        <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> {form.id ? 'Save settings' : 'Create quiz'}</button>
        {form.due_at && <button type="button" className="secondary" onClick={() => set({ due_at: '', allow_late: true })}>Remove deadline</button>}
      </div>
    </form>
  );
}

function QuizDetail({ quiz, busy, run, onEdit, onChanged, onDeleted }) {
  const [tab, setTab] = useState('questions');
  const [questions, setQuestions] = useState(null);
  const [results, setResults] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [q, r] = await Promise.all([listQuestions(quiz.id), quizResults(quiz.id)]);
      setQuestions(q); setResults(r);
    } catch (e) { setLoadError(e.message); setQuestions([]); setResults([]); }
  }, [quiz.id]);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    const options = form.options.map((o) => o.trim()).filter((o, i) => o || i === form.correct_index);
    const correct = form.correct_index == null ? null : options.indexOf(form.options[form.correct_index].trim());
    const row = { ...form, options, correct_index: correct, position: form.id ? form.position : questions.length };
    const problem = questionError(row);
    setFormError(problem);
    if (problem) return;
    if (await run(() => saveQuestion(quiz.id, row), form.id ? 'Question updated.' : 'Question added.')) { setForm(null); await load(); }
  }
  async function remove(q, i) {
    if (!window.confirm(`Delete question ${i + 1}?`)) return;
    if (await run(() => deleteQuestion(q.id), 'Question deleted.')) await load();
  }
  async function togglePublish() {
    if (await run(() => setQuizPublished(quiz.id, !quiz.published), quiz.published ? 'Quiz hidden from students.' : 'Quiz published.')) await onChanged();
  }
  async function removeQuiz() {
    const n = results?.filter((r) => Number(r.attempts) > 0).length || 0;
    if (!window.confirm(`Delete "${quiz.title}", its questions and the attempts of ${n} student(s)? This cannot be undone.`)) return;
    if (await run(() => deleteQuiz(quiz.id), 'Quiz deleted.')) onDeleted();
  }

  const tried = results?.filter((r) => Number(r.attempts) > 0) || [];
  return (
    <>
      <section className={`${panel} p-5 sm:p-6`}>
        <div className="flex flex-wrap justify-between gap-3 items-start">
          <div className="min-w-0">
            <h2 className="font-black text-xl text-text">{quiz.title}</h2>
            <p className="text-text-muted text-sm mt-1">
              Pass mark {quiz.pass_mark}% · {questions ? `${questions.length} question${questions.length === 1 ? '' : 's'}` : '...'}
              {quiz.due_at ? ` · due ${formatWhen(quiz.due_at)} (${dueLabel(quiz.due_at).toLowerCase()}) · ${quiz.allow_late ? 'late attempts accepted' : 'closes at the deadline'}` : ' · no deadline'}
            </p>
          </div>
          <Status value={quiz.published} />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="primary" disabled={busy || (!quiz.published && !questions?.length)} title={!questions?.length ? 'Add questions first' : undefined} onClick={togglePublish}>
            {quiz.published ? 'Unpublish' : 'Publish'}
          </button>
          <button className="secondary" disabled={busy} onClick={onEdit}><Pencil size={16} aria-hidden="true" /> Settings</button>
          <button className="secondary !text-danger" disabled={busy} onClick={removeQuiz}><Trash2 size={16} aria-hidden="true" /> Delete</button>
        </div>
      </section>

      {loadError && <Notice error={loadError} />}
      <div role="tablist" aria-label="Quiz sections" className="flex gap-2">
        {[['questions', `Questions (${questions?.length ?? '…'})`], ['results', `Results (${tried.length})`]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold border ${tab === id ? 'bg-brand text-brand-contrast border-brand' : 'bg-surface-raised text-text border-border'}`}>{label}</button>
        ))}
      </div>

      {tab === 'questions' ? (
        <section className="space-y-3" aria-label="Questions">
          {form ? <QuestionForm form={form} setForm={setForm} error={formError} busy={busy} onSubmit={save} />
            : <button className="secondary" disabled={busy} onClick={() => { setForm(blankQuestion()); setFormError(''); }}><Plus size={16} aria-hidden="true" /> Add question</button>}
          {questions === null ? <p className="muted" role="status">Loading questions...</p> : questions.length === 0 ? (
            <p className={`${panel} p-6 text-text-muted`}>No questions yet. Add at least one before publishing.</p>
          ) : (
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li key={q.id} className={`${panel} p-4 flex flex-wrap items-start justify-between gap-3`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">{i + 1}. {q.prompt}</p>
                    <p className="text-sm text-success mt-1">Answer: {q.options[q.correct_index]}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {[q.competency != null && COMPETENCY_NAMES[q.competency], q.difficulty && DIFFICULTY_NAMES[q.difficulty - 1], q.explanation ? 'has explanation' : 'no explanation'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="secondary text-sm" disabled={busy} onClick={() => { setForm({ ...q, competency: q.competency ?? '', difficulty: q.difficulty ?? '', options: [...q.options] }); setFormError(''); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
                    <button className="secondary !text-danger" disabled={busy} aria-label={`Delete question ${i + 1}`} onClick={() => remove(q, i)}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <Results rows={results} passMark={quiz.pass_mark} />
      )}
    </>
  );
}

function Results({ rows, passMark }) {
  if (rows === null) return <p className="muted" role="status">Loading results...</p>;
  if (rows.length === 0) return <p className={`${panel} p-6 text-text-muted`}>No students are enrolled in this course yet.</p>;
  return (
    <ul className="space-y-2" aria-label="Results per student">
      {rows.map((r) => {
        const attempts = Number(r.attempts);
        const badge = attempts === 0 ? ['Not started', 'bg-surface-muted text-text-muted'] : r.passed ? ['Passed', 'bg-success/10 text-success'] : ['Not passed yet', 'bg-warning/10 text-warning'];
        return (
          <li key={r.user_id} className={`${panel} p-4 flex flex-wrap items-center justify-between gap-3`}>
            <div className="min-w-0">
              <p className="font-bold text-text">{r.student_name || 'Unnamed student'}</p>
              <p className="text-sm text-text-muted break-all">{r.student_email}{r.student_number ? ` · ${r.student_number}` : ''}</p>
              {attempts > 0 && <p className="text-sm text-text-muted">{attempts} attempt{attempts === 1 ? '' : 's'} · best {Number(r.best_score)}% (pass {passMark}%) · last {formatWhen(r.last_at)}</p>}
            </div>
            <div className="flex gap-2">
              {r.any_late && <span className="rounded-full px-3 py-1 text-xs font-bold bg-warning/10 text-warning">Late attempt</span>}
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge[1]}`}>{badge[0]}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
