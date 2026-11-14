import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { listManagedCourses } from '../services/lms.js';
import { courseAnalytics } from '../services/accounts.js';
import { formatMinutes } from '../lib/studyTime.js';
import { PairedBars } from '../components/charts/Bars.jsx';
import { AdminHeading, Empty, Notice, panel } from '../components/AdminUI.jsx';

const pc = (v) => (v == null ? '—' : `${Math.round(Number(v))}%`);

/** Instructor analytics for one course: engagement, pre-test vs post-test, each module, and the hardest questions. */
export default function AdminReports() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); }); }, []);
  useEffect(() => {
    if (!course) return;
    setData(null); setError('');
    courseAnalytics(course).then(setData).catch((e) => setError(e.message));
  }, [course]);

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Analytics" description="How students in your course are doing, from the database. Study time counts only while a page is open, in front and in use."
        action={<Link to="/admin/assistant" className="secondary"><BarChart3 size={16} aria-hidden="true" /> Analytics assistant</Link>} />
      <Notice error={error} />
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
          {!data ? (!error && <p className="muted" role="status">Loading analytics...</p>) : Number(data.enrolled) === 0 ? (
            <Empty text="No students are enrolled in this course yet." to="/admin/enrollments" action="Manage enrollments" />
          ) : <Report d={data} />}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-2xl font-black text-text mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function Report({ d }) {
  const enrolled = Number(d.enrolled);
  const small = enrolled < Number(d.min_size);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Enrolled" value={enrolled} />
        <Tile label="Active, last 7 days" value={d.active_7d} hint={`${Math.round((100 * Number(d.active_7d)) / enrolled)}% of students`} />
        <Tile label="Read every page" value={d.finished} />
        <Tile label="Average pages read" value={pc(d.avg_progress)} />
        <Tile label="Average best quiz" value={pc(d.avg_quiz)} />
        <Tile label="Study time per student" value={formatMinutes(d.avg_minutes)} />
      </div>
      {small && <p className="text-sm text-text-muted">With fewer than {d.min_size} students, averages describe individual students. Students do not see class averages until there are {d.min_size}.</p>}

      <section className={`${panel} p-5 sm:p-6`} aria-labelledby="prepost-heading">
        <h2 id="prepost-heading" className="font-black text-lg text-text">Pre-test and post-test</h2>
        <p className="text-sm text-text mt-1">
          First pre-test average <strong>{pc(d.pre_avg)}</strong> ({d.pre_n} student{Number(d.pre_n) === 1 ? '' : 's'})
          {' · '}latest post-test average <strong>{pc(d.post_avg)}</strong> ({d.post_n})
          {Number(d.paired_n) > 0 && <> · <strong className={Number(d.paired_gain) >= 0 ? 'text-success' : 'text-warning'}>{Number(d.paired_gain) >= 0 ? '+' : ''}{Math.round(Number(d.paired_gain))} points</strong> on average for the {d.paired_n} who took both</>}
        </p>
        {Number(d.post_n) === 0 && <p className="text-sm text-text-muted mt-1">No post-tests yet. Students see the post-test when they finish the course.</p>}
        {d.modules.some((m) => m.pre != null || m.post != null) && (
          <div className="mt-4"><PairedBars label="Average pre-test and post-test score by module" rows={d.modules.map((m) => ({ key: m.module_id, label: m.title, a: m.pre, b: m.post }))} /></div>
        )}
      </section>

      <section className={`${panel} overflow-hidden`} aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="font-black text-lg text-text p-5 pb-0">By module</h2>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-text-muted">
              <tr><th scope="col" className="p-3">Module</th><th scope="col" className="p-3">Pages read</th><th scope="col" className="p-3">Quiz passed</th><th scope="col" className="p-3">Pre → post</th><th scope="col" className="p-3">Study time per student</th></tr>
            </thead>
            <tbody>
              {d.modules.map((m, i) => (
                <tr key={m.module_id} className="border-t border-border">
                  <td className="p-3 font-semibold text-text">{i + 1}. {m.title}</td>
                  <td className="p-3 text-text tabular-nums">{pc(m.progress)}</td>
                  <td className="p-3 text-text tabular-nums">{Number(m.quiz_takers) ? `${m.quiz_passed} of ${m.quiz_takers} who tried` : '—'}</td>
                  <td className="p-3 text-text tabular-nums">{pc(m.pre)} → {pc(m.post)}</td>
                  <td className="p-3 text-text tabular-nums">{formatMinutes(m.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${panel} p-5 sm:p-6`} aria-labelledby="hard-heading">
        <h2 id="hard-heading" className="font-black text-lg text-text">Hardest quiz questions</h2>
        {d.hardest.length === 0 ? <p className="text-sm text-text-muted mt-1">Shown once a question has at least {d.min_size} answers.</p> : (
          <ol className="mt-3 space-y-2">
            {d.hardest.map((h) => (
              <li key={h.question_id} className="rounded-xl border border-border p-3 flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-text">{h.prompt}</span>
                  <span className="block text-xs text-text-muted">{h.module} · {h.answers} answers</span>
                </span>
                <span className="text-sm font-bold text-text tabular-nums">{pc(h.pct)} correct</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-text-muted mt-3">Counts every attempt, retakes included. Consider rewording a question most students miss, or adding an explanation to it.</p>
      </section>
    </>
  );
}
