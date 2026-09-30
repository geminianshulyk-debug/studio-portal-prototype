import type { DB, PeerConfig } from '../types';
import { unitMilestone, unitTask } from '../types';
import { peerScoreFor } from './peer';

export interface MemberContribution {
  studentId: string;
  peerAvg: number;
  hours: number;
  logs: number;
  index: number;
  multiplier: number;
  groupMark: number;
  individualMark: number;
  note?: string;
}

/**
 * Contribution weighting (visible + instructor-adjustable, see Group & Peer page):
 *   index      = wPeer × (peerAvg / cohortPeerAvg) + wEffort × (hours / cohortHours)
 *   multiplier = clamp(1 − α + α × index, floor, cap)
 *   individual = min(100, groupMark × multiplier)
 */
export function contributionFor(db: DB, taskId: string, cfg: PeerConfig): MemberContribution[] {
  const task = db.tasks.find((t) => t.id === taskId);
  if (!task?.group) return [];
  const group = db.groups.find((g) => g.id === task.group!.groupId)!;
  const cycleIds = db.peerCycles.filter((c) => c.taskId === taskId).map((c) => c.id);
  const evals = db.peerEvals.filter((e) => cycleIds.includes(e.cycleId));
  const members = group.memberIds.map((id) => {
    const p = peerScoreFor(evals, id);
    const hours = db.effort.filter((e) => e.taskId === taskId && e.studentId === id).reduce((a, e) => a + e.hours, 0);
    const logs = db.contributions.filter((c) => c.taskId === taskId && c.studentId === id).length;
    const marks = db.feedback
      .filter((f) => f.studentId === id && unitTask(f.unitId) === taskId && unitMilestone(f.unitId))
      .map((f) => f.total);
    return { id, p, hours, logs, mark: marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0 };
  });
  const groupMark = members.reduce((a, m) => a + m.mark, 0) / Math.max(1, members.length);
  const meanPeer = members.reduce((a, m) => a + m.p.avg, 0) / Math.max(1, members.length) || 1;
  const meanHours = members.reduce((a, m) => a + m.hours, 0) / Math.max(1, members.length);
  const haveEffort = meanHours > 0;
  const wPeer = haveEffort ? cfg.peerWeight : 1;
  const wEffort = haveEffort ? cfg.effortWeight : 0;
  return members.map((m) => {
    const index = wPeer * (m.p.avg / meanPeer) + wEffort * (haveEffort ? m.hours / meanHours : 0);
    const multiplier = Math.min(cfg.cap, Math.max(cfg.floor, 1 - cfg.individualShare + cfg.individualShare * index));
    return {
      studentId: m.id,
      peerAvg: m.p.avg,
      hours: m.hours,
      logs: m.logs,
      index,
      multiplier,
      groupMark,
      individualMark: Math.min(100, groupMark * multiplier),
      note: m.p.flagged ? `${m.p.flagged} flagged peer score(s) excluded pending review` : undefined,
    };
  });
}
