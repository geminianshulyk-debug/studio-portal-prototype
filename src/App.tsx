import { Toaster } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronDown, FlaskConical, Search } from 'lucide-react';
import { homeOf, useDb, useStore, useUser } from './store';
import { ADMIN_PAGES, STUDENT_PAGES, SHARED, TOUR, type PageDef } from './pages/registry';
import Celebrations from './components/Celebrations';
import { Avatar } from './components/ui';
import { instructorAlerts } from './lib/selectors';

const LAWS_KEY = 'studio.showLaws';
const readLaws = () => { try { return localStorage.getItem(LAWS_KEY) === '1'; } catch { return false; } };

export default function App() {
  const db = useDb();
  const user = useUser();
  const { page, setPage, setUser, courseId, setCourse, reset, cmd } = useStore();
  const student = user.role === 'student';
  const pages = student ? STUDENT_PAGES : ADMIN_PAGES;
  const [laws, setLaws] = useState(readLaws);
  const badge = useMemo(() => ({
    alerts: student ? 0 : instructorAlerts(db).length,
    notifs: db.notifications.filter((n) => n.userId === user.id && !n.read).length,
    feedback: db.feedback.filter((f) => f.studentId === user.id && !f.read).length,
  }), [db, user.id, student]);
  const current = pages.find((p) => p.id === page);
  const Comp = SHARED[page] ?? current?.comp ?? pages[0].comp;
  const groups = [...new Set(pages.filter((p) => !p.hidden).map((p) => p.group))];
  const myCourses = db.courses.filter((c) => user.courseIds.includes(c.id));
  const course = myCourses.find((c) => c.id === courseId) ?? myCourses[0];
  const bell = student ? badge.notifs : badge.alerts;
  useEffect(() => { document.getElementById('content')?.scrollTo(0, 0); }, [page]);
  const toggleLaws = (v: boolean) => { setLaws(v); try { localStorage.setItem(LAWS_KEY, v ? '1' : '0'); } catch { /* ignore */ } };
  const nav = (p: PageDef) => (
    <button key={p.id} className="nav" aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
      <span className="ico" aria-hidden><p.icon /></span>{p.label}
      {p.badge && badge[p.badge] > 0 && <span className="dot" aria-label={`${badge[p.badge]} new`}>{badge[p.badge]}</span>}
    </button>
  );
  return (
    <div className="shell" data-mode={student ? 'student' : 'admin'} data-laws={laws ? '' : undefined}>
      <header className="topbar">
        <button className="brand" onClick={() => setPage(homeOf(user.role))} aria-label="STUDIO home">
          <span className="word">STUDIO<i>.</i></span>
          <span className="sub">B.Des Product Design<br />School of Design</span>
        </button>
        <JumpTo pages={[...pages, TOUR]} onGo={setPage} />
        <div className="top-actions">
          {myCourses.length > 1 && (
            <label className="pickchip course" title="Switch course">
              <span>{course.code} · {course.semester.split(' · ')[0]}</span><ChevronDown aria-hidden />
              <select value={course.id} onChange={(e) => setCourse(e.target.value)} aria-label="Course">
                {myCourses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
              </select>
            </label>
          )}
          <button className="iconbtn" onClick={() => setPage(student ? 'notifications' : 'alerts')} aria-label={`Notifications (${bell})`}>
            <Bell />{bell > 0 && <span className="count">{bell}</span>}
          </button>
          <details className="demo">
            <summary className="iconbtn" aria-label="Demo tools" title="Demo tools"><FlaskConical /></summary>
            <div className="popover">
              <span className="lbl">Demo tools</span>
              <button className="btn sm" onClick={() => cmd.simulateConcurrentEdit()}>Simulate a co-instructor editing “Concept sketch set”</button>
              <button className="btn sm" onClick={() => cmd.rubricEditedByInstructor('t3')}>Simulate a rubric edit mid-submission</button>
              <label className="toggle"><input type="checkbox" checked={laws} onChange={(e) => toggleLaws(e.target.checked)} /> Show UX-law annotations</label>
              <button className="btn sm danger" onClick={reset}>Reset demo data</button>
              <span className="small muted">Mock data lives in this browser (localStorage). No backend.</span>
            </div>
          </details>
          <label className="pickchip" title="Viewing as — switch role">
            <Avatar id={user.id} name={user.name} />
            <span className="who"><b>{user.name}</b><span>{ROLE[user.role]}</span></span><ChevronDown aria-hidden />
            <select value={user.id} onChange={(e) => setUser(e.target.value)} aria-label="Viewing as (switch role)">
              <optgroup label="Instructor / Admin side">
                {db.users.filter((u) => u.role !== 'student').map((u) => <option key={u.id} value={u.id}>{u.name} — {ROLE[u.role]}</option>)}
              </optgroup>
              <optgroup label="Student side">
                {db.users.filter((u) => u.role === 'student').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            </select>
          </label>
        </div>
      </header>
      <nav className="side" aria-label="Main">
        {groups.map((g) => (
          <div className="navgroup" key={g || 'main'}>
            {g && <h4>{g}</h4>}
            {pages.filter((p) => p.group === g && !p.hidden).map(nav)}
          </div>
        ))}
        <div className="navgroup foot">{nav(TOUR)}</div>
      </nav>
      <main className="content" id="content"><div className="page"><Comp /></div></main>
      <Celebrations />
      <Toaster position="top-right" closeButton />
    </div>
  );
}

/** "Search or jump to…" — filters pages by name; ⌘K / Ctrl+K focuses it. */
function JumpTo({ pages, onGo }: { pages: PageDef[]; onGo: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const hits = pages.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const go = (p: PageDef) => { onGo(p.id); setQ(''); setOpen(false); ref.current?.blur(); };
  return (
    <div className="jump" role="combobox" aria-expanded={open} aria-haspopup="listbox">
      <Search aria-hidden />
      <input ref={ref} type="search" placeholder="Search or jump to…" value={q} aria-label="Search or jump to a page"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === 'Enter' && hits[sel]) go(hits[sel]);
          if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); }
        }} />
      {!open && <span className="kbd">⌘K</span>}
      {open && hits.length > 0 && (
        <ul className="jump-list" role="listbox">
          {hits.map((p, i) => <li key={p.id} role="option" aria-selected={i === sel}><button onMouseDown={(e) => e.preventDefault()} onClick={() => go(p)}><p.icon className="ico-svg" aria-hidden />{p.label}<span className="grp">{p.group || 'main'}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
const ROLE: Record<string, string> = { instructor: 'Instructor', coinstructor: 'Co-instructor', ta: 'Teaching Assistant', hod: 'Dean/HOD (read-only)', student: 'Student' };
