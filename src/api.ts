// Data layer. Components NEVER touch storage or mutate records directly — they call commands defined here
// (via the zustand store). Swap `loadDb` / `saveDb` for fetch calls and nothing else changes.
// Every command: (draft, actor, ...args). Authority, timestamps, gates and audit all live here, not in the UI.
import type {
  Annotation, DB, Feedback, IPStatus, PeerCriterion, PeerEval, Progress, Submission, User, XpRequest,
} from './types';
import { PEER_CRITERIA, isMilestoneUnit, unitMilestone, unitTask } from './types';
import { buildSeed, SEED_VERSION, autoSummary } from './data/seed';
import { abilityFor, subject } from './lib/permissions';
import { detectOutliers, peerScoreFor } from './lib/peer';
import { rankFor, xpTotal, latestSubmission, statusOf, effectiveDeadline, submissionsOf, userName } from './lib/selectors';
import type { XpAward } from './lib/rules';

const KEY = 'studio-portal-db-v1';

export function loadDb(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as DB;
      if (db.seedVersion === SEED_VERSION) return db;
    }
  } catch { /* fall through to seed */ }
  return buildSeed();
}
export function saveDb(db: DB) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota */ }
}
export function resetDb(): DB {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return buildSeed();
}
export const dbStorageKey = KEY;

// ---------- errors & helpers ----------
export type BlockCode = 'forbidden' | 'feedback-required' | 'gate' | 'locked' | 'conflict' | 'justification' | 'stale' | 'invalid' | 'duplicate' | 'state';
export class Blocked extends Error {
  code: BlockCode;
  constructor(code: BlockCode, message: string) { super(message); this.code = code; }
}
/** Server clock — authoritative for every deadline decision. Clients cannot supply timestamps. */
const nowIso = () => new Date().toISOString();
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

function need(actor: User, action: string, sub: string, obj?: object) {
  const ok = abilityFor(actor).can(action, obj ? subject(sub, obj as never) : sub);
  if (!ok) throw new Blocked('forbidden', `Your role (${actor.role}) is not permitted to ${action} ${sub}.`);
}
export const can = (actor: User, action: string, sub: string, obj?: object) =>
  abilityFor(actor).can(action, obj ? subject(sub, obj as never) : sub);

function audit(d: DB, actor: User | { id: string; role: User['role'] }, action: string, entity: string, entityId: string, summary: string, extra: { before?: string; after?: string; justification?: string } = {}) {
  d.audit.unshift({ id: uid('au'), at: nowIso(), actorId: actor.id, actorRole: actor.role, action, entity, entityId, summary, ...extra });
}
function notify(d: DB, userId: string, kind: DB['notifications'][number]['kind'], title: string, body: string, page?: string) {
  d.notifications.unshift({ id: uid('nt'), userId, kind, title, body, at: nowIso(), read: false, page });
}
const SYSTEM = { id: 'system', role: 'instructor' as const };
const staffOfCourse = (d: DB, courseId: string) => d.users.filter((u) => u.role !== 'student' && u.role !== 'hod' && u.courseIds.includes(courseId) && u.role !== 'ta');

// ---------- generic grid persistence (with concurrent-edit detection) ----------
export type CollectionKey = 'cos' | 'resources' | 'plan' | 'customFields' | 'cas' | 'tasks' | 'competitions' | 'xpRules' | 'ranks' | 'peerCycles' | 'templates';
type Row = { id: string; rev?: number } & Record<string, unknown>;
interface Accessor { subject: string; get: (d: DB, scope: string) => Row[]; set: (d: DB, scope: string, rows: Row[]) => void }
const courseOf = (d: DB, id: string) => d.courses.find((c) => c.id === id)!;
const scoped = <K extends 'cas' | 'tasks'>(k: K) => ({
  get: (d: DB, scope: string) => d[k].filter((x) => x.courseId === scope) as unknown as Row[],
  set: (d: DB, scope: string, rows: Row[]) => {
    const others = d[k].filter((x) => x.courseId !== scope);
    (d[k] as unknown[]) = [...others, ...rows];
  },
});
const ACCESS: Record<CollectionKey, Accessor> = {
  cos: { subject: 'Course', get: (d, s) => courseOf(d, s).cos as unknown as Row[], set: (d, s, r) => { courseOf(d, s).cos = r as never; } },
  resources: { subject: 'Resource', get: (d, s) => courseOf(d, s).resources as unknown as Row[], set: (d, s, r) => { courseOf(d, s).resources = r as never; } },
  plan: { subject: 'Plan', get: (d, s) => courseOf(d, s).plan as unknown as Row[], set: (d, s, r) => { courseOf(d, s).plan = r as never; } },
  customFields: { subject: 'Course', get: (d, s) => courseOf(d, s).customFields as unknown as Row[], set: (d, s, r) => { courseOf(d, s).customFields = r as never; } },
  cas: { subject: 'Task', ...scoped('cas') },
  tasks: { subject: 'Task', ...scoped('tasks') },
  competitions: { subject: 'Competition', get: (d) => d.competitions as unknown as Row[], set: (d, _s, r) => { d.competitions = r as never; } },
  xpRules: { subject: 'XPRule', get: (d) => d.xpRules as unknown as Row[], set: (d, _s, r) => { d.xpRules = r as never; } },
  ranks: { subject: 'Rank', get: (d) => d.ranks as unknown as Row[], set: (d, _s, r) => { d.ranks = r as never; } },
  peerCycles: { subject: 'Course', get: (d, s) => d.peerCycles.filter((c) => c.taskId === s) as unknown as Row[], set: (d, s, r) => { d.peerCycles = [...d.peerCycles.filter((c) => c.taskId !== s), ...(r as never[])]; } },
  templates: { subject: 'Feedback', get: (d) => d.templates as unknown as Row[], set: (d, _s, r) => { d.templates = r as never; } },
};
export type SaveMeta = { reason: 'edit' | 'add' | 'delete' | 'reorder' | 'paste' | 'fill' | 'undo' | 'redo' | 'bulk'; label: string };

