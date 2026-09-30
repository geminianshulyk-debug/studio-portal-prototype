import { useMemo } from 'react';
import { useDb, useNow, useStore, useUser } from '../../store';
import { Badge, Bar, Card, PageHead } from '../../components/ui';
import { countdown } from '../../lib/time';
import { outcomeAttainment, rankFor, remindersFor, unitsFor, xpTotal } from '../../lib/selectors';

export default function Dashboard() {
  const db = useDb(), user = useUser(), { setPage, setCourse, courseId } = useStore();
  const now = useNow(30000);
  const xp = xpTotal(db, user.id);
  const { rank, next, pct } = rankFor(db.ranks, xp);
  const reminders = useMemo(() => remindersFor(db, user.id, now), [db, user.id, now]);
  const allUnits = unitsFor(db, user.id, undefined, now);
  const nextUp = allUnits.filter((u) => u.status !== 'complete' && !u.locked && (u.status === 'assigned' || u.status === 'revision')).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);
  const att = outcomeAttainment(db, user.courseIds, user.id);
  const psos = db.outcomes.filter((o) => o.kind === 'PSO');
  return (
    <>
      <PageHead title={`Hi ${user.name.split(' ')[0]} 👋`} sub="Your quests, rank and what’s due next." laws={['Zeigarnik — open quests and the next-rank bar pull you back', 'Fitts — “Continue” sits on each course card']} />
      <div className="col">
        <div className="hero">
          <div className="row between wrap">
            <div><div className="small" style={{ opacity: .85 }}>CURRENT RANK</div><h1 style={{ fontSize: 34 }}>🏅 {rank.name}</h1></div>
            <div className="stat" style={{ textAlign: 'right' }}><b style={{ fontSize: 40 }}>{xp} XP</b><span style={{ color: '#fff', opacity: .85 }}>{next ? `${next.minXp - xp} XP to ${next.name}` : 'Top rank reached'}</span></div>
          </div>
          <div style={{ marginTop: 12 }}><div className="bar xp" style={{ background: 'rgba(255,255,255,.3)' }}><i style={{ width: `${pct * 100}%` }} /></div></div>
        </div>
        <div className="grid2">
          <Card title="Your courses">
            <div className="col">{db.courses.filter((c) => user.courseIds.includes(c.id)).map((c) => {
              const us = allUnits.filter((u) => u.task.courseId === c.id);
              const done = us.filter((u) => u.status === 'complete').length;
              return (
                <div key={c.id} className="card region" style={courseId === c.id ? { borderColor: 'var(--primary)' } : undefined}>
                  <div className="row between wrap"><div><b>{c.code}</b> · {c.title}</div><button className="btn primary" onClick={() => { setCourse(c.id); setPage('quests'); }}>Continue →</button></div>
                  <div className="row" style={{ marginTop: 8 }}><span className="small">{done}/{us.length} quests</span><div className="grow"><Bar value={us.length ? done / us.length : 0} /></div></div>
                </div>);
            })}</div>
          </Card>
          <Card title="Next up">
            {nextUp.length === 0 && <p className="muted">You’re all caught up — check feedback or competitions.</p>}
            {nextUp.map((u) => { const cd = countdown(u.due, now); return (
              <div key={u.unitId} className={`row between ${u.overdue ? 'overdue' : ''}`} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', borderRadius: 8 }}>
                <div><b>{u.title}</b><div className="small muted">{u.status === 'revision' ? '🔁 revision requested' : '📝 to do'} · <span className={cd.urgent ? 'err' : ''}>⏱ {cd.text}</span></div></div>
                <button className="btn sm primary" onClick={() => { setCourse(u.task.courseId); setPage('quests'); }}>Open</button>
              </div>); })}
          </Card>
          <Card title={`Reminders (${reminders.length})`} actions={<button className="btn sm" onClick={() => setPage('notifications')}>All notifications</button>}>
            {reminders.length === 0 && <p className="muted small">Nothing due soon.</p>}
            {reminders.slice(0, 5).map((r) => <div key={r.id} className={`row between small ${r.urgent ? 'overdue' : ''}`} style={{ padding: '6px 8px', borderRadius: 8 }}><span>{r.kind === 'competition' ? '🏁' : r.kind === 'peer' ? '👥' : '⏰'} {r.title}</span><span className={r.urgent ? 'err' : 'muted'}>{countdown(r.dueAt, now).text}</span></div>)}
          </Card>
          <Card title="Skill tracks (PSOs)" actions={<button className="btn sm" onClick={() => setPage('xp')}>Details</button>}>
            {psos.map((p) => <div key={p.key} className="col" style={{ gap: 2, marginBottom: 6 }}><div className="row between small"><span><b>{p.key}</b> {p.title}</span><span>{att[p.key] !== undefined ? `${Math.round(att[p.key])}%` : <Badge kind="gray">not started</Badge>}</span></div><Bar value={(att[p.key] ?? 0) / 100} thin /></div>)}
          </Card>
        </div>
      </div>
    </>
  );
}
