// Central zustand store. All reads go through `db`; all writes go through `exec` → api commands.
// Doherty Threshold: commands apply synchronously (optimistic, <1 frame) against the mock layer; XP is
// computed by the rules engine a tick later and lands within ~100ms.
import { create } from 'zustand';
import { produce } from 'immer';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { evaluateXp } from './lib/rules';
import { abilityFor, type AppAbility } from './lib/permissions';
import type { DB, User } from './types';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code: string };

const COMMANDS = {
  saveRows: api.saveRows, updateCourse: api.updateCourse, updateTask: api.updateTask, updateSettings: api.updateSettings,
  submitWork: api.submitWork, postFeedback: api.postFeedback, completeUnit: api.completeUnit, changeGrade: api.changeGrade,
  bulkFeedback: api.bulkFeedback, extendDeadline: api.extendDeadline, markFeedbackRead: api.markFeedbackRead,
  publishMilestoneArtifact: api.publishMilestoneArtifact, closePeerCycle: api.closePeerCycle, submitPeerRound: api.submitPeerRound,
  editPeerEval: api.editPeerEval, resolveFlag: api.resolveFlag, logEffort: api.logEffort, logContribution: api.logContribution,
  grantManualXp: api.grantManualXp, setIpStatus: api.setIpStatus, setProjectFlag: api.setProjectFlag, updateProjectCustom: api.updateProjectCustom,
  setCompMarker: api.setCompMarker, setCompOutcome: api.setCompOutcome, bulkTagCompetitions: api.bulkTagCompetitions,
  markNotificationsRead: api.markNotificationsRead, ackCelebration: api.ackCelebration,
  simulateConcurrentEdit: api.simulateConcurrentEdit, rubricEditedByInstructor: api.rubricEditedByInstructor,
};
type Bound<T> = { [K in keyof T]: T[K] extends (d: DB, a: User, ...r: infer R) => infer Ret ? (...r: R) => Result<Ret> : never };
export type Cmd = Bound<typeof COMMANDS>;

interface State {
  db: DB;
  userId: string;
  courseId: string;
  page: string;
  setPage: (p: string) => void;
  setUser: (id: string) => void;
  setCourse: (id: string) => void;
  reset: () => void;
  cmd: Cmd;
  /** run a command as a specific actor (used by the integrity lab to attempt attacks as other roles) */
  cmdAs: (userId: string, quiet?: boolean) => Cmd;
}

const prefs = api.loadPrefs();
let flushing = false;
/** Where each side lands: students on their dashboard hero, staff on their home hero. */
export const homeOf = (role: string) => (role === 'student' ? 'dashboard' : 'home');

function makeCmd(getActor: () => User, set: (fn: (s: State) => Partial<State>) => void, get: () => State, quiet = false): Cmd {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(COMMANDS)) {
    out[name] = (...args: unknown[]) => {
      const actor = getActor();
      try {
        let value: unknown;
        const next = produce(get().db, (draft) => { value = (fn as (...a: unknown[]) => unknown)(draft, actor, ...args); });
        set(() => ({ db: next }));
        void flushXp(set, get);
        return { ok: true, value };
      } catch (e) {
        if (e instanceof api.Blocked) {
          if (!quiet) toast.error(e.message, { description: `Blocked · ${e.code}` });
          return { ok: false, error: e.message, code: e.code };
        }
        console.error(e);
        toast.error('Unexpected error — see console');
        return { ok: false, error: String(e), code: 'error' };
      }
    };
  }
  return out as unknown as Cmd;
}

async function flushXp(set: (fn: (s: State) => Partial<State>) => void, get: () => State) {
  if (flushing) return;
  flushing = true;
  try {
    while (get().db.pendingXp.length) {
      const req = get().db.pendingXp[0];
      const awards = await evaluateXp(get().db.xpRules, req.facts);
      const sys = get().db.users[0];
      set((s) => ({ db: produce(s.db, (d) => api.applyXp(d, sys, req, awards)) }));
    }
  } finally { flushing = false; }
}

export const useStore = create<State>((set, get) => {
  const actor = () => get().db.users.find((u) => u.id === get().userId)!;
  const db = api.loadDb();
  const startRole = db.users.find((u) => u.id === prefs.userId)?.role ?? 'student';
  return {
    db,
    userId: prefs.userId,
    courseId: prefs.courseId,
    page: location.hash.replace(/^#\//, '') || homeOf(startRole),
    setPage: (p) => { location.hash = `/${p}`; set(() => ({ page: p })); },
    setUser: (id) => {
      const u = get().db.users.find((x) => x.id === id)!;
      const courseId = u.courseIds.includes(get().courseId) ? get().courseId : u.courseIds[0];
      api.savePrefs({ userId: id, courseId });
      const page = homeOf(u.role);
      set(() => ({ userId: id, courseId, page }));
      location.hash = `/${page}`;
    },
    setCourse: (id) => { api.savePrefs({ userId: get().userId, courseId: id }); set(() => ({ courseId: id })); },
    reset: () => { set(() => ({ db: api.resetDb() })); toast.success('Demo data reset to seed'); },
    cmd: makeCmd(actor, set, get),
    cmdAs: (userId, quiet = false) => makeCmd(() => get().db.users.find((u) => u.id === userId)!, set, get, quiet),
  };
});

// persistence + cross-tab concurrent-edit notice
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.db === prev.db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveDb(useStore.getState().db), 80);
});
window.addEventListener('storage', (e) => {
  if (e.key !== api.dbStorageKey || !e.newValue) return;
  try {
    const db = JSON.parse(e.newValue) as DB;
    useStore.setState({ db });
    toast.info('This was just updated in another window', { description: 'Latest data loaded. Edits made against an older version are rejected, never silently overwritten.' });
  } catch { /* ignore */ }
});
window.addEventListener('hashchange', () => { const s = useStore.getState(); useStore.setState({ page: location.hash.replace(/^#\//, '') || homeOf(s.db.users.find((u) => u.id === s.userId)?.role ?? 'student') }); });

export const useDb = () => useStore((s) => s.db);
export const useCmd = () => useStore((s) => s.cmd);
export function useUser(): User { return useStore((s) => s.db.users.find((u) => u.id === s.userId)!); }
export function useAbility(): AppAbility { const u = useUser(); return useMemo(() => abilityFor(u), [u]); }
export function useNow(ms = 30000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
