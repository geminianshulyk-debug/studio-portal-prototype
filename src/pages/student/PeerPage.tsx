import { useMemo, useState } from 'react';
import { useCmd, useDb, useNow, useUser } from '../../store';
import { Badge, Banner, Card, Due, Field, Modal, PageHead } from '../../components/ui';
import { PEER_CRITERIA, type PeerCriterion } from '../../types';
import { avgScore, peerScoreFor } from '../../lib/peer';
import { fmtDateTime, userName } from '../../lib/selectors';

type Scores = Record<string, Record<PeerCriterion, number>>;
const LABEL: Record<PeerCriterion, string> = { contribution: 'Contribution', reliability: 'Reliability', quality: 'Quality of work', collaboration: 'Collaboration' };

export default function PeerPage() {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const now = useNow(30000);
  const tasks = db.tasks.filter((t) => t.type === 'group' && t.group && db.groups.find((g) => g.id === t.group!.groupId)?.memberIds.includes(user.id) && user.courseIds.includes(t.courseId));
  if (!tasks.length) return <><PageHead title="Peer evaluation" sub="You’re not part of a group task." /></>;
  const task = tasks[0];
  const group = db.groups.find((g) => g.id === task.group!.groupId)!;
  const cycles = db.peerCycles.filter((c) => c.taskId === task.id).sort((a, b) => a.opens.localeCompare(b.opens));
  return (
    <>
      <PageHead title="Peer evaluation & team log" sub={`${task.title} · ${group.name}`} laws={['Hick — one cycle form at a time', 'Fitts — 1–5 score buttons are large tap targets', 'Nielsen — lock warning before submit']} />
      <div className="col">
        {cycles.map((c) => <Cycle key={c.id} cycleId={c.id} memberIds={group.memberIds} now={now} />)}
        <Logs taskId={task.id} memberIds={group.memberIds} />
      </div>
    </>
  );
}

function Cycle({ cycleId, memberIds, now }: { cycleId: string; memberIds: string[]; now: number }) {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const c = db.peerCycles.find((x) => x.id === cycleId)!;
  const mine = db.peerEvals.filter((e) => e.cycleId === c.id && e.evaluatorId === user.id);
  const submitted = mine.length > 0;
  const [scores, setScores] = useState<Scores>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const complete = memberIds.every((m) => PEER_CRITERIA.every((k) => scores[m]?.[k]));
  const received = useMemo(() => peerScoreFor(db.peerEvals.filter((e) => e.cycleId === c.id), user.id), [db.peerEvals, c.id, user.id]);
  return (
    <Card title={<span>{c.label} <Badge kind={c.status === 'open' ? 'warn' : c.status === 'closed' ? 'gray' : 'info'}>{c.status}</Badge></span>} actions={c.status === 'open' && !submitted ? <Due iso={c.due} now={now} /> : undefined}>
      {c.status === 'scheduled' && <p className="muted small">Opens {fmtDateTime(c.opens)}.</p>}
      {submitted && (
        <>
          <Banner kind="ok">Your evaluation was submitted {fmtDateTime(mine[0].submittedAt)} and is locked — scores can’t be edited after submission. If something is wrong, raise it with your instructor.</Banner>
          <table className="plain" style={{ marginTop: 8 }}><thead><tr><th>Teammate</th>{PEER_CRITERIA.map((k) => <th key={k}>{LABEL[k]}</th>)}</tr></thead>
            <tbody>{mine.map((e) => <tr key={e.id}><td>{e.evaluateeId === user.id ? <i>You (self)</i> : userName(db, e.evaluateeId)}</td>{PEER_CRITERIA.map((k) => <td key={k}>{e.scores[k]}</td>)}</tr>)}</tbody></table>
        </>
      )}
      {c.status === 'closed' && <p className="small" style={{ marginTop: 8 }}>Your received peer score: <b>{received.count ? received.avg.toFixed(1) : '—'}/5</b> from {received.count} rating(s){received.flagged ? ` (${received.flagged} under review)` : ''}. Self-ratings never count toward your own score.</p>}
      {c.status === 'open' && !submitted && (
        <div className="col">
          <Banner kind="info">Rate every teammate <b>and yourself</b> on each criterion (1 = needs a lot of support, 5 = outstanding). Ratings that differ sharply from your peers’ are flagged for instructor review rather than averaged in.</Banner>
          {memberIds.map((m) => (
            <div key={m} className="card region">
              <b>{m === user.id ? 'You (self)' : userName(db, m)}</b>
              {PEER_CRITERIA.map((k) => (
                <div key={k} className="row between wrap" style={{ padding: '4px 0' }}><span className="small">{LABEL[k]}</span>
                  <div className="row" role="radiogroup" aria-label={`${LABEL[k]} for ${userName(db, m)}`}>{[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} role="radio" aria-checked={scores[m]?.[k] === n} className={`btn ${scores[m]?.[k] === n ? 'on' : ''}`} style={{ width: 44, height: 44, padding: 0 }} onClick={() => setScores({ ...scores, [m]: { ...scores[m], [k]: n } as Record<PeerCriterion, number> })}>{n}</button>))}</div></div>
              ))}
              <input type="text" placeholder="Optional comment (specific and kind)" value={comments[m] ?? ''} onChange={(e) => setComments({ ...comments, [m]: e.target.value })} />
            </div>
          ))}
          <button className="btn primary big" disabled={!complete} onClick={() => setConfirm(true)}>Submit evaluation</button>
          {!complete && <span className="small muted">Score all criteria for all {memberIds.length} people to continue.</span>}
        </div>
      )}
      {confirm && (
        <Modal title="Submit and lock?" onClose={() => setConfirm(false)}>
          <p>Once submitted, your scores <b>cannot be edited</b> by you or anyone on your team. Are you sure?</p>
          <div className="row"><button className="btn primary big" onClick={() => { const r = cmd.submitPeerRound(c.id, memberIds.map((m) => ({ evaluateeId: m, scores: scores[m], comment: comments[m] ?? '' }))); if (r.ok) { setConfirm(false); import('sonner').then(({ toast }) => toast.success('Peer evaluation submitted & locked', { description: '+XP will follow for completing the round' })); } }}>Yes, submit</button><button className="btn" onClick={() => setConfirm(false)}>Go back</button></div>
        </Modal>
      )}
      {c.status === 'open' && submitted && <p className="small muted" style={{ marginTop: 8 }}>Cycle closes {fmtDateTime(c.due)}. Average score for {avgScore(mine[0].scores).toFixed(1)} on first row shown above.</p>}
    </Card>
  );
}

