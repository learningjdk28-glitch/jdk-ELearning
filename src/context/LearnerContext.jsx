import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  countPending,
  getAttempts,
  getPrefs,
  getProgress,
  markLessonComplete,
  saveAttempt,
  setMode as dbSetMode,
} from '../lib/db.js';
import { syncUser } from '../services/sync.js';
import { supabase } from '../lib/supabase.js';
import { competencyStats, diagnosticStats, latestOfKind } from '../lib/scoring.js';
import { buildPath, recommendNext } from '../lib/adaptive.js';
import { LESSONS } from '../data/lessons.js';
import { MODULE_KIND } from '../lib/modules.js';

const LearnerContext = createContext(null);

export function LearnerProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [progress, setProgress] = useState({});
  const [prefs, setPrefs] = useState(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [sync, setSync] = useState({ state: 'idle', pending: 0, lastAt: null, message: '' });
  const activeUser = useRef(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [a, p, f, pending] = await Promise.all([
      getAttempts(userId),
      getProgress(userId),
      getPrefs(userId),
      countPending(userId),
    ]);
    if (activeUser.current !== userId) return;
    setAttempts(a);
    setProgress(p);
    setPrefs(f);
    setSync((s) => ({ ...s, pending }));
  }, [userId]);

  const runSync = useCallback(async () => {
    if (!userId) return null;
    setSync((s) => ({ ...s, state: 'syncing', message: '' }));
    const result = await syncUser(userId);
    if (activeUser.current !== userId) return result;
    await reload();
    if (result.ok) {
      setSync((s) => ({ ...s, state: 'synced', lastAt: result.at, message: '' }));
    } else if (result.reason === 'offline') {
      setSync((s) => ({ ...s, state: 'offline', message: 'Offline: changes are saved on this device.' }));
    } else {
      setSync((s) => ({ ...s, state: 'error', message: result.message || 'Sync failed. Will retry.' }));
    }
    return result;
  }, [userId, reload]);

  // Load this user's local data. Resets when the account changes.
  useEffect(() => {
    activeUser.current = userId;
    setReady(false);
    setAttempts([]);
    setProgress({});
    setPrefs(null);
    if (!userId) return;
    (async () => {
      await reload();
      if (activeUser.current === userId) setReady(true);
      if (navigator.onLine) runSync();
    })();
  }, [userId, reload, runSync]);

  // Online / offline detection and sync on reconnect.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      runSync();
    };
    const goOffline = () => {
      setOnline(false);
      setSync((s) => ({ ...s, state: 'offline' }));
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [runSync]);

  // Realtime: when another device saves progress for this account, pull it here.
  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let timer;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(() => runSync(), 1500);
    };
    const channel = supabase.channel('learner-' + userId);
    for (const table of ['assessment_attempts', 'lesson_progress', 'learning_preferences', 'lesson_notes']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'user_id=eq.' + userId }, kick);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, runSync]);

  const afterWrite = useCallback(async () => {
    await reload();
    if (navigator.onLine) runSync();
  }, [reload, runSync]);

  const submitAttempt = useCallback(
    async ({ kind, lessonId, level, responses, courseId, assessmentVersion, snapshot }) => {
      const attempt = await saveAttempt(userId, { kind, lessonId, level, responses, courseId, assessmentVersion, snapshot });
      if ((kind === 'lesson' || kind === MODULE_KIND) && lessonId) await markLessonComplete(userId, lessonId);
      await afterWrite();
      return attempt;
    },
    [userId, afterWrite],
  );

  const changeMode = useCallback(
    async (mode) => {
      await dbSetMode(userId, mode);
      await afterWrite();
    },
    [userId, afterWrite],
  );

  const value = useMemo(() => {
    // Digital Literacy results and file-based module results are kept apart so neither distorts the other.
    const dlIds = new Set(LESSONS.map((l) => l.id));
    const done = Object.values(progress).filter((p) => p.completed).map((p) => p.lessonId);
    const completedIds = done.filter((id) => dlIds.has(id));
    const completedModuleIds = done.filter((id) => !dlIds.has(id));
    const allAttempts = attempts;
    const moduleAttempts = allAttempts.filter((a) => a.kind === MODULE_KIND);
    const dlAttempts = allAttempts.filter((a) => a.kind !== MODULE_KIND);
    const stats = competencyStats(dlAttempts);
    const baseline = diagnosticStats(dlAttempts);
    const diagnostic = latestOfKind(dlAttempts, 'diagnostic');
    return {
      ready,
      attempts: dlAttempts,
      allAttempts,
      moduleAttempts,
      completedModuleIds,
      progress,
      completedIds,
      mode: prefs?.mode || 'Read/Write',
      stats,
      baseline,
      diagnostic,
      hasDiagnostic: Boolean(diagnostic),
      path: buildPath(stats, completedIds),
      next: recommendNext(stats, completedIds),
      online,
      sync,
      runSync,
      notifyChange: afterWrite,
      submitAttempt,
      changeMode,
    };
  }, [ready, attempts, progress, prefs, online, sync, runSync, afterWrite, submitAttempt, changeMode]);

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner() {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error('useLearner must be used inside LearnerProvider');
  return ctx;
}
