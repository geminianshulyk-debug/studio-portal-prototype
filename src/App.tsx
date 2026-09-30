import { Toaster } from 'sonner';
import { useDb, useStore, useUser } from './store';
import { ADMIN_PAGES, STUDENT_PAGES, SHARED, type PageDef } from './pages/registry';
import Celebrations from './components/Celebrations';
import { instructorAlerts } from './lib/selectors';
import { useMemo } from 'react';

export default function App() {
  const db = useDb();
  const user = useUser();
  const { page, setPage, setUser, courseId, setCourse, reset, cmd } = useStore();
  const student = user.role === 'student';
  const pages = student ? STUDENT_PAGES : ADMIN_PAGES;
  const badge = useMemo(() => ({
    alerts: student ? 0 : instructorAlerts(db).length,
    notifs: db.notifications.filter((n) => n.userId === user.id && !n.read).length,
    feedback: db.feedback.filter((f) => f.studentId === user.id && !f.read).length,
  }), [db, user.id, student]);
  const current = pages.find((p) => p.id === page);
  const Comp = SHARED[page] ?? current?.comp ?? SHARED.map;
  const groups = [...new Set(pages.map((p) => p.group))];
  const myCourses = db.courses.filter((c) => user.courseIds.includes(c.id));
  const nav = (p: PageDef) => (
    <button key={p.id} className="nav" aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
      <span className="ico" aria-hidden>{p.icon}</span>{p.label}
      {p.badge && badge[p.badge] > 0 && <span className="dot" aria-label={`${badge[p.badge]} new`}>{badge[p.badge]}</span>}
    </button>
  );
  return (
    <div className="shell" data-mode={student ? 'student' : 'admin'}>
      <nav className="side" aria-label="Main">
        <div className="brand"><div className="logo">S</div><span>STUDIO</span></div>
        <div className="navgroup">
          <button className="nav" aria-current={page === 'map' ? 'page' : undefined} onClick={() => setPage('map')}><span className="ico">🧭</span>Feature Map</button>
        </div>
        {groups.map((g) => (
          <div className="navgroup" key={g}>
            <h4>{g}</h4>
            {pages.filter((p) => p.group === g).map(nav)}
          </div>
        ))}
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="switcher row">
            <label className="lbl" htmlFor="role">Viewing as</label>
            <select id="role" value={user.id} onChange={(e) => setUser(e.target.value)} aria-label="Role switcher">
              <optgroup label="Instructor / Admin side">
                {db.users.filter((u) => u.role !== 'student').map((u) => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>)}
              </optgroup>
              <optgroup label="Student / Client side">
                {db.users.filter((u) => u.role === 'student').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            </select>
          </div>
          {myCourses.length > 1 && (
            <div className="row">
              <label className="lbl" htmlFor="course">Course</label>
              <select id="course" value={courseId} onChange={(e) => setCourse(e.target.value)} style={{ width: 'auto' }}>
                {myCourses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
              </select>
            </div>
          )}
          <span className="grow" />
          <details className="small">
            <summary style={{ cursor: 'pointer' }}>Demo tools</summary>
            <div className="card" style={{ position: 'absolute', right: 16, zIndex: 30, width: 290 }}>
              <div className="col">
                <button className="btn sm" onClick={() => cmd.simulateConcurrentEdit()}>Simulate a co-instructor editing “Concept sketch set” now</button>
                <button className="btn sm" onClick={() => cmd.rubricEditedByInstructor('t3')}>Simulate rubric edit while a student is mid-submission</button>
                <button className="btn sm danger" onClick={reset}>Reset demo data</button>
                <span className="muted">Mock data persists in localStorage via the api layer.</span>
              </div>
            </div>
          </details>
          <button className="btn" onClick={() => setPage(student ? 'notifications' : 'alerts')} aria-label="Notifications">🔔 {student ? badge.notifs : badge.alerts}</button>
        </header>
        <main className="content" id="content"><Comp /></main>
      </div>
      <Celebrations />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
const ROLE: Record<string, string> = { instructor: 'Instructor', coinstructor: 'Co-instructor', ta: 'Teaching Assistant', hod: 'Dean/HOD (read-only)', student: 'Student' };
