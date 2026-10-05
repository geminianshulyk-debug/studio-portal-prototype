import { useMemo, useState } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { useCmd, useDb, useNow, useStore, useUser } from '../../store';
import { Bell, ExternalLink, Hammer, KeyRound, MessageSquareText, Rocket, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react';
import { Badge, Banner, Bar, Card, Due, Empty, PageHead } from '../../components/ui';
import { countdown } from '../../lib/time';
import { fmtDateTime, outcomeAttainment, rankFor, remindersFor, xpTotal, coAttainment } from '../../lib/selectors';
import { ipBadge } from '../admin/IPPage';
import type { IPStatus } from '../../types';

export function XPSkills() {
  const db = useDb(), user = useUser();
  const [more, setMore] = useState(false);
  const xp = xpTotal(db, user.id);
  const { rank, next, pct } = rankFor(db.ranks, xp);
  const ranks = [...db.ranks].sort((a, b) => a.minXp - b.minXp);
  const events = db.xpEvents.filter((e) => e.studentId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  const att = outcomeAttainment(db, user.courseIds, user.id);
  const psos = db.outcomes.filter((o) => o.kind === 'PSO');
  const evidence = (key: string) => user.courseIds.reduce((a, cid) => { const c = db.courses.find((x) => x.id === cid)!; const ca = coAttainment(db, cid, user.id); return a + c.cos.filter((co) => (co.map[key] ?? 0) > 0).reduce((n, co) => n + ca[co.id].n, 0); }, 0);
  const radar = psos.map((p) => ({ key: p.key, v: Math.round(att[p.key] ?? 0) }));
  return (
    <>
      <PageHead title="XP, rank & skill tracks" sub="Every XP point is earned through a feedback event and listed below. Skill tracks map to the programme’s PSOs — they show which capability areas you’re actually building."
        laws={['Peak-End — rank-ups get a full-screen moment', 'Zeigarnik — next-rank bar always visible']} />
      <div className="col">
        <Card>
          <div className="row" style={{ gap: 16, marginBottom: 8 }}><span className="pin" aria-hidden><Hammer /></span><div><h2>{rank.name}</h2><span className="mono small muted">{xp} XP earned</span></div></div>
          <div className="rankrow">{ranks.map((r) => <span key={r.id} className={`rankstep ${r.id === rank.id ? 'cur' : xp >= r.minXp ? 'on' : ''}`}>{r.name} · {r.minXp}</span>)}</div>
          <div className="row" style={{ marginTop: 8 }}><div className="grow"><Bar value={pct} kind="xp" /></div><span className="small">{next ? `${next.minXp - xp} XP to ${next.name}` : 'max rank'}</span></div>
        </Card>
        <div className="grid2">
          <Card title="Skill tracks (PSO)">
            <div style={{ height: 220 }} role="img" aria-label="Radar of PSO skill tracks"><ResponsiveContainer><RadarChart data={radar}><PolarGrid stroke="#e2dacb" /><PolarAngleAxis dataKey="key" tick={{ fontSize: 12, fill: '#4a463f' }} /><Radar dataKey="v" stroke="#1f3fbf" fill="#1f3fbf" fillOpacity={0.18} strokeWidth={2} /></RadarChart></ResponsiveContainer></div>
            {psos.map((p) => { const e = evidence(p.key); return <div key={p.key} style={{ marginTop: 6 }}><div className="row between small"><span><b>{p.key}</b> {p.title}</span>{e ? <span>{Math.round(att[p.key] ?? 0)}% · {e} evidence</span> : <Badge kind="warn">not started</Badge>}</div><Bar value={(att[p.key] ?? 0) / 100} kind="info" thin /></div>; })}
          </Card>
          <Card title="How XP is earned (transparent rules)">
            <table className="plain"><tbody>{db.xpRules.filter((r) => r.enabled).map((r) => <tr key={r.id}><td><b>{r.name}</b><div className="small muted">{r.action}</div></td><td style={{ textAlign: 'right' }}><span className="xpchip">+{r.points}</span></td></tr>)}</tbody></table>
            <p className="small muted">Task XP is granted only after a reviewer has posted feedback on that version.</p>
          </Card>
        </div>
        <Card title="XP ledger">
          {(more ? events : events.slice(0, 7)).map((e) => <div key={e.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><div><b>{e.label}</b>{e.justification && <div className="small muted">Manual · “{e.justification}”</div>}<div className="small muted">{fmtDateTime(e.at)}</div></div><span className="xpchip" style={e.points < 0 ? { color: 'var(--danger)', background: 'var(--danger-weak)' } : undefined}>{e.points > 0 ? '+' : ''}{e.points}</span></div>)}
          {events.length > 7 && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show ${events.length - 7} more`}</button>}
        </Card>
      </div>
    </>
  );
}

const STEPS: IPStatus[] = ['screened', 'filed', 'registered'];
export function Portfolio() {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const mine = db.projects.filter((p) => p.ownerIds.includes(user.id));
  const tryFlag = (id: string, flag: 'portfolioReady' | 'competitionEligible', v: boolean) => { const r = cmd.setProjectFlag(id, flag, v); setMsg({ ...msg, [id]: r.ok ? '' : r.error }); };
  return (
    <>
      <PageHead title="Portfolio & IP status" sub="Each project’s IP stage, and whether it is currently gated from portfolio or competitions." laws={['Von Restorff — gate blocks are red with the reason', 'Nielsen — blocked actions explain themselves']} />
      <div className="col">
        {mine.length === 0 && <Empty>No projects yet.</Empty>}
        {mine.map((p) => {
          const course = db.courses.find((c) => c.id === p.courseId)!;
          const blocked = course.disclosureGate && (!p.screening || p.ipStatus === 'unscreened');
          return (
            <Card key={p.id} title={p.title} actions={ipBadge(p.ipStatus)} className={blocked ? 'overdue' : ''}>
              <div className="row wrap" style={{ marginBottom: 8 }}>
                {STEPS.map((s, i) => <span key={s} className={`rankstep ${p.ipStatus === s ? 'cur' : STEPS.indexOf(p.ipStatus) > i ? 'on' : ''}`}>{i + 1}. {s}</span>)}
                {p.ipStatus === 'not_eligible' && <Badge kind="gray">not eligible for registration</Badge>}
              </div>
              {blocked ? <Banner kind="danger"><b>Disclosure-gated.</b> This project has no IP screening record yet, so it can’t be marked portfolio-ready or competition-eligible. Your instructor logs the screening decision — you’ll be notified.</Banner>
                : <Banner kind="ok">Gate cleared — screened by the instructor team{p.screening ? ` on ${fmtDateTime(p.screening.at)}` : ''}.</Banner>}
              {p.screening && <p className="small muted">{p.screening.note}</p>}
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={() => tryFlag(p.id, 'portfolioReady', !p.portfolioReady)}>{p.portfolioReady ? 'Portfolio-ready (undo)' : 'Mark portfolio-ready'}</button>
                <button className="btn" onClick={() => tryFlag(p.id, 'competitionEligible', !p.competitionEligible)}>{p.competitionEligible ? 'Competition-eligible (undo)' : 'Mark competition-eligible'}</button>
              </div>
              {msg[p.id] && <div style={{ marginTop: 8 }}><Banner kind="danger">{msg[p.id]}</Banner></div>}
              {course.customFields.filter((f) => f.appliesTo === 'project').map((f) => <div key={f.id} className="small" style={{ marginTop: 6 }}><b>{f.label}:</b> {p.custom[f.id] || '—'}</div>)}
            </Card>);
        })}
      </div>
    </>
  );
}

export function CompetitionsStudent() {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const now = useNow(60000);
  const [more, setMore] = useState(false);
  const codes = db.courses.filter((c) => user.courseIds.includes(c.id)).map((c) => c.code);
  const list = useMemo(() => db.competitions.filter((c) => !c.archived && codes.some((cd) => c.coCodes.includes(`${cd}-`))).sort((a, b) => a.deadline.localeCompare(b.deadline)), [db.competitions, codes.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = more ? list : list.slice(0, 5); // Miller
  return (
    <>
      <PageHead title="Competitions board" sub={`Filtered to your enrolled courses (${codes.join(', ')}). Mark interest, then log your outcome — entering earns XP. Sample entries.`} laws={['Miller — 5 per page', 'Von Restorff — closing-soon deadlines turn red']} />
      <div className="col">
        {shown.map((c) => {
          const e = db.compEntries.find((x) => x.competitionId === c.id && x.studentId === user.id);
          const cd = countdown(c.deadline, now);
          return (
            <Card key={c.id} className={cd.late ? '' : cd.urgent ? 'overdue' : ''} title={<span>{c.name}</span>} actions={cd.late ? <Badge kind="gray">closed</Badge> : <Due iso={c.deadline} now={now} />}>
              <div className="small muted">{c.organizer} · deadline {c.deadline} · maps to {c.coCodes} · {c.eligibility}</div>
              <div className="small">Prize: {c.prize} · <a href={c.link} target="_blank" rel="noreferrer" className="inl">official link <ExternalLink className="ico-svg" /></a></div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                {(['interested', 'applying'] as const).map((m) => <button key={m} className={`btn ${e?.marker === m ? 'on' : ''}`} aria-pressed={e?.marker === m} onClick={() => cmd.setCompMarker(c.id, e?.marker === m ? 'none' : m)}>{m === 'interested' ? <><Star /> Interested</> : <><Rocket /> Applying</>}</button>)}
                {e?.marker === 'applying' && <><span className="lbl">Outcome log</span><select value={e.outcome} onChange={(ev) => cmd.setCompOutcome(c.id, ev.target.value as never)} style={{ width: 'auto' }}><option value="none">not submitted</option><option value="submitted">submitted</option><option value="shortlisted">shortlisted</option><option value="won">won</option></select></>}
              </div>
            </Card>);
        })}
        {list.length === 0 && <Empty>No competitions tagged to your courses yet.</Empty>}
        {list.length > 5 && <button className="btn" onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show ${list.length - 5} more`}</button>}
      </div>
    </>
  );
}

const N_ICON: Record<string, LucideIcon> = { rank: Trophy, feedback: MessageSquareText, milestone: KeyRound, xp: Sparkles };
export function Notifications() {
  const db = useDb(), user = useUser(), cmd = useCmd(), { setPage } = useStore();
  const now = useNow(30000);
  const mine = db.notifications.filter((n) => n.userId === user.id);
  const reminders = remindersFor(db, user.id, now);
  return (
    <>
      <PageHead title="Notifications & reminders" sub="One mechanism for every time-bound action: deadlines, feedback, milestones, rank-ups, peer evaluations and competitions."
        laws={['Nielsen — visibility of system status']} actions={<button className="btn" onClick={() => cmd.markNotificationsRead()}>Mark all read</button>} />
      <div className="grid2">
        <Card title={`Coming up (${reminders.length})`}>
          {reminders.length === 0 && <p className="muted small">Nothing due soon.</p>}
          <div className="list">{reminders.map((r) => <div key={r.id} className="li"><span className="tx"><b>{r.title}</b><span>{r.kind}</span></span><Due iso={r.dueAt} now={now} /><button className="btn sm" onClick={() => setPage(r.page)}>Go</button></div>)}</div>
        </Card>
        <Card title="Inbox">
          {mine.length === 0 && <p className="muted small">No notifications.</p>}
          <div className="list">{mine.map((n) => { const I = N_ICON[n.kind] ?? Bell; return <div key={n.id} className={`li ${n.read ? '' : 'unread'}`}>
            <span className="ic" aria-hidden><I /></span><span className="tx"><b>{n.title}</b><span>{n.body} · {fmtDateTime(n.at)}</span></span>
            {n.page && <button className="btn sm" onClick={() => { cmd.markNotificationsRead([n.id]); setPage(n.page!); }}>Open</button>}</div>; })}</div>
        </Card>
      </div>
    </>
  );
}