/** Persist a whole editable grid. Rejects (never silently overwrites) when any incoming row is stale. */
export function saveRows(d: DB, actor: User, collection: CollectionKey, scope: string, rows: Row[], meta: SaveMeta) {
  const acc = ACCESS[collection];
  need(actor, meta.reason === 'delete' ? 'delete' : 'update', acc.subject);
  if (collection === 'tasks') {
    const existing = new Map(acc.get(d, scope).map((c) => [c.id, c]));
    if (rows.some((r) => existing.has(r.id) && JSON.stringify(r.rubric) !== JSON.stringify(existing.get(r.id)!.rubric))) need(actor, 'update', 'Rubric');
  }
  const current = acc.get(d, scope);
  const curMap = new Map(current.map((r) => [r.id, r]));
  const conflicts: string[] = [];
  const next: Row[] = rows.map((r, idx) => {
    const cur = curMap.get(r.id);
    if (!cur) return { ...r, rev: 1 };
    if (cur.rev !== undefined && r.rev !== cur.rev && meta.reason !== 'undo' && meta.reason !== 'redo') {
      conflicts.push(String(r.title ?? r.name ?? r.code ?? r.id));
      return cur;
    }
    const changed = JSON.stringify({ ...r, rev: 0 }) !== JSON.stringify({ ...cur, rev: 0 });
    if (!changed) return cur;
    const out: Row = { ...r, rev: (cur.rev ?? 0) + 1 };
    if (collection === 'tasks' && JSON.stringify(r.rubric) !== JSON.stringify(cur.rubric)) out.rubricVersion = ((cur.rubricVersion as number) ?? 1) + 1;
    void idx;
    return out;
  });
  if (conflicts.length)
    throw new Blocked('conflict', `This was just updated by someone else: ${conflicts.join(', ')}. Your edit was not applied — the latest version is now shown.`);
  if (collection === 'tasks') {
    const perCa: Record<string, number> = {};
    for (const r of next) { perCa[r.caId as string] = (perCa[r.caId as string] ?? 0) + 1; r.order = perCa[r.caId as string]; }
  }
  if (collection === 'cas' || collection === 'plan') next.forEach((r, i) => { if (collection === 'cas') r.order = i + 1; });
  const ids = new Set(next.map((r) => r.id));
  const added = next.filter((r) => !curMap.has(r.id));
  const removed = current.filter((r) => !ids.has(r.id));
  const changedRows = next.filter((r) => curMap.has(r.id) && curMap.get(r.id) !== r);
  if (collection === 'cas' && next.length > 3 && next.length > current.length) throw new Blocked('invalid', 'A course can have at most 3 Continuous Assessment components.');
  if (collection === 'cas' && next.length < 1) throw new Blocked('invalid', 'A course needs at least 1 Continuous Assessment component.');
  if (collection === 'ranks' && next.length < 2) throw new Blocked('invalid', 'Keep at least two ranks.');
  acc.set(d, scope, next);
  if (!added.length && !removed.length && !changedRows.length && meta.reason !== 'reorder') return;
  const first = changedRows[0] ? { before: JSON.stringify(curMap.get(changedRows[0].id)).slice(0, 240), after: JSON.stringify(changedRows[0]).slice(0, 240) } : {};
  audit(d, actor, `${collection}.${meta.reason}`, collection, scope || collection,
    `${meta.label}: ${added.length ? `+${added.length} added ` : ''}${removed.length ? `−${removed.length} removed ` : ''}${changedRows.length ? `${changedRows.length} edited` : ''}${meta.reason === 'reorder' ? 'reordered' : ''}`.trim(), first);
}

export function updateCourse(d: DB, actor: User, courseId: string, patch: Record<string, unknown>, rev: number, label: string) {
  need(actor, 'update', patch.disclosureGate !== undefined ? 'IPGate' : 'Course');
  const c = courseOf(d, courseId);
  if (c.rev !== rev) throw new Blocked('conflict', 'This course was just updated by someone else. Latest version loaded — re-apply your change.');
  const before = JSON.stringify(Object.fromEntries(Object.keys(patch).map((k) => [k, (c as never)[k]]))).slice(0, 200);
  Object.assign(c, patch);
  c.rev++;
  audit(d, actor, 'course.update', 'Course', courseId, `${c.code}: ${label}`, { before, after: JSON.stringify(patch).slice(0, 200) });
}

