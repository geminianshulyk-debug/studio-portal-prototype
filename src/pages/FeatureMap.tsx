import { ArrowRight, BookOpen, Check, ChevronDown, Compass, Inbox, MessageSquareText, PenLine, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { homeOf, useStore, useUser } from '../store';
import { Badge, Hero } from '../components/ui';
import handles from '../assets/hero-handles.webp';

interface Mod { id: string; side: 'admin' | 'student'; title: string; desc: string; page?: string; tag?: string }
const MODS: Mod[] = [
  { id: 'a1', side: 'admin', title: 'Course setup builder', desc: 'Syllabus, objectives, COs and a live CO→PO/PSO mapping matrix (click cells to set 1/2/3).', page: 'course' },
  { id: 'a2', side: 'admin', title: 'CA & task builder', desc: '1–3 CAs per course, any number of tasks with brief, rubric checklist, deadline, CO tag, type, tools.', page: 'tasks' },
  { id: 'a3', side: 'admin', title: 'Gantt / instruction plan', desc: 'Semester timeline: tasks auto-plot from deadlines; drag bars to reschedule, drag rows to reorder.', page: 'plan' },
  { id: 'a4', side: 'admin', title: 'Resource manager', desc: 'Reading and software lists per course, edited inline like a spreadsheet.', page: 'resources' },
  { id: 'a5', side: 'admin', title: 'Group task configuration', desc: 'Decompose a group task into owned sub-tasks with roles that rotate (drag members between roles).', page: 'groups' },
  { id: 'a6', side: 'admin', title: 'Peer evaluation & contribution weighting', desc: 'Set cycle cadence and the visible formula that weights personal contribution against the group mark.', page: 'groups' },
  { id: 'a7', side: 'admin', title: 'IP screening & disclosure gate', desc: 'Log screened / filed / registered / not-eligible; the gate blocks portfolio-ready and competition-eligible until screening exists.', page: 'ip' },
  { id: 'a8', side: 'admin', title: 'Competitions CMS', desc: 'Add, edit, archive and bulk-tag competitions; one global list filtered by course COs.', page: 'competitions' },
  { id: 'a9', side: 'admin', title: 'XP / gamification rule engine', desc: 'Every XP rule is a JSON condition + points (json-rules-engine). Editable ranks, transparent rule table, logged manual adjustments.', page: 'xp' },
  { id: 'a10', side: 'admin', title: 'Analytics dashboard', desc: 'CO/PO/PSO attainment from task tags and marks, engagement per student and cohort, at-risk flags.', page: 'analytics' },
  { id: 'a11', side: 'admin', title: 'Audit log', desc: 'Append-only record of every grade, XP and status change — who, when, why.', page: 'audit' },
  { id: 'a12', side: 'admin', title: 'Instructor notification center', desc: 'Submissions awaiting feedback, peer outliers, at-risk students, IP-gate items — so the loop never depends on memory.', page: 'alerts' },
  { id: 'a13', side: 'admin', title: 'Grading queue & bulk actions', desc: 'Inline-annotate submissions, post rubric feedback, apply a feedback template or extend a deadline for a subset in bulk.', page: 'grading', tag: 'micro-management' },
  { id: 'a14', side: 'admin', title: 'Roles & permissions (CASL)', desc: 'TA, co-instructor, Dean/HOD and student from one permission model — see the live role × action matrix.', page: 'access', tag: 'micro-management' },
  { id: 'a15', side: 'admin', title: 'Integrity lab', desc: 'One-click attempts to break every rule (skip feedback, edit a peer score, bypass the IP gate…) proving each is blocked.', page: 'integrity', tag: 'QA' },
  { id: 's1', side: 'student', title: 'Dashboard & course selector', desc: 'XP, rank, next steps and reminders across every course you are enrolled in.', page: 'dashboard' },
  { id: 's2', side: 'student', title: 'Quest map & task board', desc: 'Tasks as a visual progression (or a drag board) in CA and deadline order; unfinished quests stay open.', page: 'quests' },
  { id: 's3', side: 'student', title: 'Upload with version history', desc: 'Uppy upload + self-check checklist; every resubmission is a new version with its own attached feedback.', page: 'quests' },
  { id: 's4', side: 'student', title: 'Peer evaluation', desc: 'Structured 4-criterion ratings for every teammate; locked on submit, outliers flagged for review.', page: 'peer' },
  { id: 's5', side: 'student', title: 'XP, rank & skill tracks', desc: 'Ledger of every XP event, rank ladder, and PSO-mapped skill tracks showing which capabilities you are building.', page: 'xp' },
  { id: 's6', side: 'student', title: 'Portfolio / IP status', desc: 'Each project’s IP stage and whether it is currently disclosure-gated (with the reason).', page: 'portfolio' },
  { id: 's7', side: 'student', title: 'Competitions board', desc: 'Filtered to your courses, with countdown, interested/applying marker and an outcome log.', page: 'competitions' },
  { id: 's8', side: 'student', title: 'Feedback inbox', desc: 'Rubric auto-feedback + instructor annotations + peer summary, tied to the task and version.', page: 'feedback' },
  { id: 's9', side: 'student', title: 'Notifications & reminders', desc: 'One mechanism for every time-bound action: deadlines, feedback, milestones, rank, peer evals, competitions.', page: 'notifications' },
  { id: 's10', side: 'student', title: 'Effort & contribution logs', desc: 'Optional self-tracking of hours per sub-task (framed as a self-tool) plus timestamped contribution notes.', page: 'peer', tag: 'micro-management' },
];
const LOOP = [
  'Lifecycle: assigned → submitted → feedback → revision (optional) → resubmission → completion → XP.',
  'A unit cannot reach “complete” without a feedback artifact on its latest version.',
  'XP is granted only after a feedback event exists for that version (re-verified when XP applies).',
  'Group milestones merge instructor feedback + peer evaluation into one artifact before the next milestone opens.',
];
const LOOPHOLES = [
  'Peer scores are immutable after submit; self-favouring / outlier scores are flagged and excluded until an instructor resolves them.',
  'Contribution and effort logs are timestamped per member by the server clock.',
  'Manual XP and grade changes require a written justification and appear in the audit log.',
  'Submission timestamps come from the data layer, never the client.',
  'The IP gate rejects portfolio-ready / competition-eligible without a screening record.',
];
const LAWS: [string, string][] = [
  ['Jakob’s Law', 'Sidebar + top bar + cards, familiar from productivity tools'], ['Hick’s Law', '4 nav groups; dense config behind tabs'],
  ['Miller’s Law', 'Lists chunked to ≤7 (rubric, quests per page, competitions)'], ['Fitts’s Law', 'Large primary buttons beside the content they act on'],
  ['Zeigarnik Effect', 'Progress rings and open quests stay visible'], ['Peak-End Rule', 'Full-screen rank-up / quest-clear moments'],
  ['Von Restorff', 'Overdue, at-risk and gate-blocked items are red-isolated'], ['Aesthetic-Usability', 'Dense admin screens still designed, tokenised'],
  ['Doherty Threshold', 'Optimistic local updates under 400ms'], ['Common Region', 'Brief, rubric, deadline grouped in bounded cards'],
  ['Nielsen', 'Toasts + explained blocks for every state change'],
];

export default function FeatureMap() {
  const user = useUser();
  const { setPage, setUser } = useStore();
  const side = user.role === 'student' ? 'student' : 'admin';
  const enter = (s: 'admin' | 'student') => (s === side ? setPage(homeOf(user.role)) : setUser(s === 'admin' ? 'u-inst' : 's1'));
  const go = (m: Mod) => {
    if (!m.page) return;
    if (m.side !== side) setUser(m.side === 'admin' ? 'u-inst' : 's1');
    setTimeout(() => setPage(m.page!), 0);
  };
  return (
    <div className="col" style={{ gap: 28 }}>
      <Hero eyebrow="B.Des Product Design · School of Design, MIT-WPU" art={handles}
        title={<>One studio for teaching and <span className="mk">making</span><span className="tp">.</span></>}
        sub="Briefs, feedback, peer reviews and portfolios — in one closed loop."
        actions={<><button className="btn primary big" onClick={() => enter('student')}>Enter as a student <ArrowRight /></button><button className="textlink" onClick={() => enter('admin')}>Enter as an instructor</button></>} />

      <div className="roles">
        <section className="rolecard">
          <div className="head"><span className="thumb butter" aria-hidden><Compass /></span><div><span className="eyebrow">For students</span><h2>Play &amp; grow</h2></div></div>
          <ul>
            <li><Compass aria-hidden />Every task is a quest on a map, in deadline order</li>
            <li><MessageSquareText aria-hidden />Feedback lands in one inbox, tied to each version</li>
            <li><Users aria-hidden />Fair peer review — locked on submit, outliers flagged</li>
            <li><Sparkles aria-hidden />XP and ranks earned only through feedback</li>
          </ul>
          <div className="go"><button className="btn ink" onClick={() => enter('student')}>Open the student side <ArrowRight /></button></div>
        </section>
        <section className="rolecard">
          <div className="head"><span className="thumb sky" aria-hidden><BookOpen /></span><div><span className="eyebrow">For instructors</span><h2>Teach, assess, govern</h2></div></div>
          <ul>
            <li><BookOpen aria-hidden />Courses, outcomes and tasks edited like a spreadsheet</li>
            <li><PenLine aria-hidden />A grading queue with annotations and bulk templates</li>
            <li><Inbox aria-hidden />One notification center so nothing depends on memory</li>
            <li><ShieldCheck aria-hidden />IP screening gate, audit log and an integrity lab</li>
          </ul>
          <div className="go"><button className="btn ink" onClick={() => enter('admin')}>Open the instructor side <ArrowRight /></button></div>
        </section>
      </div>

      <div className="col" style={{ gap: 12 }}>
        <details className="more"><summary>All student modules <span className="n">{MODS.filter((m) => m.side === 'student').length}</span><ChevronDown aria-hidden /></summary><ModGrid s="student" side={side} go={go} /></details>
        <details className="more"><summary>All instructor modules <span className="n">{MODS.filter((m) => m.side === 'admin').length}</span><ChevronDown aria-hidden /></summary><ModGrid s="admin" side={side} go={go} /></details>
        <details className="more"><summary>How the loop stays closed <span className="n">{LOOP.length + LOOPHOLES.length} rules</span><ChevronDown aria-hidden /></summary>
          <div className="grid2">
            <div><h3 style={{ marginBottom: 8 }}>Closed-loop mechanics</h3><ul className="rules">{LOOP.map((l) => <li key={l}><Check aria-hidden />{l}</li>)}</ul></div>
            <div><h3 style={{ marginBottom: 8 }}>Loophole prevention (enforced in the data layer)</h3><ul className="rules">{LOOPHOLES.map((l) => <li key={l}><Check aria-hidden />{l}</li>)}</ul>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go({ id: 'x', side: 'admin', title: '', desc: '', page: 'integrity' })}>Try to break them <ArrowRight /></button></div>
          </div>
        </details>
        <details className="more"><summary>UI/UX laws applied <span className="n">{LAWS.length}</span><ChevronDown aria-hidden /></summary>
          <div className="grid3">{LAWS.map(([a, b]) => <div key={a}><b>{a}</b><div className="small muted">{b}</div></div>)}</div>
        </details>
      </div>
      <p className="footnote">Prototype · mock data stored in this browser · switch roles from the avatar in the top bar</p>
    </div>
  );
}

function ModGrid({ s, side, go }: { s: 'admin' | 'student'; side: 'admin' | 'student'; go: (m: Mod) => void }) {
  return (
    <div className="fmap">
      {MODS.filter((m) => m.side === s).map((m) => (
        <button key={m.id} className="card" onClick={() => go(m)} aria-label={`Open ${m.title}`}>
          <div className="row between" style={{ alignItems: 'flex-start' }}><h3>{m.title}</h3>{m.tag && <Badge kind="info">{m.tag}</Badge>}</div>
          <span className="small muted">{m.desc}</span>
          <span className="go">{m.side !== side ? `Switch to ${m.side === 'admin' ? 'instructor' : 'student'} view` : 'Open'} <ArrowRight className="ico-svg" /></span>
        </button>
      ))}
    </div>
  );
}
