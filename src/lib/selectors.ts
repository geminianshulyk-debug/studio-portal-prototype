import type { DB, Feedback, Progress, Rank, Submission, Task, UnitStatus } from '../types';
import { isMilestoneUnit, unitMilestone, unitTask } from '../types';
import { peerScoreFor } from './peer';

const HOUR = 3600000;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const userName = (db: DB, id: string) => db.users.find((u) => u.id === id)?.name ?? (id === 'system' ? 'System' : id);
export const firstName = (db: DB, id: string) => userName(db, id).split(' ')[0];

export interface Unit {
  unitId: string;
  task: Task;
  milestoneId?: string;
  title: string;
  due: string;
  status: UnitStatus;
  locked: boolean;
  overdue: boolean;
  role?: string;
  studentId: string;
  pct: number; // progress 0..1 for Zeigarnik bar
}

export const effectiveDeadline = (task: Task, studentId: string, unitDue?: string) =>
  task.extensions[studentId]?.until ?? unitDue ?? task.deadline;

export const progressOf = (db: DB, unitId: string, studentId: string): Progress | undefined =>
  db.progress.find((p) => p.key === `${unitId}:${studentId}`);
export const statusOf = (db: DB, unitId: string, studentId: string): UnitStatus => progressOf(db, unitId, studentId)?.status ?? 'assigned';
export const submissionsOf = (db: DB, unitId: string, studentId: string) =>
  db.submissions.filter((s) => s.unitId === unitId && s.studentId === studentId).sort((a, b) => a.version - b.version);
export const latestSubmission = (db: DB, unitId: string, studentId: string): Submission | undefined => submissionsOf(db, unitId, studentId).at(-1);
export const feedbackOfSubmission = (db: DB, subId: string): Feedback | undefined => db.feedback.find((f) => f.submissionId === subId);

const STATUS_PCT: Record<UnitStatus, number> = { assigned: 0, submitted: 0.4, feedback: 0.7, revision: 0.55, resubmitted: 0.75, complete: 1 };

export function unitsFor(db: DB, studentId: string, courseId?: string, nowMs = Date.now()): Unit[] {
  const out: Unit[] = [];
  for (const task of db.tasks.filter((t) => !courseId || t.courseId === courseId)) {
    const student = db.users.find((u) => u.id === studentId);
    if (!student?.courseIds.includes(task.courseId)) continue;
    if (task.type === 'individual') {
      const status = statusOf(db, task.id, studentId);
      const due = effectiveDeadline(task, studentId);
      out.push({ unitId: task.id, task, title: task.title, due, status, locked: false, overdue: status !== 'complete' && new Date(due).getTime() < nowMs, studentId, pct: STATUS_PCT[status] });
    } else if (task.group) {
      const g = db.groups.find((x) => x.id === task.group!.groupId);
      if (!g?.memberIds.includes(studentId)) continue;
      task.group.milestones.forEach((m, i) => {
        const unitId = `${task.id}#${m.id}`;
        const status = statusOf(db, unitId, studentId);
        const prev = i > 0 ? task.group!.milestones[i - 1] : undefined;
        const locked = !!prev && !db.artifacts.some((a) => a.taskId === task.id && a.milestoneId === prev.id);
        const due = effectiveDeadline(task, studentId, m.due);
        out.push({ unitId, task, milestoneId: m.id, title: `${task.title} — ${m.title}`, due, status, locked, overdue: status !== 'complete' && !locked && new Date(due).getTime() < nowMs, role: m.assignments[studentId], studentId, pct: STATUS_PCT[status] });
      });
    }
  }
  return out;
}

export const xpTotal = (db: DB, studentId: string) => db.xpEvents.filter((e) => e.studentId === studentId).reduce((a, e) => a + e.points, 0);
export function rankFor(ranks: Rank[], xp: number): { rank: Rank; next?: Rank; pct: number } {
  const sorted = [...ranks].sort((a, b) => a.minXp - b.minXp);
  let rank = sorted[0];
  for (const r of sorted) if (xp >= r.minXp) rank = r;
  const next = sorted.find((r) => r.minXp > rank.minXp);
  const pct = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, pct: Math.max(0, Math.min(1, pct)) };
}