export function updateTask(d: DB, actor: User, taskId: string, patch: Record<string, unknown>, rev: number, label: string) {
  need(actor, 'update', 'Task');
  const t = d.tasks.find((x) => x.id === taskId)!;
  if (t.rev !== rev) throw new Blocked('conflict', 'This task was just updated by someone else. Latest version loaded — re-apply your change.');
  if (patch.rubric) { need(actor, 'update', 'Rubric'); t.rubricVersion++; }
  Object.assign(t, patch);
  t.rev++;
  audit(d, actor, 'task.update', 'Task', taskId, `${t.title}: ${label}`);
}

export function updateSettings(d: DB, actor: User, patch: Partial<DB['settings']>) {
  need(actor, 'update', 'Analytics');
  const before = JSON.stringify(d.settings);
  Object.assign(d.settings, patch);
  audit(d, actor, 'settings.update', 'Settings', 'settings', 'Thresholds updated', { before, after: JSON.stringify(d.settings) });
}

// ---------- closed-loop task lifecycle ----------
const isStaff = (u: User) => u.role !== 'student';

export function submitWork(d: DB, actor: User, input: { unitId: string; fileNames: string[]; note: string; ticked: string[]; seenRubricVersion: number; ackRubric?: boolean; submittedAt?: string }) {
  need(actor, 'create', 'Submission');
  // NOTE: input.submittedAt (if a forged client sends it) is deliberately ignored — server time only.
  const task = d.tasks.find((t) => t.id === unitTask(input.unitId));
  if (!task) throw new Blocked('invalid', 'Unknown task.');
  if (!actor.courseIds.includes(task.courseId)) throw new Blocked('forbidden', 'You are not enrolled in this course.');
  if (!input.fileNames.length) throw new Blocked('invalid', 'Attach at least one file before submitting.');
  let due = effectiveDeadline(task, actor.id);
  if (isMilestoneUnit(input.unitId)) {
    const g = task.group!;
    const group = d.groups.find((x) => x.id === g.groupId)!;
    if (!group.memberIds.includes(actor.id)) throw new Blocked('forbidden', 'You are not in this group.');
    const idx = g.milestones.findIndex((m) => m.id === unitMilestone(input.unitId));
    const prev = g.milestones[idx - 1];
    if (prev && !d.artifacts.some((a) => a.taskId === task.id && a.milestoneId === prev.id))
      throw new Blocked('locked', `Locked: ${prev.title} feedback + peer summary has not been published yet. The next milestone opens only after it is.`);
    due = effectiveDeadline(task, actor.id, g.milestones[idx].due);
  }
  if (input.seenRubricVersion !== task.rubricVersion && !input.ackRubric)
    throw new Blocked('conflict', 'The rubric was updated by the instructor while you were working. Review the changed criteria, then submit again.');
  const status = statusOf(d, input.unitId, actor.id);
  if (status === 'submitted' || status === 'resubmitted') throw new Blocked('state', 'You already have a version awaiting feedback. You can resubmit once feedback is posted.');
  if (status === 'feedback') throw new Blocked('state', 'Feedback is posted; this unit is waiting on the reviewer decision.');
  if (status === 'complete') throw new Blocked('state', 'This unit is complete — nothing further can be submitted.');
  const prior = submissionsOf(d, input.unitId, actor.id);
  const now = nowIso();
  const sub: Submission = {
    id: uid('sub'), unitId: input.unitId, studentId: actor.id, version: prior.length + 1, fileNames: input.fileNames, note: input.note,
    submittedAt: now, onTime: new Date(now).getTime() <= new Date(due).getTime(),
    unticked: task.rubric.filter((k) => k.selfCheck && !input.ticked.includes(k.id)).map((k) => k.id), rubricVersion: task.rubricVersion,
  };
  d.submissions.push(sub);
  setProgress(d, input.unitId, actor.id, prior.length ? 'resubmitted' : 'submitted');
  audit(d, actor, 'submission.create', 'Submission', sub.id, `${actor.name} submitted v${sub.version} of ${task.title}${sub.onTime ? '' : ' (LATE)'}`);
  for (const s of staffOfCourse(d, task.courseId)) notify(d, s.id, 'system', `Submission awaiting feedback`, `${actor.name} — ${task.title} v${sub.version}`, 'grading');
  return sub;
}

function setProgress(d: DB, unitId: string, studentId: string, status: Progress['status'], completedAt?: string) {
  const key = `${unitId}:${studentId}`;
  const ex = d.progress.find((p) => p.key === key);
  const before = ex?.status ?? 'assigned';
  if (ex) { ex.status = status; if (completedAt) ex.completedAt = completedAt; } else d.progress.push({ key, unitId, studentId, status, completedAt });
  audit(d, SYSTEM, 'status.change', 'Progress', key, `${userName(d, studentId)} · ${unitId}: ${before} → ${status}`, { before, after: status });
}

