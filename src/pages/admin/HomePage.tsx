import { useMemo } from 'react';
import { ArrowRight, CalendarClock, Inbox, OctagonAlert, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import { useDb, useNow, useStore, useUser } from '../../store';
import { Bar, Card, Due, Hero } from '../../components/ui';
import { instructorAlerts, unitsFor } from '../../lib/selectors';
import { greeting, MOD_ICON, MOD_TINT, shortName } from '../../lib/display';
import { useCan } from './common';
import sketch from '../../assets/hero-sketch.webp';

const ROLE: Record<string, string> = { instructor: 'Instructor', coinstructor: 'Co-instructor', ta: 'Teaching assistant', hod: 'Dean / HOD' };
const KIND_ICON = { submission: Inbox, 'peer-flag': Users, 'at-risk': TriangleAlert, 'ip-gate': ShieldAlert };

/** Staff landing: the same minimal hero, then what is waiting on you. */
export default function HomePage() {
  const db = useDb(), user = useUser(), can = useCan(), { setPage, setCourse, courseId } = useStore();
  const now = useNow(60000);
  const alerts = useMemo(() => instructorAlerts(db, now), [db, now]);
  const count = (k: string) => alerts.filter((a) => a.kind === k).length;
  const awaiting = count('submission');
  const slow = alerts.filter((a) => a.kind === 'submission' && a.urgent).length;
  const canGrade = can('grade', 'Submission');
  const courses = db.courses.filter((c) => user.courseIds.includes(c.id));
  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const week = db.tasks.filter((t) => user.courseIds.includes(t.courseId)).flatMap((t) => (t.group ? t.group.milestones.map((m) => ({ id: `${t.id}#${m.id}`, title: `${t.title} — ${m.title}`, due: m.due, courseId: t.courseId })) : [{ id: t.id, title: t.title, due: t.deadline, courseId: t.courseId }]))
    .filter((x) => { const ms = new Date(x.due.length === 10 ? x.due + 'T23:59:00' : x.due).getTime() - now; return ms > -864e5 && ms < 7 * 864e5; })
    .sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);

  return (
    <div className="col" style={{ gap: 28 }}>
      <Hero eyebrow={`${course.code} · ${course.semester} · ${ROLE[user.role] ?? ''}`} art={sketch} artKind="sketch" alert={slow > 0}
        title={<>{greeting(now)}, <span className="mk">{shortName(user.name)}</span><span className="tp">.</span></>}
        sub={awaiting ? <><b>{awaiting} submission{awaiting === 1 ? '' : 's'}</b> {awaiting === 1 ? 'is' : 'are'} waiting for feedback{slow ? ` — ${slow} for over 3 days` : ''}.</> : 'Nothing is waiting on your feedback. The loop is closed.'}
        actions={canGrade
          ? <><button className="btn primary big" onClick={() => setPage('grading')}>Open grading queue <ArrowRight /></button><button className="textlink" onClick={() => setPage('alerts')}>Notification center</button></>
          : <><button className="btn primary big" onClick={() => setPage('analytics')}>View analytics <ArrowRight /></button><button className="textlink" onClick={() => setPage('alerts')}>Notification center</button></>} />

      <div className="strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }} aria-label="Waiting on you">
        <button className="statchip butter" onClick={() => setPage('grading')}><Inbox aria-hidden /><span><b>{awaiting}</b><span>awaiting feedback</span></span></button>
        <button className="statchip blush" onClick={() => setPage('groups')}><Users aria-hidden /><span><b>{count('peer-flag')}</b><span>peer-score flags</span></span></button>
        <button className="statchip sky" onClick={() => setPage('analytics')}><TriangleAlert aria-hidden /><span><b>{count('at-risk')}</b><span>students at risk</span></span></button>
        <button className="statchip sage" onClick={() => setPage('ip')}><ShieldAlert aria-hidden /><span><b>{count('ip-gate')}</b><span>IP screenings due</span></span></button>
      </div>

      <section>
        <div className="section-h"><h2>Your courses</h2><button className="textlink" onClick={() => setPage('course')}>Course setup <ArrowRight /></button></div>
        <div className="modgrid">
          {courses.map((c, i) => {
            const students = db.users.filter((u) => u.role === 'student' && u.courseIds.includes(c.id));
            const units = students.flatMap((s) => unitsFor(db, s.id, c.id, now));
            const done = units.filter((u) => u.status === 'complete').length;
            const I = MOD_ICON[i % MOD_ICON.length];
            return (
              <button key={c.id} className={`modcard ${course.id === c.id ? 'on' : ''}`} onClick={() => { setCourse(c.id); setPage('tasks'); }}>
                <span className={`thumb ${MOD_TINT[i % MOD_TINT.length]}`} aria-hidden><I /></span>
                <span><span className="code">{c.code} · {students.length} students</span><span className="t" style={{ display: 'block' }}>{c.title}</span>
                  <span className="prog"><Bar value={units.length ? done / units.length : 0} thin /><span>{units.length ? Math.round((done / units.length) * 100) : 0}% complete</span></span></span>
              </button>);
          })}
        </div>
      </section>

      <div className="grid2">
        <Card title="Waiting on you" actions={<button className="btn sm ghost" onClick={() => setPage('alerts')}>See all {alerts.length}</button>}>
          {alerts.length === 0 && <p className="muted">All clear.</p>}
          <div className="list">
            {alerts.slice(0, 5).map((a) => { const I = KIND_ICON[a.kind]; return (
              <div key={a.id} className="li">
                <span className={`ic ${a.urgent && a.kind !== 'submission' ? 'late' : ''}`} aria-hidden>{a.urgent && a.kind === 'submission' ? <OctagonAlert /> : <I />}</span>
                <span className="tx"><b>{a.title}</b><span>{a.detail}</span></span>
                <button className="btn sm" onClick={() => setPage(a.page)}>Open</button>
              </div>); })}
          </div>
        </Card>
        <Card title="Due this week" actions={<button className="btn sm ghost" onClick={() => setPage('plan')}>Semester plan</button>}>
          {week.length === 0 && <p className="muted">No deadlines in the next 7 days.</p>}
          <div className="list">
            {week.map((w) => (
              <div key={w.id} className="li">
                <span className="ic" aria-hidden><CalendarClock /></span>
                <span className="tx"><b>{w.title}</b><span>{db.courses.find((c) => c.id === w.courseId)?.code}</span></span>
                <Due iso={w.due} now={now} />
              </div>))}
          </div>
        </Card>
      </div>
    </div>
  );
}
