import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, ExternalLink, FileText, Lock, PartyPopper } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadModule, markPageRead } from '../services/learn.js';
import { openMaterial } from '../services/materials.js';
import { moduleState } from '../lib/learningPath.js';
import { MODULE_PAGE_COUNT } from '../lib/courseRules.js';
import { availableLevels, levelName, pickVersion } from '../lib/pageVersions.js';
import PageBody from '../components/learn/PageBody.jsx';
import { moduleLink } from '../components/learn/PathList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';
import Activity from '../components/Activity.jsx';
import { CourseAssignments } from '../components/learn/AssignmentList.jsx';

/** One module: MODULE_PAGE_COUNT pages, then the "Check" step (activity, quiz, self-study files). */
export default function ModulePlayer() {
  const { courseId, moduleId } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload, setData } = useLoad(() => loadModule(courseId, moduleId), [courseId, moduleId]);
  const courseLink = `/learn/${encodeURIComponent(courseId)}`;

  if (loading) return <LoadingState label="Loading module..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || data.module.pages.length === 0) {
    return <EmptyState title="This module is not available" action={<Link className="primary" to={courseLink}>Back to the course</Link>}>It may be unpublished, or you may not be enrolled in this course.</EmptyState>;
  }

  const { module } = data;
  const pages = module.pages;
  const onCheck = params.get('step') === 'check';
  const index = Math.min(Math.max(Number(params.get('page') || 1) - 1, 0), pages.length - 1);
  const state = moduleState(module, data.done, data.passed);
  const position = data.siblings.findIndex((m) => m.id === module.id);
  const nextModule = data.siblings[position + 1];
  const goPage = (i) => { setParams({ page: String(i + 1) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const goCheck = () => { setParams({ step: 'check' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Link to={courseLink} className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Course</Link>
      <header className="mt-3">
        <p className="text-sm font-bold uppercase tracking-wider text-text-muted">Module {position + 1} of {data.siblings.length}</p>
        <h1 className="text-2xl sm:text-3xl font-black text-text mt-1">{module.title}</h1>
      </header>

      <Stepper pages={pages} done={data.done} index={onCheck ? -1 : index} onCheck={onCheck} state={state} goPage={goPage} goCheck={goCheck} />

      {onCheck ? (
        <CheckStep data={data} state={state} courseId={courseId} goPage={goPage} nextModule={nextModule} />
      ) : (
        <PageStep key={pages[index].id} data={data} index={index} setData={setData}
          onPrev={index > 0 ? () => goPage(index - 1) : null}
          onNext={index < pages.length - 1 ? () => goPage(index + 1) : goCheck} isLast={index === pages.length - 1} />
      )}
    </div>
  );
}

function Stepper({ pages, done, index, onCheck, state, goPage, goCheck }) {
  return (
    <nav aria-label="Module steps" className="mt-5">
      <p className="text-sm text-text-muted mb-2">{onCheck ? 'Check your understanding' : `Page ${index + 1} of ${MODULE_PAGE_COUNT}`}</p>
      <ol className="flex gap-1.5">
        {pages.map((p, i) => {
          const read = done.has(p.id);
          const active = i === index;
          return (
            <li key={p.id} className="flex-1">
              <button type="button" onClick={() => goPage(i)} aria-current={active ? 'step' : undefined}
                aria-label={`Page ${i + 1}: ${p.title}${read ? ' (read)' : ''}`}
                className={`w-full h-2.5 rounded-full ${active ? 'bg-brand' : read ? 'bg-success' : 'bg-surface-muted'}`} />
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={goCheck} aria-current={onCheck ? 'step' : undefined} aria-label={`Check step${state.assessment === 'passed' ? ' (passed)' : ''}`}
            className={`w-full h-2.5 rounded-full ${onCheck ? 'bg-brand' : state.assessment === 'passed' ? 'bg-success' : 'bg-surface-muted'}`} />
        </li>
      </ol>
    </nav>
  );
}

function PageStep({ data, index, setData, onPrev, onNext, isLast }) {
  const page = data.module.pages[index];
  const [chosen, setChosen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const levels = availableLevels(page.id, data.variants, data.levels);
  // The pre-test placement picks the starting version; the student can always switch.
  const { content, levelId } = pickVersion(page, data.variants, chosen ?? data.placementLevel, data.levels);
  const placed = data.placementLevel && levels.find((l) => l.id === data.placementLevel);

  async function next() {
    setSaveError('');
    if (!data.done.has(page.id)) {
      setSaving(true);
      try {
        await markPageRead(page.id);
        setData((d) => ({ ...d, done: new Set([...d.done, page.id]) }));
      } catch (e) {
        setSaving(false);
        setSaveError(e.offline ? 'You are offline, so this page could not be marked as read. Reconnect and try again.' : e.message);
        return;
      }
      setSaving(false);
    }
    onNext();
  }

  return (
    <article className="panel p-5 sm:p-8 mt-5" aria-labelledby="page-title">
      {index === 0 && data.module.description && (
        <section className="rounded-2xl bg-brand-soft p-4 mb-6" aria-label="In this module">
          <p className="font-bold text-text">In this module</p>
          <p className="text-text-muted mt-1 whitespace-pre-line">{data.module.description}</p>
        </section>
      )}
      <h2 id="page-title" className="text-2xl font-black text-text">{page.title}</h2>

      {levels.length > 1 && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-text-muted mb-2">
            Show this page as
            {placed && chosen === null && <span className="font-normal"> — your pre-test picked "{levelName(placed)}". You can switch any time.</span>}
          </legend>
          <div className="inline-flex flex-wrap rounded-2xl border border-border bg-surface-muted p-1 gap-1">
            {levels.map((l) => (
              <label key={l.id} className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold ${levelId === l.id ? 'bg-surface-raised text-brand shadow-sm' : 'text-text-muted'}`}>
                <input type="radio" className="sr-only" name={`version-${page.id}`} checked={levelId === l.id} onChange={() => setChosen(l.id)} />
                {levelName(l)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6"><PageBody kind={page.kind} content={content} glossary={data.glossary} /></div>

      {saveError && <p role="alert" className="mt-6 rounded-xl bg-danger/10 border border-danger/30 text-danger p-3">{saveError}</p>}
      <div className="mt-8 flex flex-wrap justify-between gap-3">
        {onPrev ? <button className="secondary" onClick={onPrev}><ArrowLeft size={16} aria-hidden="true" /> Previous</button> : <span />}
        <button className="primary" onClick={next} disabled={saving}>
          {saving ? 'Saving...' : isLast ? 'Finish reading' : 'Next page'} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function CheckStep({ data, state, courseId, goPage, nextModule }) {
  const unread = data.module.pages.map((p, i) => ({ p, i })).filter(({ p }) => !data.done.has(p.id));
  const quizzes = data.module.quizzes;
  return (
    <div className="space-y-5 mt-5">
      {state.complete ? (
        <section className="panel p-6 border-success/30 bg-success/10" role="status">
          <p className="flex items-center gap-2 text-xl font-black text-text"><PartyPopper size={22} className="text-success" aria-hidden="true" /> Module complete</p>
          <p className="text-text-muted mt-1">You read every page{quizzes.length ? ' and passed the quiz' : ''}.</p>
          <div className="mt-4">
            {nextModule
              ? <Link className="primary" to={moduleLink(courseId, nextModule.id, 0)}>Next module: {nextModule.title} <ArrowRight size={16} aria-hidden="true" /></Link>
              : <Link className="primary" to={`/learn/${encodeURIComponent(courseId)}`}>Back to the course</Link>}
          </div>
        </section>
      ) : unread.length > 0 && (
        <section className="panel p-5" aria-label="Pages to read first">
          <p className="font-bold text-text flex items-center gap-2"><Lock size={18} className="text-warning" aria-hidden="true" /> Read every page to unlock the quiz</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unread.map(({ p, i }) => <li key={p.id}><button className="secondary text-sm" onClick={() => goPage(i)}>Page {i + 1}: {p.title}</button></li>)}
          </ul>
        </section>
      )}

      {quizzes.map((quiz) => {
        const passed = data.passed.has(quiz.id);
        return (
          <section key={quiz.id} className="panel p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Quiz · pass mark {quiz.pass_mark}%</p>
              <p className="font-bold text-text mt-1">{quiz.title}</p>
            </div>
            {passed ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-3 py-1.5 font-bold text-sm"><Check size={16} aria-hidden="true" /> Passed</span>
              : unread.length > 0 ? <span className="inline-flex items-center gap-1 text-text-muted text-sm"><Lock size={16} aria-hidden="true" /> Locked</span>
              : <Link className="primary" to={`/learn/${encodeURIComponent(courseId)}/quiz/${quiz.id}`}><ClipboardCheck size={16} aria-hidden="true" /> Start quiz</Link>}
          </section>
        );
      })}

      {data.activities.map((a) => (
        <div key={a.id}>
          <p className="text-sm font-semibold text-text-muted mb-2">Practice activity (not graded)</p>
          <Activity activity={{ type: a.kind, title: a.title, prompt: a.prompt, ...a.spec }} />
        </div>
      ))}

      <CourseAssignments courseId={courseId} moduleId={data.module.id} title="Assignments for this module" />
      {data.materials.length > 0 && <Materials files={data.materials} />}
      {quizzes.length === 0 && data.activities.length === 0 && !state.complete && unread.length === 0 && (
        <p className="text-text-muted">This module has no quiz. You have finished it.</p>
      )}
    </div>
  );
}

function Materials({ files }) {
  const [error, setError] = useState('');
  return (
    <section className="panel p-5" aria-labelledby="self-study">
      <h2 id="self-study" className="font-black text-lg text-text">Self-study materials</h2>
      <p className="text-text-muted text-sm mt-1">Extra reading from your instructor.</p>
      {error && <p role="alert" className="mt-3 text-danger text-sm">{error}</p>}
      <ul className="mt-3 space-y-2">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <FileText size={20} className="text-brand shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 font-semibold text-text break-all">{f.title}</span>
            <button className="secondary text-sm" onClick={() => openMaterial(f).catch((e) => setError(e.message))}><ExternalLink size={14} aria-hidden="true" /> Open</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