export interface FeedbackInput { submissionId: string; scores: Record<string, number>; comment: string; annotations: Annotation[]; decision: 'pass' | 'revise' }
export function postFeedback(d: DB, actor: User, input: FeedbackInput): Feedback {
  need(actor, 'grade', 'Submission');
  const sub = d.submissions.find((s) => s.id === input.submissionId);
  if (!sub) throw new Blocked('invalid', 'Unknown submission.');
  const latest = latestSubmission(d, sub.unitId, sub.studentId)!;
  if (latest.id !== sub.id) throw new Blocked('stale', `This feedback targets v${sub.version} but v${latest.version} is the current version. Feedback is always tied to the version it reviews.`);
  if (d.feedback.some((f) => f.submissionId === sub.id)) throw new Blocked('duplicate', `Feedback already exists for v${sub.version}. Use "change grade" (logged, with justification) instead of overwriting.`);
  const task = d.tasks.find((t) => t.id === unitTask(sub.unitId))!;
  const scores: Record<string, number> = {};
  for (const k of task.rubric) scores[k.id] = Math.max(0, Math.min(k.max, Math.round(input.scores[k.id] ?? 0)));
  const max = task.rubric.reduce((a, k) => a + k.max, 0);
  const total = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / max) * 100);
  const f: Feedback = {
    id: uid('fb'), unitId: sub.unitId, studentId: sub.studentId, version: sub.version, submissionId: sub.id, createdAt: nowIso(), byId: actor.id,
    scores, total, autoSummary: autoSummary(task, scores, sub.unticked), comment: input.comment, annotations: input.annotations, decision: input.decision, gradeHistory: [], read: false,
  };
  d.feedback.push(f);
  audit(d, actor, 'feedback.post', 'Feedback', f.id, `${actor.name} graded ${userName(d, sub.studentId)} · ${task.title} v${sub.version}: ${total}% (${input.decision})`, { after: String(total) });
  setProgress(d, sub.unitId, sub.studentId, 'feedback');
  notify(d, sub.studentId, 'feedback', `Feedback received — ${task.title}`, input.decision === 'pass' ? `v${sub.version}: ${total}%. Quest passed.` : `v${sub.version}: ${total}%. Revision requested.`, 'feedback');
  if (input.decision === 'pass') completeUnit(d, actor, sub.unitId, sub.studentId);
  else setProgress(d, sub.unitId, sub.studentId, 'revision');
  return f;
}

/** A unit can only complete if a feedback artifact exists for the LATEST version. No exceptions, no override path. */
export function completeUnit(d: DB, actor: User, unitId: string, studentId: string) {
  need(actor, 'grade', 'Submission');
  const latest = latestSubmission(d, unitId, studentId);
  if (!latest) throw new Blocked('feedback-required', 'Cannot complete: nothing has been submitted yet.');
  const fb = d.feedback.find((f) => f.submissionId === latest.id);
  if (!fb) throw new Blocked('feedback-required', `Cannot complete: no feedback exists for v${latest.version}. Every task must pass through a feedback step before completion.`);
  if (statusOf(d, unitId, studentId) === 'complete') throw new Blocked('state', 'Already complete.');
  setProgress(d, unitId, studentId, 'complete', nowIso());
  const task = d.tasks.find((t) => t.id === unitTask(unitId))!;
  const first = submissionsOf(d, unitId, studentId)[0];
  const milestone = isMilestoneUnit(unitId);
  d.pendingXp.push({
    id: uid('xq'), studentId, unitId, version: latest.version,
    label: milestone ? `Milestone passed — ${task.group!.milestones.find((m) => m.id === unitMilestone(unitId))?.title}` : task.title,
    facts: { action: 'task_complete', onTime: first.onTime, revised: latest.version > 1, hasFeedback: true, isMilestone: milestone },
  });
  d.celebrations.push({ id: uid('cel'), userId: studentId, kind: milestone ? 'milestone' : 'quest', title: milestone ? 'Milestone cleared!' : 'Quest complete!', sub: task.title, seen: false });
}

export function changeGrade(d: DB, actor: User, feedbackId: string, newTotal: number, justification: string) {
  need(actor, 'grade', 'Submission');
  const f = d.feedback.find((x) => x.id === feedbackId)!;
  if (justification.trim().length < 10) throw new Blocked('justification', 'A grade change needs a written justification (min 10 characters). It is recorded in the audit log.');
  if (!(newTotal >= 0 && newTotal <= 100)) throw new Blocked('invalid', 'Grade must be between 0 and 100.');
  f.gradeHistory.push({ at: nowIso(), by: actor.id, from: f.total, to: newTotal, justification });
  audit(d, actor, 'grade.change', 'Feedback', f.id, `Grade for ${userName(d, f.studentId)} changed ${f.total}% → ${newTotal}%`, { before: String(f.total), after: String(newTotal), justification });
  f.total = newTotal;
  notify(d, f.studentId, 'feedback', 'Your grade was adjusted', `New grade ${newTotal}%. Reason is recorded in the audit log.`, 'feedback');
}

