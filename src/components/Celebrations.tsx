import { AnimatePresence, motion } from 'motion/react';
import { useCmd, useDb, useUser } from '../store';

const COLORS = ['#f59e0b', '#7c6cf6', '#22a055', '#ef4444', '#0ea5e9', '#ec4899'];
/** Peak-End Rule: rank-ups, quest clears and milestone unlocks get a distinct full-screen moment. */
export default function Celebrations() {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const c = user.role === 'student' ? db.celebrations.find((x) => x.userId === user.id && !x.seen) : undefined;
  const icon = c?.kind === 'rank' ? '🏆' : c?.kind === 'milestone' ? '🗝️' : '⭐';
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="celebrate" role="dialog" aria-label={c.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => cmd.ackCelebration(c.id)}>
          {Array.from({ length: 36 }).map((_, i) => (
            <motion.i key={i} className="confetti" style={{ left: `${(i * 97) % 100}%`, background: COLORS[i % COLORS.length] }}
              initial={{ y: -30, rotate: 0, opacity: 1 }} animate={{ y: '105vh', rotate: 540 + i * 20, opacity: [1, 1, 0.8] }}
              transition={{ duration: 2.4 + (i % 5) * 0.3, delay: (i % 9) * 0.08, ease: 'easeIn' }} />
          ))}
          <motion.div className="panel" initial={{ scale: 0.6, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            <motion.div className="big" animate={{ rotate: [0, -10, 10, -6, 6, 0], scale: [1, 1.2, 1] }} transition={{ duration: 1, delay: 0.3 }}>{icon}</motion.div>
            <h1 style={{ margin: '12px 0 4px', fontSize: 30 }}>{c.title}</h1>
            <p className="muted" style={{ fontSize: 17 }}>{c.sub}</p>
            <button className="btn primary big" autoFocus onClick={(e) => { e.stopPropagation(); cmd.ackCelebration(c.id); }}>Keep going →</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