function Logs({ taskId, memberIds }: { taskId: string; memberIds: string[] }) {
  const db = useDb(), user = useUser(), cmd = useCmd();
  const task = db.tasks.find((t) => t.id === taskId)!;
  const ms = task.group!.milestones;
  const [m, setM] = useState(ms.find((x) => new Date(x.due).getTime() > Date.now())?.id ?? ms.at(-1)!.id);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const myEffort = db.effort.filter((e) => e.taskId === taskId && e.studentId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  const team = db.contributions.filter((c) => c.taskId === taskId && memberIds.includes(c.studentId)).sort((a, b) => b.at.localeCompare(a.at));
  const course = db.courses.find((c) => c.id === task.courseId)!;
  return (
    <div className="grid2">
      <Card title="My effort log (self-tracking, optional)">
        <Banner kind="info">A tool for <b>you</b> to see where your time goes. It’s optional, private to you and your instructor, and is just one of two inputs (weight {Math.round(course.peer.effortWeight * 100)}%) to contribution weighting — alongside peer scores ({Math.round(course.peer.peerWeight * 100)}%). Rough numbers are fine.</Banner>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="Milestone"><select value={m} onChange={(e) => setM(e.target.value)}>{ms.map((x) => <option key={x.id} value={x.id}>{x.title} — my role: {x.assignments[user.id]}</option>)}</select></Field>
          <Field label="Hours (rough)"><input type="number" step={0.5} min={0} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
        <input type="text" placeholder="What did you work on?" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 8 }} />
        <button className="btn primary" style={{ marginTop: 8 }} onClick={() => cmd.logEffort(taskId, m, Number(hours), note).ok && (setHours(''), setNote(''))}>Log effort</button>
        {myEffort.map((e) => <div key={e.id} className="small row between" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span>{ms.find((x) => x.id === e.milestoneId)?.title.split(' · ')[0]} · {e.hours}h · {e.note}</span><span className="muted">{fmtDateTime(e.at)}</span></div>)}
      </Card>
      <Card title="Team contribution log (timestamped, per person)">
        <div className="row"><input type="text" placeholder="What did you just do for the team?" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn primary" onClick={() => cmd.logContribution(taskId, m, text).ok && setText('')}>Add</button></div>
        {team.map((c) => <div key={c.id} className="small row between" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span><b>{userName(db, c.studentId).split(' ')[0]}</b> · {c.text}</span><span className="muted">{fmtDateTime(c.at)}</span></div>)}
        {!team.length && <p className="muted small">No entries yet.</p>}
      </Card>
    </div>
  );
}