export function bulkFeedback(d: DB, actor: User, submissionIds: string[], templateId: string) {
  need(actor, 'grade', 'Submission');
  const tpl = d.templates.find((t) => t.id === templateId)!;
  let ok = 0; const skipped: string[] = [];
  for (const id of submissionIds) {
    const sub = d.submissions.find((s) => s.id === id);
    if (!sub) continue;
    const task = d.tasks.find((t) => t.id === unitTask(sub.unitId))!;
    try {
      postFeedback(d, actor, {
        submissionId: id, scores: Object.fromEntries(task.rubric.map((k) => [k.id, Math.round((k.max * tpl.pct) / 100)])),
        comment: `<p>${tpl.comment}</p>`, annotations: [], decision: tpl.decision,
      });
      ok++;
    } catch (e) { skipped.push(`${userName(d, sub.studentId)}: ${(e as Error).message}`); }
  }
  audit(d, actor, 'feedback.bulk', 'Feedback', templateId, `Template “${tpl.name}” applied to ${ok} submission(s)`);
  return { ok, skipped };
}

export function extendDeadline(d: DB, actor: User, taskId: string, studentIds: string[], until: string, reason: string) {
  need(actor, 'update', 'Task');
  if (reason.trim().length < 5) throw new Blocked('justification', 'An extension needs a documented reason (e.g. medical leave).');
  const t = d.tasks.find((x) => x.id === taskId)!;
  for (const s of studentIds) {
    t.extensions[s] = { until: new Date(until).toISOString(), reason };
    notify(d, s, 'deadline', `Deadline extended — ${t.title}`, `New deadline ${new Date(until).toLocaleDateString('en-IN')}.`, 'quests');
  }
  t.rev++;
  audit(d, actor, 'deadline.extend', 'Task', taskId, `Extended ${t.title} for ${studentIds.map((s) => userName(d, s)).join(', ')}`, { after: until, justification: reason });
}

export function markFeedbackRead(d: DB, _actor: User, feedbackId: string) {
  const f = d.feedback.find((x) => x.id === feedbackId);
  if (f) f.read = true;
}

// ---------- group milestone artifact (instructor feedback + peer eval merged) ----------
export function publishMilestoneArtifact(d: DB, actor: User, taskId: string, milestoneId: string) {
  need(actor, 'grade', 'Submission');
  const task = d.tasks.find((t) => t.id === taskId)!;
  const g = d.groups.find((x) => x.id === task.group!.groupId)!;
  if (d.artifacts.some((a) => a.taskId === taskId && a.milestoneId === milestoneId)) throw new Blocked('duplicate', 'Already published.');
  const m = task.group!.milestones.find((x) => x.id === milestoneId)!;
  const unit = `${taskId}#${milestoneId}`;
  const missing = g.memberIds.filter((s) => { const l = latestSubmission(d, unit, s); return !l || !d.feedback.some((f) => f.submissionId === l.id); });
  if (missing.length) throw new Blocked('feedback-required', `Cannot publish: no feedback yet for ${missing.map((s) => userName(d, s)).join(', ')}.`);
  const cycle = d.peerCycles.find((c) => c.taskId === taskId && c.milestoneId === milestoneId);
  if (cycle) {
    if (cycle.status !== 'closed') throw new Blocked('state', `Peer evaluation cycle “${cycle.label}” is still ${cycle.status}. Close it before publishing the merged artifact.`);
    const pend = d.peerEvals.filter((e) => e.cycleId === cycle.id && e.flag?.status === 'pending').length;
    if (pend) throw new Blocked('state', `${pend} flagged peer score(s) need your review before the artifact can be published.`);
  }
  const evs = cycle ? d.peerEvals.filter((e) => e.cycleId === cycle.id) : [];
  const peerAvg: Record<string, number> = {};
  const fids: string[] = [];
  for (const s of g.memberIds) {
    const p = peerScoreFor(evs, s);
    peerAvg[s] = Math.round(p.avg * 10) / 10;
    const f = d.feedback.find((x) => x.submissionId === latestSubmission(d, unit, s)!.id)!;
    f.peerSummary = { avg: peerAvg[s], count: p.count, flagged: p.flagged };
    fids.push(f.id);
  }
  const art = { id: uid('art'), taskId, milestoneId, publishedAt: nowIso(), byId: actor.id, feedbackIds: fids, peerAvg, summary: `${m.title}: instructor feedback and peer evaluation merged.` };
  d.artifacts.push(art);
  audit(d, actor, 'milestone.publish', 'MilestoneArtifact', art.id, `${task.title} · ${m.title} artifact published`);
  const next = task.group!.milestones[task.group!.milestones.findIndex((x) => x.id === milestoneId) + 1];
  for (const s of g.memberIds) {
    notify(d, s, 'milestone', next ? `Milestone unlocked — ${next.title}` : `${m.title} artifact published`, 'Merged feedback + peer evaluation summary is ready.', 'feedback');
    if (next) d.celebrations.push({ id: uid('cel'), userId: s, kind: 'milestone', title: 'Next milestone unlocked', sub: next.title, seen: false });
  }
  return art;
}

