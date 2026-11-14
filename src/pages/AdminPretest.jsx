import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { listManagedCourses } from '../services/lms.js';
import { deletePretestQuestion, getPretestAdmin, listLevels, savePretestQuestion, setPretestSettings } from '../services/content.js';
import { COMPETENCY_NAMES, DIFFICULTY_NAMES, questionError } from '../lib/questionRules.js';
import QuestionForm from '../components/QuestionForm.jsx';
import { levelName } from '../lib/pageVersions.js';
import { AdminHeading, Empty, Notice, Status, panel } from '../components/AdminUI.jsx';

const blank = (moduleId) => ({ id: null, module_id: moduleId, prompt: '', options: ['', '', '', ''], correct_index: null, competency: '', difficulty: '', explanation: '' });

/** Instructor pre-test: questions tagged by module decide where each student starts. */
export default function AdminPretest() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [data, setData] = useState(null);
  const [levels, setLevels] = useState([]);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [passMark, setPassMark] = useState(70);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    Promise.all([listManagedCourses(), listLevels()])
      .then(([c, l]) => { setCourses(c); setLevels(l); setCourse(c[0]?.id || ''); })
      .catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  const load = useCallback(async () => {
    if (!course) return;
    setData(null);
    try { const d = await getPretestAdmin(course); setData(d); setPassMark(d.course.pretest_pass_mark); } catch (e) { setError(e.message); }
  }, [course]);
  useEffect(() => { load(); setForm(null); }, [load]);

  const byModule = useMemo(() => {
    if (!data) return [];
    return data.modules.map((m) => ({ module: m, questions: data.questions.filter((q) => q.module_id === m.id) }));
  }, [data]);
  const uncovered = byModule.filter((g) => g.module.published && g.questions.length === 0);

  async function run(action, ok) {
    setBusy(true); setError(''); setInfo('');
    try { await action(); setInfo(ok); await load(); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  async function save(e) {
    e.preventDefault();
    const options = form.options.map((o) => o.trim()).filter((o, i) => o || i === form.correct_index);
    const correct = form.correct_index == null ? null : options.indexOf(form.options[form.correct_index].trim());
    const row = { ...form, options, correct_index: correct };
    const problem = !row.module_id ? 'Choose the module this question tests.' : questionError(row);
    setFormError(problem);
    if (problem) return;
    const position = form.id ? form.position : data.questions.length;
    if (await run(() => savePretestQuestion(course, { ...row, position }), form.id ? 'Question updated.' : 'Question added.')) setForm(null);
  }

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Pre-test" description="Tag each question with the module it tests. Students start at the first module they score below the pass mark on; modules before it are tested out." />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5`}>
            <label className="block max-w-md font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          </div>

          {!data ? <p className="muted" role="status">Loading pre-test...</p> : (
            <>
              <section className={`${panel} p-5 sm:p-6 grid gap-5 lg:grid-cols-3`}>
                <div>
                  <h2 className="font-black text-lg text-text">Status</h2>
                  <p className="mt-2"><Status value={data.course.pretest_published ? 'active' : 'off'} /> <span className="text-text ml-1">{data.course.pretest_published ? 'Students see the pre-test' : 'Off'}</span></p>
                  <button className="secondary mt-3" disabled={busy || (!data.course.pretest_published && data.questions.length === 0)}
                    title={data.questions.length === 0 ? 'Add questions first' : undefined}
                    onClick={() => run(() => setPretestSettings(course, { pretest_published: !data.course.pretest_published }), data.course.pretest_published ? 'Pre-test turned off.' : 'Pre-test turned on.')}>
                    {data.course.pretest_published ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); run(() => setPretestSettings(course, { pretest_pass_mark: Number(passMark) }), 'Pass mark saved.'); }}>
                  <h2 className="font-black text-lg text-text">Module pass mark</h2>
                  <label className="block text-sm text-text-muted mt-2">A module is tested out at or above
                    <span className="flex items-center gap-2 mt-1">
                      <input className="field mt-0 w-24" type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
                      <span className="text-text">%</span>
                      <button className="secondary" disabled={busy || !(passMark >= 1 && passMark <= 100)}><Save size={16} aria-hidden="true" /> Save</button>
                    </span>
                  </label>
                </form>
                <div>
                  <h2 className="font-black text-lg text-text">Starting version</h2>
                  <ul className="mt-2 text-sm text-text-muted space-y-1">
                    {[...levels].sort((a, b) => a.min_score - b.min_score).map((l) => (
                      <li key={l.id}><span className="font-semibold text-text">{levelName(l)}</span> from {l.min_score}% overall</li>
                    ))}
                  </ul>
                </div>
              </section>

              {uncovered.length > 0 && (
                <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-text">
                  No questions yet for: {uncovered.map((g) => g.module.title).join(', ')}. Students cannot test out of these modules.
                </p>
              )}

              {form && (
                <QuestionForm form={form} setForm={setForm} modules={data.modules} error={formError} busy={busy} onSubmit={save}
                  explanationHint="optional, for your own notes" />
              )}

              {byModule.length === 0 ? <Empty text="Add modules to this course before writing its pre-test." to="/admin/content" action="Add modules" /> : byModule.map(({ module, questions }, i) => (
                <section key={module.id} className={`${panel} p-5 sm:p-6`} aria-labelledby={`pm-${module.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Module {i + 1}{module.published ? '' : ' · draft (not in the pre-test)'}</p>
                      <h2 id={`pm-${module.id}`} className="font-black text-text">{module.title}</h2>
                    </div>
                    <button className="secondary text-sm" disabled={busy} onClick={() => { setForm(blank(module.id)); setFormError(''); }}><Plus size={14} aria-hidden="true" /> Add question</button>
                  </div>
                  {questions.length === 0 ? <p className="muted mt-3">No questions for this module.</p> : (
                    <ol className="mt-3 space-y-2">
                      {questions.map((q, j) => (
                        <li key={q.id} className="rounded-xl border border-border p-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-text">{j + 1}. {q.prompt}</p>
                            <p className="text-sm text-text-muted mt-1">Answer: {q.options[q.correct_index]}{q.competency != null ? ` · ${COMPETENCY_NAMES[q.competency]}` : ''}{q.difficulty ? ` · ${DIFFICULTY_NAMES[q.difficulty - 1]}` : ''}</p>
                          </div>
                          <div className="flex gap-2">
                            <button className="secondary text-sm" disabled={busy} onClick={() => { setForm({ ...q, competency: q.competency ?? '', difficulty: q.difficulty ?? '', options: [...q.options] }); setFormError(''); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
                            <button className="secondary !text-danger" disabled={busy} aria-label={`Delete question ${j + 1}`}
                              onClick={() => { if (window.confirm('Delete this question?')) run(() => deletePretestQuestion(q.id), 'Question deleted.'); }}>
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
