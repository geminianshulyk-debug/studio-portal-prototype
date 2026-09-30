import type { PeerConfig, PeerCriterion, PeerEval } from '../types';
import { PEER_CRITERIA } from '../types';

export const avgScore = (s: Record<PeerCriterion, number>) =>
  PEER_CRITERIA.reduce((a, k) => a + s[k], 0) / PEER_CRITERIA.length;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Loophole prevention: detect self-favouring / outlier ratings inside one cycle.
 * Returns evalId -> reason. Flagged evaluations are EXCLUDED from averages until an
 * instructor resolves them (never silently averaged in).
 */
export function detectOutliers(evals: PeerEval[], cfg: PeerConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of evals) {
    const mine = avgScore(e.scores);
    const others = evals.filter((o) => o.evaluateeId === e.evaluateeId && o.evaluatorId !== o.evaluateeId && o.id !== e.id);
    if (e.evaluatorId === e.evaluateeId) {
      if (others.length >= 2) {
        const peerMean = mean(others.map((o) => avgScore(o.scores)));
        if (mine - peerMean >= cfg.outlierGap)
          out[e.id] = `Self-favouring: self-rating ${mine.toFixed(1)} vs peers' ${peerMean.toFixed(1)} (gap ≥ ${cfg.outlierGap})`;
      }
    } else if (others.length >= 2) {
      const peerMean = mean(others.map((o) => avgScore(o.scores)));
      if (Math.abs(mine - peerMean) >= cfg.outlierGap + 0.5)
        out[e.id] = `Outlier: rated ${mine.toFixed(1)} while other peers averaged ${peerMean.toFixed(1)}`;
    }
  }
  return out;
}

/** Peer score received by a student — excludes self ratings and unresolved/discarded flags. */
export function peerScoreFor(evals: PeerEval[], studentId: string): { avg: number; count: number; flagged: number } {
  const received = evals.filter((e) => e.evaluateeId === studentId && e.evaluatorId !== studentId);
  const counted = received.filter((e) => !e.flag || e.flag.status === 'accepted');
  return {
    avg: mean(counted.map((e) => avgScore(e.scores))),
    count: counted.length,
    flagged: received.filter((e) => e.flag && e.flag.status === 'pending').length,
  };
}