// ---------- peer evaluation ----------
export function closePeerCycle(d: DB, actor: User, cycleId: string) {
  need(actor, 'update', 'Course');
  const c = d.peerCycles.find((x) => x.id === cycleId)!;
  c.status = 'closed'; c.rev++;
  flagCycle(d, cycleId);
  audit(d, actor, 'peer.cycle.close', 'PeerCycle', cycleId, `${c.label} closed`);
}
function flagCycle(d: DB, cycleId: string) {
  const c = d.peerCycles.find((x) => x.id === cycleId)!;
  const course = courseOf(d, d.tasks.find((t) => t.id === c.taskId)!.courseId);
  const evs = d.peerEvals.filter((e) => e.cycleId === cycleId);
  const flags = detectOutliers(evs, course.peer);
  for (const e of evs) if (flags[e.id] && !e.flag) {
    e.flag = { reason: flags[e.id], status: 'pending' };
    audit(d, SYSTEM, 'peer.flag', 'PeerEval', e.id, `Outlier flagged: ${userName(d, e.evaluatorId)} → ${userName(d, e.evaluateeId)}`, { after: flags[e.id] });
    for (const s of staffOfCourse(d, course.id)) notify(d, s.id, 'peer', 'Peer-score outlier flagged', flags[e.id], 'groups');
  }
}
export function submitPeerRound(d: DB, actor: User, cycleId: string, entries: { evaluateeId: string; scores: Record<PeerCriterion, number>; comment: string }[]) {
  need(actor, 'create', 'PeerEval');
  const cycle = d.peerCycles.find((c) => c.id === cycleId)!;
  if (cycle.status !== 'open') throw new Blocked('state', 'This peer-evaluation cycle is not open.');
  const task = d.tasks.find((t) => t.id === cycle.taskId)!;
  const g = d.groups.find((x) => x.id === task.group!.groupId)!;
  if (!g.memberIds.includes(actor.id)) throw new Blocked('forbidden', 'Only group members can evaluate.');
  if (d.peerEvals.some((e) => e.cycleId === cycleId && e.evaluatorId === actor.id)) throw new Blocked('locked', 'Your evaluation for this cycle is submitted and locked. Scores cannot be edited after submission.');
  const targets = new Set(entries.map((e) => e.evaluateeId));
  if (g.memberIds.some((m) => !targets.has(m)) || entries.length !== g.memberIds.length) throw new Blocked('invalid', 'Rate every group member including yourself — a round is submitted as a whole.');
  for (const e of entries) {
    for (const c of PEER_CRITERIA) if (!Number.isInteger(e.scores[c]) || e.scores[c] < 1 || e.scores[c] > 5) throw new Blocked('invalid', 'Every criterion needs a score from 1 to 5.');
  }
  const now = nowIso();
  for (const e of entries) d.peerEvals.push({ id: uid('pe'), cycleId, evaluatorId: actor.id, evaluateeId: e.evaluateeId, scores: e.scores, comment: e.comment, submittedAt: now, locked: true });
  flagCycle(d, cycleId);
  audit(d, actor, 'peer.submit', 'PeerEval', cycleId, `${actor.name} submitted peer evaluation for ${cycle.label}`);
  d.pendingXp.push({ id: uid('xq'), studentId: actor.id, unitId: cycleId, facts: { action: 'peer_eval' }, label: `Peer evaluation completed — ${cycle.label}` });
}
/** Exists so the integrity lab can prove the constraint: no one can edit a submitted peer score. */
export function editPeerEval(_d: DB, actor: User, evalId: string, _scores: Record<string, number>) {
  void evalId;
  throw new Blocked('locked', `Peer evaluations are immutable once submitted (attempted by ${actor.name}). Raise a dispute with the instructor instead.`);
}
export function resolveFlag(d: DB, actor: User, evalId: string, decision: 'accepted' | 'discarded', justification: string) {
  need(actor, 'update', 'PeerEval');
  if (justification.trim().length < 10) throw new Blocked('justification', 'Resolving a flagged score needs a written justification (min 10 characters).');
  const e = d.peerEvals.find((x) => x.id === evalId)!;
  e.flag = { ...e.flag!, status: decision, resolvedBy: actor.id, resolvedAt: nowIso(), justification };
  audit(d, actor, 'peer.flag.resolve', 'PeerEval', evalId, `Flag ${decision}: ${userName(d, e.evaluatorId)} → ${userName(d, e.evaluateeId)}`, { after: decision, justification });
}
export function logEffort(d: DB, actor: User, taskId: string, milestoneId: string, hours: number, note: string) {
  need(actor, 'create', 'EffortLog');
  if (!(hours > 0 && hours <= 40)) throw new Blocked('invalid', 'Enter hours between 0.5 and 40.');
  d.effort.push({ id: uid('ef'), taskId, milestoneId, studentId: actor.id, hours, note, at: nowIso() });
}
export function logContribution(d: DB, actor: User, taskId: string, milestoneId: string, text: string) {
  need(actor, 'create', 'ContributionLog');
  if (text.trim().length < 3) throw new Blocked('invalid', 'Describe what you did.');
  d.contributions.push({ id: uid('ct'), taskId, milestoneId, studentId: actor.id, text, at: nowIso() });
}

