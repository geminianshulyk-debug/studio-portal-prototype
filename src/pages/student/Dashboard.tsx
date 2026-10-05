import { useMemo } from 'react';
import { ArrowRight, Compass, Hammer, MessageSquareText, PencilRuler, RotateCcw, Users } from 'lucide-react';
import { useDb, useNow, useStore, useUser } from '../../store';
import { Badge, Bar, Card, Due, Hero } from '../../components/ui';
import { fmtDateTime, rankFor, remindersFor, unitsFor, xpTotal, type Unit } from '../../lib/selectors';
import { humanDue, MOD_ICON, MOD_TINT } from '../../lib/display';
import { unitTask } from '../../types';
import handles from '../../assets/hero-handles.webp';
import sketch from '../../assets/hero-sketch.webp';

export default function Dashboard() {
  const db = useDb(), user = useUser(), { setPage, setCourse, courseId } = useStore();
  const now = useNow(30000);
  const xp = xpTotal(db, user.id);
  const { rank, next, pct } = rankFor(db.ranks, xp);
  const reminders = useMemo(() => remindersFor(db, user.id, now), [db, user.id, now]);
  const allUnits = useMemo(() => unitsFor(db, user.id, undefined, now), [db, user.id, now]);
  const actionable = allUnits.filter((u) => !u.locked && (u.status === 'assigned' || u.status === 'revision')).sort((a, b) => a.due.localeCompare(b.due));
  const open = allUnits.filter((u) => !u.locked && u.status !== 'complete');
  const overdue = actionable.find((u) => u.overdue);
  const first = overdue ?? actionable[0];
  const unread = db.feedback.filter((f) => f.studentId === user.id && !f.read).length;
  const peer = reminders.find((r) => r.kind === 'peer');
  const latest = db.feedback.filter((f) => f.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const myCourses = db.courses.filter((c) => user.courseIds.includes(c.id));
  const heroCourse = myCourses.find((c) => c.id === (first?.task.courseId ?? courseId)) ?? myCourses[0];
  const name = user.name.split(' ')[0];
  const openQuest = (u?: Unit) => { if (u) setCourse(u.task.courseId); setPage('quests'); };
  const eyebrow = heroCourse ? `${heroCourse.code} · ${heroCourse.semester}` : 'Welcome to STUDIO';

  const hero = allUnits.length === 0 ? (
    <Hero eyebrow="Welcome to STUDIO" art={sketch} artKind="sketch"
      title={<>Hey {name}, settle in and <span className="mk">get ready</span><span className="tp">.</span></>}
      sub="No quests yet — your first one shows up here the moment it unlocks."
      actions={<><button className="btn primary big" onClick={() => setPage('quests')}>Explore your modules <ArrowRight /></button><button className="textlink" onClick={() => setPage('map')}>Take the tour</button></>} />
  ) : overdue ? (
    <Hero eyebrow={eyebrow} art={handles} alert
      title={<>Hey {name}, let’s get back <span className="mk">on track</span><span className="tp">.</span></>}
      sub={<><b>Overdue:</b> {overdue.title} was due {humanDue(overdue.due, now)}.</>}
      actions={<><button className="btn primary big" onClick={() => openQuest(overdue)}>Resume work <ArrowRight /></button><button className="textlink" onClick={() => setPage('notifications')}>View deadlines</button></>} />
  ) : first ? (
    <Hero eyebrow={eyebrow} art={handles}
      title={<>Hey {name}, let’s <span className="mk">make</span> something<span className="tp">.</span></>}
      sub={<>Next up: <b>{first.title}</b>, due {humanDue(first.due, now)}.</>}
      actions={<><button className="btn primary big" onClick={() => openQuest(first)}>Continue your quest <ArrowRight /></button><button className="textlink" onClick={() => setPage('notifications')}>View deadlines</button></>} />
  ) : (
    <Hero eyebrow={eyebrow} art={handles}
      title={<>Nice work, {name}. You’re <span className="mk">all caught up</span><span className="tp">.</span></>}
      sub="Nothing is due right now — a good moment to polish your portfolio."
      actions={<><button className="btn primary big" onClick={() => setPage('portfolio')}>Open portfolio <ArrowRight /></button><button className="textlink" onClick={() => setPage('competitions')}>Browse competitions</button></>} />
  );

  return (
    <div className="col" style={{ gap: 28 }}>
      {hero}

      <div className="strip" aria-label="Your status">
        <button className="rankbox" onClick={() => setPage('xp')} aria-label={`Rank ${rank.name}, ${xp} XP`}>
          <span className="pin" aria-hidden><Hammer /></span>
          <span className="top"><b>{rank.name}</b><span className="meta">{xp} XP{next ? ` · ${next.minXp - xp} to ${next.name}` : ' · top rank'}</span></span>
          <Bar value={pct} kind="xp" />
        </button>
        <button className="statchip butter" onClick={() => setPage('quests')}><Compass aria-hidden /><span><b>{open.length}</b><span>open quest{open.length === 1 ? '' : 's'}</span></span></button>
        <button className="statchip sky" onClick={() => setPage('feedback')}><MessageSquareText aria-hidden /><span><b>{unread}</b><span>new feedback</span></span></button>
        <button className="statchip blush" onClick={() => setPage('peer')}><Users aria-hidden /><span><b className="word">Peer review</b><span>{peer ? `due ${humanDue(peer.dueAt, now)}` : 'all submitted'}</span></span></button>
      </div>

      <section>
        <div className="section-h"><h2>Your modules</h2><button className="textlink" onClick={() => setPage('quests')}>Quest map <ArrowRight /></button></div>
        <div className="modgrid">
          {myCourses.map((c, i) => {
            const us = allUnits.filter((u) => u.task.courseId === c.id);
            const done = us.filter((u) => u.status === 'complete').length;
            const I = MOD_ICON[i % MOD_ICON.length];
            return (
              <button key={c.id} className={`modcard ${courseId === c.id ? 'on' : ''}`} onClick={() => { setCourse(c.id); setPage('quests'); }}>
                <span className={`thumb ${MOD_TINT[i % MOD_TINT.length]}`} aria-hidden><I /></span>
                <span><span className="code">{c.code}</span><span className="t" style={{ display: 'block' }}>{c.title}</span>
                  <span className="prog"><Bar value={us.length ? done / us.length : 0} thin /><span>{done}/{us.length} quests</span></span></span>
              </button>);
          })}
        </div>
      </section>

      <div className="grid2">
        <Card title="Next up" actions={<button className="btn sm ghost" onClick={() => setPage('quests')}>All quests</button>}>
          {actionable.length === 0 && <p className="muted">You’re all caught up — check feedback or competitions.</p>}
          <div className="list">
            {actionable.slice(0, 3).map((u) => (
              <div key={u.unitId} className="li">
                <span className={`ic ${u.overdue ? 'late' : ''}`} aria-hidden>{u.status === 'revision' ? <RotateCcw /> : <PencilRuler />}</span>
                <span className="tx"><b>{u.title}</b><span>{db.courses.find((c) => c.id === u.task.courseId)?.code} · {u.status === 'revision' ? 'revision requested' : 'to do'}</span></span>
                <Due iso={u.due} now={now} />
                <button className="btn sm" onClick={() => openQuest(u)}>Open</button>
              </div>))}
          </div>
        </Card>
        <Card title="Latest feedback" actions={<button className="btn sm ghost" onClick={() => setPage('feedback')}>Inbox</button>}>
          {latest.length === 0 && <p className="muted">No feedback yet — submit a quest to start the loop.</p>}
          <div className="list">
            {latest.map((f) => {
              const t = db.tasks.find((x) => x.id === unitTask(f.unitId));
              return (
                <div key={f.id} className={`li ${f.read ? '' : 'unread'}`}>
                  <span className="ic" aria-hidden><MessageSquareText /></span>
                  <span className="tx"><b>{t?.title ?? 'Feedback'} · v{f.version}</b><span>{fmtDateTime(f.createdAt)}{f.read ? '' : ' · unread'}</span></span>
                  <Badge kind={f.decision === 'pass' ? 'ok' : 'dangerweak'}>{f.total}% · {f.decision === 'pass' ? 'passed' : 'revise'}</Badge>
                </div>);
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