// ---------- attainment ----------
export function coAttainment(db: DB, courseId: string, studentId?: string): Record<string, { pct: number; n: number }> {
  const out: Record<string, { pct: number; n: number }> = {};
  const course = db.courses.find((c) => c.id === courseId)!;
  for (const co of course.cos) {
    const fbs = db.feedback.filter((f) => {
      const task = db.tasks.find((t) => t.id === unitTask(f.unitId));
      if (!task || task.coId !== co.id) return false;
      if (studentId && f.studentId !== studentId) return false;
      const latest = latestSubmission(db, f.unitId, f.studentId);
      return latest?.id === f.submissionId && statusOf(db, f.unitId, f.studentId) === 'complete';
    });
    out[co.id] = { pct: fbs.length ? fbs.reduce((a, f) => a + f.total, 0) / fbs.length : 0, n: fbs.length };
  }
  return out;
}
/** PO/PSO attainment = correlation-weighted mean of the CO attainments mapped to it. */
export function outcomeAttainment(db: DB, courseIds: string[], studentId?: string): Record<string, number> {
  const num: Record<string, number> = {};
  const den: Record<string, number> = {};
  for (const cid of courseIds) {
    const course = db.courses.find((c) => c.id === cid)!;
    const att = coAttainment(db, cid, studentId);
    for (const co of course.cos) {
      if (!att[co.id].n) continue;
      for (const [k, lvl] of Object.entries(co.map)) {
        if (!lvl) continue;
        num[k] = (num[k] ?? 0) + lvl * att[co.id].pct;
        den[k] = (den[k] ?? 0) + lvl;
      }
    }
  }
  return Object.fromEntries(Object.keys(num).map((k) => [k, num[k] / den[k]]));
}

// ---------- engagement ----------
export interface Engagement {
  studentId: string;
  submitted: number;
  due: number;
  submissionRate: number;
  onTimeRate: number;
  peerAvg: number;
  xp: number;
  risks: string[];
}
export function engagement(db: DB, courseId: string, nowMs = Date.now()): Engagement[] {
  const course = db.courses.find((c) => c.id === courseId)!;
  const cycleIds = db.peerCycles.map((c) => c.id);
  const evals = db.peerEvals.filter((e) => cycleIds.includes(e.cycleId));
  return db.users.filter((u) => u.role === 'student' && u.courseIds.includes(courseId)).map((u) => {
    const units = unitsFor(db, u.id, courseId, nowMs).filter((x) => !x.locked && new Date(x.due).getTime() < nowMs + 3 * 24 * HOUR);
    const submitted = units.filter((x) => x.status !== 'assigned').length;
    const subs = db.submissions.filter((s) => s.studentId === u.id && s.version === 1 && units.some((x) => x.unitId === s.unitId));
    const onTime = subs.filter((s) => s.onTime).length;
    const p = peerScoreFor(evals, u.id);
    const risks: string[] = [];
    const rate = units.length ? submitted / units.length : 1;
    if (rate < db.settings.atRiskSubmissionRate) risks.push(`Low submission rate (${Math.round(rate * 100)}%)`);
    if (p.count && p.avg < db.settings.atRiskPeerScore) risks.push(`Low peer-contribution score (${p.avg.toFixed(1)})`);
    void course;
    return { studentId: u.id, submitted, due: units.length, submissionRate: rate, onTimeRate: subs.length ? onTime / subs.length : 1, peerAvg: p.avg, xp: xpTotal(db, u.id), risks };
  });
}