// ---------- XP ----------
export function grantManualXp(d: DB, actor: User, studentId: string, points: number, justification: string) {
  need(actor, 'update', 'XPRule');
  if (justification.trim().length < 10) throw new Blocked('justification', 'Manual XP changes need a logged justification (min 10 characters). No silent overrides.');
  if (!points || !Number.isFinite(points)) throw new Blocked('invalid', 'Enter a non-zero point value.');
  const ev = { id: uid('xp'), studentId, points, label: points > 0 ? 'Manual award' : 'Manual deduction', kind: 'manual' as const, justification, byId: actor.id, at: nowIso() };
  const before = xpTotal(d, studentId);
  d.xpEvents.push(ev);
  audit(d, actor, 'xp.manual', 'XPEvent', ev.id, `${points > 0 ? '+' : ''}${points} XP to ${userName(d, studentId)}`, { before: String(before), after: String(before + points), justification });
  checkRank(d, studentId, before);
}
function checkRank(d: DB, studentId: string, before: number) {
  const a = rankFor(d.ranks, before).rank, b = rankFor(d.ranks, xpTotal(d, studentId)).rank;
  if (a.id !== b.id && b.minXp > a.minXp) {
    notify(d, studentId, 'rank', `Rank achieved — ${b.name}`, `You reached ${b.name} (${b.minXp}+ XP).`, 'xp');
    d.celebrations.push({ id: uid('cel'), userId: studentId, kind: 'rank', title: `Rank up: ${b.name}`, sub: `${xpTotal(d, studentId)} XP`, seen: false });
  }
}
/** Apply rule-engine results. Re-verifies the feedback invariant: XP never lands without a feedback event. */
export function applyXp(d: DB, _actor: User, req: XpRequest, awards: XpAward[]) {
  d.pendingXp = d.pendingXp.filter((r) => r.id !== req.id);
  if (req.facts.hasFeedback === true && req.unitId && req.version) {
    const fbOk = d.feedback.some((f) => f.unitId === req.unitId && f.studentId === req.studentId && f.version === req.version);
    if (!fbOk) { audit(d, SYSTEM, 'xp.blocked', 'XPEvent', req.id, `XP withheld for ${userName(d, req.studentId)}: no feedback on ${req.unitId} v${req.version}`); return; }
  }
  const before = xpTotal(d, req.studentId);
  let gained = 0;
  for (const a of awards) {
    if (d.xpEvents.some((e) => e.studentId === req.studentId && e.ruleId === a.ruleId && e.unitId === req.unitId && e.version === req.version && req.unitId)) continue;
    d.xpEvents.push({ id: uid('xp'), studentId: req.studentId, points: a.points, label: `${a.label}${req.label && a.label !== req.label ? ` · ${req.label}` : ''}`, unitId: req.unitId, version: req.version, ruleId: a.ruleId, kind: 'auto', byId: 'system', at: nowIso() });
    gained += a.points;
  }
  if (!gained) return;
  audit(d, SYSTEM, 'xp.auto', 'XPEvent', req.id, `+${gained} XP to ${userName(d, req.studentId)} (${req.label})`, { before: String(before), after: String(before + gained) });
  notify(d, req.studentId, 'xp', `+${gained} XP — ${req.label}`, `Total ${before + gained} XP.`, 'xp');
  checkRank(d, req.studentId, before);
}

// ---------- IP screening & disclosure gate ----------
export function setIpStatus(d: DB, actor: User, projectId: string, status: IPStatus, note: string, kind?: 'design registration' | 'patent') {
  need(actor, 'update', 'IPGate');
  const p = d.projects.find((x) => x.id === projectId)!;
  if (status === 'unscreened') throw new Blocked('invalid', 'A screening record cannot be removed once logged. Add a new status with a note instead.');
  if (note.trim().length < 10) throw new Blocked('justification', 'Log a screening note (min 10 characters) — the gate relies on this record.');
  const before = p.ipStatus;
  p.ipStatus = status; p.rev++;
  if (kind) p.ipKind = kind;
  p.screening = { byId: actor.id, at: nowIso(), note };
  audit(d, actor, 'ip.screen', 'Project', p.id, `${p.title}: ${before} → ${status}`, { before, after: status, justification: note });
  for (const s of p.ownerIds) notify(d, s, 'ip', `IP status updated — ${p.title}`, `Now: ${status}. ${note}`, 'portfolio');
  if ((status === 'filed' || status === 'registered') && before !== status)
    for (const s of p.ownerIds) d.pendingXp.push({ id: uid('xq'), studentId: s, unitId: `${p.id}:${status}`, facts: { action: 'ip_milestone', ipStatus: status }, label: `${p.title} — ${status}` });
}
export function setProjectFlag(d: DB, actor: User, projectId: string, flag: 'portfolioReady' | 'competitionEligible', value: boolean) {
  const p = d.projects.find((x) => x.id === projectId)!;
  need(actor, 'update', 'Project', p);
  const course = courseOf(d, p.courseId);
  if (value && course.disclosureGate && (!p.screening || p.ipStatus === 'unscreened'))
    throw new Blocked('gate', `IP disclosure gate: “${p.title}” has no screening record, so it cannot be marked ${flag === 'portfolioReady' ? 'portfolio-ready' : 'competition-eligible'}. Ask your instructor to log an IP screening decision first.`);
  p[flag] = value; p.rev++;
  audit(d, actor, 'project.flag', 'Project', p.id, `${p.title}: ${flag} = ${value}`, { after: String(value) });
}
export function updateProjectCustom(d: DB, actor: User, projectId: string, fieldId: string, value: string) {
  const p = d.projects.find((x) => x.id === projectId)!;
  need(actor, 'update', 'Project', p);
  p.custom[fieldId] = value; p.rev++;
}

