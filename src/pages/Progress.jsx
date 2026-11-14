import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookOpen, CheckCircle2, Trophy } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { COMPETENCIES, LEVEL_LABELS } from '../data/course.js';
import { LESSONS, lessonById } from '../data/lessons.js';
import { strengthsAndWeaknesses } from '../lib/scoring.js';
import { BackHeader, Callout, CompetencyBars, LevelBadge } from '../components/ui.jsx';
import NetworkingProgress from '../components/NetworkingProgress.jsx';

const answeredOf = (a) => a.responses.filter((r) => r.answer !== null && r.answer !== undefined);
const pctOf = (a) => {
  const rows = answeredOf(a);
  return rows.length ? Math.round((rows.filter((r) => r.correct).length / rows.length) * 100) : null;
};

function Donut({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" role="img" aria-label={value === null ? 'No answers yet' : `Overall accuracy ${value}%`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5f5ec" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#16a34a" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xs text-slate-600">Overall</p>
          <p className="text-3xl font-extrabold">{value === null ? '-' : `${value}%`}</p>
        </div>
      </div>
    </div>
  );
}

function DigitalLiteracyProgress() {
  const { stats, baseline, attempts, completedIds, hasDiagnostic, path } = useLearner();
  const [tab, setTab] = useState('overview');
  const { strengths, weaknesses, insufficient } = strengthsAndWeaknesses(stats);
  const lessonAttempts = attempts.filter((a) => a.kind === 'lesson');

  const allAnswered = attempts.flatMap(answeredOf);
  const overall = allAnswered.length ? Math.round((allAnswered.filter((r) => r.correct).length / allAnswered.length) * 100) : null;
  const passed = lessonAttempts.filter((a) => (pctOf(a) ?? 0) >= 70).length;

  const compareData = COMPETENCIES.map((c, i) => ({ name: c.short, Pretest: baseline[i].score ?? 0, Current: stats[i].score ?? 0 }));
  const trend = attempts
    .map((a, i) => ({ n: i + 1, score: pctOf(a), label: a.kind === 'diagnostic' ? 'Pre-test' : lessonById(a.lessonId)?.title }))
    .filter((d) => d.score !== null);
  const upcoming = path.filter((p) => !p.completed).slice(0, 2);

  const tabs = [['overview', 'Overview'], ['competency', 'By Competency'], ['history', 'History']];

  return (
    <div className="w-full">
      <div className="flex gap-1 rounded-3xl bg-indigo-50 p-1.5 mb-5" role="tablist" aria-label="Progress sections">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-2xl py-3 font-bold ${tab === id ? 'bg-brand text-white' : 'text-slate-700 hover:bg-indigo-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {attempts.length === 0 && (
        <div className="mb-5">
          <Callout tone="warn">No assessments yet. <Link className="underline font-bold" to="/pretest">Take the pre-test</Link> to see your scores.</Callout>
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid xl:grid-cols-2 gap-5 items-start">
        <div>
          <div className="panel p-5 sm:p-6 flex flex-wrap items-center justify-center sm:justify-start gap-5">
            <Donut value={overall} />
            <dl className="flex-1 min-w-[12rem] space-y-4">
              {[
                [BookOpen, 'text-brand', 'Lessons completed', `${completedIds.length}/${LESSONS.length}`],
                [CheckCircle2, 'text-green-600', 'Assessments taken', attempts.length],
                [Trophy, 'text-amber-500', 'Quizzes passed (70%+)', passed],
              ].map(([Icon, color, k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <Icon className={color} size={22} aria-hidden="true" />
                  <dt className="flex-1 text-slate-700">{k}</dt>
                  <dd className="font-extrabold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="muted mt-2">Overall is the share of all answered questions you got right.</p>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-3xl bg-green-50 p-5">
              <p className="text-xs font-extrabold tracking-wide text-green-800">STRENGTH</p>
              <p className="font-extrabold text-lg text-green-900 mt-1">
                {strengths.length ? strengths.map((s) => `${s.name} (${s.score}%)`).join(', ') : 'None at 80% or more yet'}
              </p>
            </div>
            <div className="rounded-3xl bg-amber-50 p-5">
              <p className="text-xs font-extrabold tracking-wide text-amber-800">FOCUS AREA</p>
              <p className="font-extrabold text-lg text-amber-900 mt-1">
                {weaknesses.length ? weaknesses.map((s) => `${s.name} (${s.score}%)`).join(', ') : 'None below 50%'}
              </p>
            </div>
          </div>
          {insufficient.length > 0 && hasDiagnostic && (
            <p className="text-amber-800 text-sm font-semibold mt-3">Insufficient evidence: {insufficient.map((s) => s.name).join(', ')}.</p>
          )}

        </div>
        <div>
          <CompetencyBars stats={stats} title="Competency Progress" compact />
          <div className="panel p-5 sm:p-6 mt-4">
            <h2 className="font-extrabold text-lg">Recommended next lessons</h2>
            {upcoming.length === 0 ? (
              <p className="muted mt-3">All lessons completed.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((u) => (
                  <li key={u.lesson.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{u.lesson.title}</p>
                      <p className="muted">{u.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <LevelBadge level={u.level} />
                      <Link className="secondary" to={`/lesson/${u.lesson.id}`}>Open</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === 'competency' && (
        <div className="grid xl:grid-cols-2 gap-5 items-start">
          <CompetencyBars stats={stats} title="Current competency scores" />
          <div className="panel p-5 sm:p-6 mt-4">
            <h2 className="font-extrabold text-lg mb-3">Pre-test compared with now</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={compareData} margin={{ left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Pretest" fill="#a5b4fc" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Current" fill="#4f3fd9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="muted mt-2">Current scores combine pre-test and lesson quiz answers. Not-assessed areas show as 0.</p>
          </div>
          {trend.length > 1 && (
            <div className="panel p-5 sm:p-6 mt-4">
              <h2 className="font-extrabold text-lg mb-3">Score on each assessment</h2>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="n" label={{ value: 'Attempt', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(v) => `${v}%`} labelFormatter={(n) => `Attempt ${n}: ${trend[n - 1]?.label}`} />
                    <Line type="monotone" dataKey="score" stroke="#4f3fd9" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="panel p-5 sm:p-6">
          <h2 className="font-extrabold text-lg">Assessment history</h2>
          {attempts.length === 0 ? (
            <p className="muted mt-3">Nothing yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-indigo-50">
              {[...attempts].reverse().map((a) => {
                const rows = answeredOf(a);
                return (
                  <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{a.kind === 'diagnostic' ? 'Diagnostic pre-test' : lessonById(a.lessonId)?.title}</p>
                      <p className="muted">
                        {new Date(a.createdAt).toLocaleString()} &middot; {rows.filter((r) => r.correct).length}/{rows.length} correct
                        {a.level && <> &middot; {LEVEL_LABELS[a.level]}</>}
                      </p>
                    </div>
                    <span className={`text-xs font-bold ${a.synced ? 'text-green-800' : 'text-amber-800'}`}>
                      {a.synced ? 'Synced' : 'Waiting to sync'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Progress() {
  const [course, setCourse] = useState('dl');
  const courses = [['dl', 'Digital Literacy'], ['nb', 'Networking Basics']];
  return (
    <div className="w-full">
      <BackHeader title="My Progress" to="/dashboard" />
      <div className="flex gap-2 mb-4 overflow-x-auto" role="group" aria-label="Course">
        {courses.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={course === id}
            onClick={() => setCourse(id)}
            className={`rounded-full border px-4 min-h-[44px] font-bold whitespace-nowrap ${course === id ? 'bg-brand text-white border-brand' : 'bg-white border-indigo-200 text-brand'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {course === 'dl' ? <DigitalLiteracyProgress /> : <NetworkingProgress />}
    </div>
  );
}
