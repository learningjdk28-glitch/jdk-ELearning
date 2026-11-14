import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChartColumn, Clock } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyProgress } from '../services/learn.js';
import { coursePath, moduleSummary } from '../lib/learningPath.js';
import { prePost, studyMinutes } from '../lib/analyticsRules.js';
import { formatMinutes } from '../lib/studyTime.js';
import { ProgressBar, moduleLink } from '../components/learn/PathList.jsx';
import { CompareBar, Legend, PairedBars } from '../components/charts/Bars.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** Student progress: each course, pre-test vs post-test, me vs the class, study time, and each module. */
export default function Progress() {
  const { data, loading, error, reload } = useLoad(loadMyProgress, []);
  if (loading) return <LoadingState label="Loading your progress..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { learning, best, pretests, time, compare } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl font-black text-text flex items-center gap-3"><ChartColumn className="text-brand" aria-hidden="true" /> Progress</h1>
        <p className="text-text-muted mt-1">How far you are in each course, what you have learned since the pre-test, and how you compare with your class.</p>
      </header>

      {learning.courses.length === 0 ? (
        <EmptyState title="No courses yet" action={<Link className="primary" to="/catalog">Explore courses</Link>}>Enroll in a course to see your progress here.</EmptyState>
      ) : learning.courses.map(({ course, modules, placement }) => {
        const path = coursePath(modules, learning.done, learning.passed, placement);
        const pp = prePost(pretests.filter((p) => p.course_id === course.id));
        const minutes = studyMinutes(time, modules.map((m) => m.id));
        const quizScores = modules.flatMap((m) => m.quizzes.map((q) => best[q.id])).filter((s) => s != null);
        const myQuiz = quizScores.length ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length : null;
        return (
          <section key={course.id} className="panel p-5 sm:p-6 space-y-6" aria-labelledby={`progress-${course.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id={`progress-${course.id}`} className="text-xl font-black text-text">{course.title}</h2>
                <p className="text-sm text-text-muted mt-1">{path.modulesDone} of {path.items.length} modules finished</p>
              </div>
              {path.finished
                ? <span className="inline-flex items-center gap-1 font-bold text-success"><CheckCircle2 size={18} aria-hidden="true" /> Complete</span>
                : <Link className="secondary text-sm" to={`/learn/${encodeURIComponent(course.id)}`}>Open course</Link>}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1"><ProgressBar percent={path.percent} label={`${course.title} progress`} /></div>
              <span className="text-sm font-bold text-text tabular-nums">{path.percent}%</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <Stat label="Study time this week" value={formatMinutes(minutes.week)} icon={Clock} />
              <Stat label="Study time in total" value={formatMinutes(minutes.total)} icon={Clock} />
              <Stat label="Average best quiz score" value={myQuiz == null ? '—' : `${Math.round(myQuiz)}%`} />
            </div>

            {course.pretest_published && <PrePostBlock pp={pp} course={course} finished={path.finished} />}
            <ClassBlock c={compare[course.id]} myProgress={path.percent} myQuiz={myQuiz} myMinutes={minutes.total} />

            {path.items.length > 0 && (
              <div>
                <h3 className="font-black text-text">Modules</h3>
                <ol className="mt-2 divide-y divide-border">
                  {path.items.map((item, i) => {
                    const scores = item.module.quizzes.map((q) => best[q.id]).filter((s) => s != null);
                    return (
                      <li key={item.module.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                        <Link to={moduleLink(course.id, item.module.id)} className="min-w-0 font-semibold text-text hover:text-brand">
                          {i + 1}. {item.module.title}
                          <span className="block text-sm font-normal text-text-muted">{moduleSummary(item)}</span>
                        </Link>
                        <span className={`text-sm font-bold tabular-nums ${item.complete ? 'text-success' : 'text-text-muted'}`}>
                          {scores.length ? `Best quiz ${Math.max(...scores)}%` : item.module.quizzes.length ? 'Quiz not taken' : 'No quiz'}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">{Icon && <Icon size={14} aria-hidden="true" />} {label}</p>
      <p className="text-2xl font-black text-text mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function PrePostBlock({ pp, course, finished }) {
  const testLink = `/learn/${encodeURIComponent(course.id)}/pretest`;
  return (
    <div>
      <h3 className="font-black text-text">Pre-test and post-test</h3>
      {pp.pre == null && pp.post == null ? (
        <p className="text-sm text-text-muted mt-1">You have not taken the pre-test yet. <Link className="text-brand underline" to={testLink}>Take it now</Link> to measure what you learn.</p>
      ) : (
        <>
          <p className="text-sm text-text mt-1">
            First pre-test <strong className="tabular-nums">{pp.pre ?? '—'}{pp.pre != null && '%'}</strong>
            {pp.post != null
              ? <> · post-test <strong className="tabular-nums">{pp.post}%</strong>{pp.gain != null && <span className={pp.gain >= 0 ? 'text-success font-bold' : 'text-warning font-bold'}> ({pp.gain >= 0 ? '+' : ''}{pp.gain} points)</span>}</>
              : finished ? <> · <Link className="text-brand underline font-semibold" to={`${testLink}?stage=post`}>take the post-test <ArrowRight size={14} className="inline" aria-hidden="true" /></Link> to see what you learned</>
              : ' · the post-test opens when you finish the course'}
          </p>
          {pp.post != null && pp.modules.length > 0 && (
            <div className="mt-3"><PairedBars label={`${course.title}: pre-test and post-test by module`} rows={pp.modules.map((m) => ({ key: m.module_id, label: m.title, a: m.pre, b: m.post }))} /></div>
          )}
        </>
      )}
    </div>
  );
}

function ClassBlock({ c, myProgress, myQuiz, myMinutes }) {
  if (!c) return null;
  const hidden = c.class_progress == null;
  return (
    <div>
      <h3 className="font-black text-text">You and your class</h3>
      {hidden ? (
        <p className="text-sm text-text-muted mt-1">The class average appears when at least {c.min_size} students are in this course, so no one's results can be singled out.</p>
      ) : (
        <div className="mt-2 space-y-4">
          <Legend items={[{ name: 'You', swatch: 'bg-category-1' }, { name: 'Class average', marker: true }]} />
          {/* Both sides come from the same server calculation, so they are measured the same way. */}
          <CompareBar label="Pages read" mine={c.my_progress ?? myProgress} cls={c.class_progress} />
          <CompareBar label="Average best quiz score" mine={c.my_quiz ?? myQuiz} cls={c.class_quiz} />
          <CompareBar label="Study time" mine={c.my_minutes ?? myMinutes} cls={c.class_minutes} max={Math.max(60, myMinutes, Number(c.class_minutes) || 0) * 1.1} format={(v) => (v == null ? '—' : formatMinutes(v))} />
          <p className="text-xs text-text-muted">Class of {c.class_size}. Averages include you.</p>
        </div>
      )}
    </div>
  );
}