// ---------- competitions (student) ----------
export function setCompMarker(d: DB, actor: User, competitionId: string, marker: 'none' | 'interested' | 'applying') {
  let e = d.compEntries.find((x) => x.competitionId === competitionId && x.studentId === actor.id);
  if (!e) { e = { id: uid('ce'), competitionId, studentId: actor.id, marker: 'none', outcome: 'none', updatedAt: nowIso() }; d.compEntries.push(e); }
  need(actor, 'update', 'CompEntry', e);
  e.marker = marker; e.updatedAt = nowIso();
}
const OUTCOME_ORDER = ['none', 'submitted', 'shortlisted', 'won'];
export function setCompOutcome(d: DB, actor: User, competitionId: string, outcome: 'none' | 'submitted' | 'shortlisted' | 'won') {
  const e = d.compEntries.find((x) => x.competitionId === competitionId && x.studentId === actor.id);
  if (!e || e.marker !== 'applying') throw new Blocked('state', 'Mark the competition as “applying” before logging an outcome.');
  need(actor, 'update', 'CompEntry', e);
  if (OUTCOME_ORDER.indexOf(outcome) < OUTCOME_ORDER.indexOf(e.outcome)) throw new Blocked('state', 'Outcomes only move forward (submitted → shortlisted → won).');
  const first = e.outcome === 'none' && outcome !== 'none';
  e.outcome = outcome; e.updatedAt = nowIso();
  const c = d.competitions.find((x) => x.id === competitionId)!;
  audit(d, actor, 'competition.outcome', 'CompEntry', e.id, `${actor.name}: ${c.name} → ${outcome}`, { after: outcome });
  if (first) d.pendingXp.push({ id: uid('xq'), studentId: actor.id, unitId: `comp:${competitionId}`, facts: { action: 'competition_entered' }, label: c.name });
}
export function bulkTagCompetitions(d: DB, actor: User, ids: string[], coCode: string) {
  need(actor, 'update', 'Competition');
  for (const c of d.competitions.filter((x) => ids.includes(x.id))) {
    const codes = c.coCodes.split(',').map((s) => s.trim()).filter(Boolean);
    if (!codes.includes(coCode)) { codes.push(coCode); c.coCodes = codes.join(', '); c.rev++; }
  }
  audit(d, actor, 'competitions.bulk-tag', 'Competition', ids.join(','), `Tagged ${ids.length} competition(s) with ${coCode}`);
}

// ---------- notifications / celebrations ----------
export function markNotificationsRead(d: DB, actor: User, ids?: string[]) {
  for (const n of d.notifications) if (n.userId === actor.id && (!ids || ids.includes(n.id))) n.read = true;
}
export function ackCelebration(d: DB, _actor: User, id: string) {
  const c = d.celebrations.find((x) => x.id === id);
  if (c) c.seen = true;
}

// ---------- demo helpers ----------
export function simulateConcurrentEdit(d: DB, _actor: User) {
  const t = d.tasks.find((x) => x.id === 't3')!;
  t.title = t.title.replace(/ \(edited by Prof\. Rao\)$/, '') + ' (edited by Prof. Rao)';
  t.rev++;
  audit(d, { id: 'u-co', role: 'coinstructor' }, 'task.update', 'Task', t.id, `${t.title}: title edited (simulated concurrent edit)`);
}
export function rubricEditedByInstructor(d: DB, _actor: User, taskId: string) {
  const t = d.tasks.find((x) => x.id === taskId)!;
  t.rubric[0].text = t.rubric[0].text.replace(/ \(clarified\)$/, '') + ' (clarified)';
  t.rubricVersion++; t.rev++;
  audit(d, { id: 'u-inst', role: 'instructor' }, 'task.update', 'Task', t.id, `${t.title}: rubric criterion clarified (simulated)`);
}
export const isStaffUser = isStaff;

// ---------- session prefs (role switcher / selected course) ----------
const PREF = 'studio-portal-prefs-v1';
export function loadPrefs(): { userId: string; courseId: string } {
  try { const p = JSON.parse(localStorage.getItem(PREF) ?? ''); if (p?.userId) return p; } catch { /* default */ }
  return { userId: 's1', courseId: 'c1' };
}
export function savePrefs(p: { userId: string; courseId: string }) {
  try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* ignore */ }
}
