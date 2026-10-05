import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Hammer, KeyRound, Star } from 'lucide-react';
import { useCmd, useDb, useUser } from '../store';

// Paper scraps and marker dots in the brand palette.
const COLORS = ['#e8452c', '#1f3fbf', '#c9962a', '#3e6b48', '#1b1a17', '#f6e9c9'];
/** Peak-End Rule: rank-ups, quest clears and milestone unlocks get a distinct full-screen moment. */
export default function Celebrations() {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const c = user.role === 'student' ? db.celebrations.find((x) => x.userId === user.id && !x.seen) : undefined;
  const Icon = c?.kind === 'rank' ? Hammer : c?.kind === 'milestone' ? KeyRound : Star;
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="celebrate" role="dialog" aria-label={c.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => cmd.ackCelebration(c.id)}>
          {Array.from({ length: 36 }).map((_, i) => (
            <motion.i key={i} className="confetti" style={{ left: `${(i * 97) % 100}%`, background: COLORS[i % COLORS.length], borderRadius: i % 3 === 0 ? '50%' : 2 }}
              initial={{ y: -30, rotate: 0, opacity: 1 }} animate={{ y: '105vh', rotate: 540 + i * 20, opacity: [1, 1, 0.8] }}
              transition={{ duration: 2.4 + (i % 5) * 0.3, delay: (i % 9) * 0.08, ease: 'easeIn' }} />
          ))}
          <motion.div className="panel" initial={{ scale: 0.6, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            <motion.div className="pin lg" initial={{ y: -60, rotate: -20 }} animate={{ y: 0, rotate: [-20, 8, -4, 0] }} transition={{ duration: 0.9, delay: 0.25 }}><Icon aria-hidden /></motion.div>
            <span className="eyebrow" style={{ marginTop: 14 }}>{c.kind === 'rank' ? 'Rank up' : c.kind === 'milestone' ? 'Milestone unlocked' : 'Quest complete'}</span>
            <h1 style={{ fontSize: 30 }}><span className="mk">{c.title}</span></h1>
            <p className="muted" style={{ fontSize: 16, margin: '6px 0 16px' }}>{c.sub}</p>
            <button className="btn primary big" autoFocus onClick={(e) => { e.stopPropagation(); cmd.ackCelebration(c.id); }}>Keep going <ArrowRight /></button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