// ---------- reminders (one mechanism for every time-bound student action) ----------
export interface Reminder { id: string; kind: 'deadline' | 'competition' | 'peer' | 'overdue'; title: string; dueAt: string; page: string; urgent: boolean }
export function remindersFor(db: DB, studentId: string, nowMs = Date.now()): Reminder[] {
  const out: Reminder[] = [];
  for (const u of unitsFor(db, studentId, undefined, nowMs)) {
    if (u.status === 'complete' || u.locked) continue;
    const t = new Date(u.due).getTime();
    if (u.status === 'assigned' || u.status === 'revision') {
      if (t < nowMs) out.push({ id: `od-${u.unitId}`, kind: 'overdue', title: `Overdue: ${u.title}`, dueAt: u.due, page: 'quests', urgent: true });
      else if (t - nowMs <= db.settings.reminderHours * HOUR) out.push({ id: `dl-${u.unitId}`, kind: 'deadline', title: `Due soon: ${u.title}`, dueAt: u.due, page: 'quests', urgent: t - nowMs < 24 * HOUR });
    }
  }
  const user = db.users.find((u) => u.id === studentId)!;
  for (const c of db.competitions.filter((x) => !x.archived)) {
    const t = new Date(c.deadline + 'T23:59:00').getTime();
    const entry = db.compEntries.find((e) => e.competitionId === c.id && e.studentId === studentId);
    const relevant = entry && entry.marker !== 'none' && entry.outcome === 'none';
    if (relevant && t > nowMs && t - nowMs <= 14 * 24 * HOUR) out.push({ id: `cp-${c.id}`, kind: 'competition', title: `Competition deadline: ${c.name}`, dueAt: c.deadline, page: 'competitions', urgent: t - nowMs < 5 * 24 * HOUR });
  }
  for (const c of db.peerCycles.filter((x) => x.status === 'open')) {
    const task = db.tasks.find((t) => t.id === c.taskId);
    const g = db.groups.find((x) => x.id === task?.group?.groupId);
    if (!g?.memberIds.includes(studentId) || !user.courseIds.includes(task!.courseId)) continue;
    const done = db.peerEvals.filter((e) => e.cycleId === c.id && e.evaluatorId === studentId).length >= g.memberIds.length;
    if (!done) out.push({ id: `pe-${c.id}`, kind: 'peer', title: `Peer evaluation due: ${c.label}`, dueAt: c.due, page: 'peer', urgent: new Date(c.due).getTime() - nowMs < 48 * HOUR });
  }
  return out.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

// ---------- instructor alerts ----------
export interface Alert { id: string; kind: 'submission' | 'peer-flag' | 'at-risk' | 'ip-gate'; title: string; detail: string; page: string; urgent: boolean }
export function instructorAlerts(db: DB, nowMs = Date.now()): Alert[] {
  const out: Alert[] = [];
  for (const p of db.progress.filter((x) => x.status === 'submitted' || x.status === 'resubmitted')) {
    const task = db.tasks.find((t) => t.id === unitTask(p.unitId))!;
    const sub = latestSubmission(db, p.unitId, p.studentId);
    const waitH = sub ? Math.round((nowMs - new Date(sub.submittedAt).getTime()) / HOUR) : 0;
    out.push({ id: `sub-${p.key}`, kind: 'submission', title: `${userName(db, p.studentId)} — ${task.title}${isMilestoneUnit(p.unitId) ? ' · ' + unitMilestone(p.unitId).toUpperCase() : ''}`, detail: `v${sub?.version} awaiting feedback for ${waitH}h`, page: 'grading', urgent: waitH > 72 });
  }
  for (const e of db.peerEvals.filter((x) => x.flag?.status === 'pending')) {
    out.push({ id: `flag-${e.id}`, kind: 'peer-flag', title: `Peer-score outlier: ${userName(db, e.evaluatorId)} → ${e.evaluatorId === e.evaluateeId ? 'self' : userName(db, e.evaluateeId)}`, detail: e.flag!.reason, page: 'groups', urgent: true });
  }
  for (const c of db.courses) for (const r of engagement(db, c.id, nowMs).filter((x) => x.risks.length)) {
    out.push({ id: `risk-${c.id}-${r.studentId}`, kind: 'at-risk', title: `At risk: ${userName(db, r.studentId)} (${c.code})`, detail: r.risks.join(' · '), page: 'analytics', urgent: true });
  }
  for (const p of db.projects) {
    const course = db.courses.find((c) => c.id === p.courseId)!;
    if (course.disclosureGate && p.ipStatus === 'unscreened') out.push({ id: `ip-${p.id}`, kind: 'ip-gate', title: `IP screening needed: ${p.title}`, detail: 'Project is blocked from portfolio-ready / competition-eligible until screening is logged.', page: 'ip', urgent: true });
  }
  return out;
}
