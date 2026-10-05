import { useMemo, useState } from 'react';
import { useCmd, useDb } from '../../store';
import { Check, Paperclip } from 'lucide-react';
import { Badge, Banner, Card, Drawer, Field, Html, Modal, PageHead, Rte, Tabs } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { numCol, selectCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse, useGridCommit } from './common';
import { effectiveDeadline, fmtDateTime, feedbackOfSubmission, statusOf, submissionsOf, unitsFor, userName } from '../../lib/selectors';
import { isMilestoneUnit, unitMilestone, unitTask, type Annotation, type FeedbackTemplate, type Task } from '../../types';

interface Item { id: string; unitId: string; studentId: string; student: string; title: string; version: number; submitted: string; onTime: string; status: string; score: string; waiting: number; task: Task }

export default function GradingPage() {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const [tab, setTab] = useState('queue');
  const [open, setOpen] = useState<Item | null>(null);
  const [onlyAwaiting, setOnlyAwaiting] = useState(true);
  const [extend, setExtend] = useState<Item[] | null>(null);
  const [tpl, setTpl] = useState(db.templates[0]?.id);
  const canGrade = can('grade', 'Submission');

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const u of db.users.filter((x) => x.role === 'student' && x.courseIds.includes(course.id))) {
      for (const unit of unitsFor(db, u.id, course.id)) {
        const subs = submissionsOf(db, unit.unitId, u.id);
        const last = subs.at(-1);
        if (!last) continue;
        const fb = feedbackOfSubmission(db, last.id);
        out.push({ id: `${unit.unitId}:${u.id}`, unitId: unit.unitId, studentId: u.id, student: u.name, title: unit.title, version: last.version, submitted: last.submittedAt, onTime: last.onTime ? 'on time' : 'LATE', status: statusOf(db, unit.unitId, u.id), score: fb ? `${fb.total}%` : '—', waiting: fb ? 0 : Math.round((Date.now() - new Date(last.submittedAt).getTime()) / 36e5), task: unit.task });
      }
    }
    return out.sort((a, b) => b.waiting - a.waiting);
  }, [db, course.id]);
  const rows = onlyAwaiting ? items.filter((i) => i.status === 'submitted' || i.status === 'resubmitted') : items;
  const cols: GCol<Item>[] = [
    textCol('student', 'Student', { width: 150, editable: false }), textCol('title', 'Task / milestone', { width: 300, editable: false }),
    numCol('version', 'Ver', { width: 60, editable: false }),
    { key: 'submitted', name: 'Submitted (server time)', width: 170, renderCell: ({ row }) => <span>{fmtDateTime(row.submitted)}</span> },
    { key: 'onTime', name: 'Timing', width: 90, renderCell: ({ row }) => <Badge kind={row.onTime === 'LATE' ? 'danger' : 'ok'}>{row.onTime}</Badge> },
    { key: 'status', name: 'Status', width: 120, renderCell: ({ row }) => <Badge kind={row.status === 'submitted' || row.status === 'resubmitted' ? 'warn' : row.status === 'complete' ? 'ok' : row.status === 'revision' ? 'dangerweak' : 'info'}>{row.status}</Badge> },
    textCol('score', 'Score', { width: 80, editable: false }),
    { key: 'waiting', name: 'Waiting', width: 90, renderCell: ({ row }) => <span>{row.status === 'submitted' || row.status === 'resubmitted' ? `${row.waiting}h` : '—'}</span> },
    { key: 'go', name: '', width: 110, sortable: false, renderCell: ({ row }) => <button className={`btn sm ${row.status === 'submitted' || row.status === 'resubmitted' ? 'ink' : ''}`} onClick={() => setOpen(row)}>{row.status === 'submitted' || row.status === 'resubmitted' ? 'Give feedback' : 'Open'}</button> },
  ];
  const tplCommit = useGridCommit('templates', '');
  const tplCols: GCol<FeedbackTemplate>[] = [
    textCol('name', 'Template name', { width: 220 }), numCol('pct', '% of each criterion', { width: 150 }), selectCol('decision', 'Decision', ['pass', 'revise'], { width: 110 }), textCol('comment', 'Comment', { width: 420 }),
  ];
  return (
    <>
      <PageHead title="Grading queue" sub="Every submission needs a feedback artifact before it can complete. Give rubric-based feedback with inline annotations, or apply a template to a selection in bulk."
        laws={['Fitts’s Law — “Post feedback” is large and sits under the content it acts on', 'Von Restorff — late and long-waiting items stand out']} />
      {!canGrade && <Banner kind="info">Your role can view submissions but not grade.</Banner>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Queue' }, { id: 'templates', label: 'Feedback templates' }]} />
      {tab === 'queue' && (
        <div className="col">
          <div className="row"><div className="seg" role="group" aria-label="Filter"><button aria-pressed={onlyAwaiting} onClick={() => setOnlyAwaiting(true)}>Awaiting feedback ({items.filter((i) => i.status === 'submitted' || i.status === 'resubmitted').length})</button><button aria-pressed={!onlyAwaiting} onClick={() => setOnlyAwaiting(false)}>All submissions ({items.length})</button></div></div>
          <EditableGrid label="Submissions" rows={rows} columns={cols} readOnly selectable={canGrade} onCommit={() => ({ ok: true, value: null })} hint="Select rows for bulk actions"
            rowClass={(r) => (r.onTime === 'LATE' && (r.status === 'submitted' || r.status === 'resubmitted') ? 'row-danger' : r.waiting > 72 ? 'row-warn' : undefined)}
            bulk={(sel, clear) => canGrade && (
              <>
                <select value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }} aria-label="Feedback template">{db.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <button className="btn sm primary" disabled={!sel.length} onClick={() => {
                  const ids = sel.filter((s) => s.status === 'submitted' || s.status === 'resubmitted').map((s) => { const l = submissionsOf(db, s.unitId, s.studentId).at(-1)!; return l.id; });
                  const r = cmd.bulkFeedback(ids, tpl);
                  if (r.ok) { clear(); import('sonner').then(({ toast }) => toast.success(`Template applied to ${r.value.ok} submission(s)`, { description: r.value.skipped.length ? `${r.value.skipped.length} skipped` : 'Feedback events created, XP will follow for passes' })); }
                }}>Apply template to {sel.length || ''} selected</button>
                <button className="btn sm" disabled={!sel.length} onClick={() => setExtend(sel)}>Extend deadline…</button>
              </>)} />
        </div>
      )}
      {tab === 'templates' && <Card title="Feedback templates (for bulk application)"><EditableGrid label="Feedback templates" rows={db.templates} columns={tplCols} readOnly={!canGrade} onCommit={tplCommit as never} newRow={(): FeedbackTemplate => ({ id: newId(), name: 'New template', pct: 70, decision: 'pass', comment: '' })} /></Card>}
      {open && <GradeDrawer item={open} onClose={() => setOpen(null)} />}
      {extend && <Extend items={extend} onClose={() => setExtend(null)} />}
    </>
  );
}

function Extend({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const cmd = useCmd();
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const tasks = [...new Set(items.map((i) => i.task.id))];
  return (
    <Modal title={`Extend deadline for ${items.length} student(s)`} onClose={onClose}>
      <div className="col">
        <Banner kind="info">Extensions apply only to the selected students and are logged with your reason. The server clock still decides on-time status.</Banner>
        <Field label="New deadline"><input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
        <Field label="Documented reason (required)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. medical leave 3–5 Oct, certificate seen" /></Field>
        <button className="btn primary big" disabled={!until} onClick={() => {
          let ok = true;
          for (const t of tasks) { const r = cmd.extendDeadline(t, [...new Set(items.filter((i) => i.task.id === t).map((i) => i.studentId))], new Date(until).toISOString(), reason); ok = ok && r.ok; }
          if (ok) onClose();
        }}>Apply extension</button>
      </div>
    </Modal>
  );
}

function GradeDrawer({ item, onClose }: { item: Item; onClose: () => void }) {
  const db = useDb(), cmd = useCmd(), can = useCan();
  const task = db.tasks.find((t) => t.id === unitTask(item.unitId))!;
  const subs = submissionsOf(db, item.unitId, item.studentId);
  const [ver, setVer] = useState(subs.length);
  const sub = subs[ver - 1];
  const fb = feedbackOfSubmission(db, sub.id);
  const isLatest = ver === subs.length;
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(task.rubric.map((k) => [k.id, 0])));
  const [comment, setComment] = useState('<p></p>');
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [sel, setSel] = useState<{ p: number; q: string } | null>(null);
  const [annText, setAnnText] = useState('');
  const [decision, setDecision] = useState<'pass' | 'revise'>('pass');
  const [newGrade, setNewGrade] = useState('');
  const [why, setWhy] = useState('');
  const canGrade = can('grade', 'Submission');
  const max = task.rubric.reduce((a, k) => a + k.max, 0);
  const total = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / max) * 100);
  const status = statusOf(db, item.unitId, item.studentId);
  const paras = sub.note.split(/\n\s*\n/);
  const shownAnns = fb ? fb.annotations : anns;

  const captureSel = () => {
    const s = window.getSelection();
    const text = s?.toString().trim();
    if (!text || text.length < 3) return;
    const el = (s!.anchorNode as HTMLElement).parentElement?.closest('[data-p]') as HTMLElement | null;
    if (el) setSel({ p: Number(el.dataset.p), q: text });
  };
  const render = (para: string, idx: number) => {
    const a = shownAnns.filter((x) => x.paragraph === idx && para.includes(x.quote));
    if (!a.length) return para;
    let parts: (string | React.ReactElement)[] = [para];
    for (const an of a) parts = parts.flatMap((p) => typeof p === 'string' && p.includes(an.quote) ? p.split(an.quote).flatMap((s, i, arr) => (i < arr.length - 1 ? [s, <mark key={an.id + i} className="ann" title={an.comment}>{an.quote}</mark>] : [s])) : [p]);
    return parts;
  };
  const post = () => {
    const r = cmd.postFeedback({ submissionId: sub.id, scores, comment, annotations: anns, decision });
    if (r.ok) onClose();
  };
  return (
    <Drawer title={`${item.student} — ${item.title}`} onClose={onClose}>
      <div className="col">
        <div className="row wrap">
          {subs.map((s) => <button key={s.id} className={`btn sm ${ver === s.version ? 'on' : ''}`} onClick={() => setVer(s.version)}>v{s.version}{feedbackOfSubmission(db, s.id) && <Check aria-label="has feedback" />}</button>)}
          <Badge kind={sub.onTime ? 'ok' : 'danger'}>{sub.onTime ? 'on time' : 'LATE'}</Badge><span className="small muted">submitted {fmtDateTime(sub.submittedAt)} · deadline {fmtDateTime(effectiveDeadline(task, item.studentId))}</span>
        </div>
        {isMilestoneUnit(item.unitId) && <Banner kind="info">Group milestone sub-task — role: <b>{task.group!.milestones.find((m) => m.id === unitMilestone(item.unitId))?.assignments[item.studentId]}</b>. After everyone has feedback and the peer cycle is closed, publish the merged artifact from Group &amp; peer.</Banner>}
        <Card title={`Submission v${sub.version}`}>
          <div className="row wrap" style={{ marginBottom: 8 }}>{sub.fileNames.map((f) => <span key={f} className="chip"><Paperclip aria-hidden />{f}</span>)}</div>
          {sub.unticked.length > 0 && <Banner kind="warn">Student left unticked: {sub.unticked.map((id) => task.rubric.find((k) => k.id === id)?.text).join('; ')}</Banner>}
          <p className="small muted" style={{ margin: '8px 0 4px' }}>Select text below to annotate that passage{fb ? ' (annotations shown as highlights)' : ''}.</p>
          <div onMouseUp={captureSel}>{paras.map((p, i) => <div key={i} data-p={i} className="para">{render(p, i)}</div>)}</div>
          {sel && !fb && canGrade && isLatest && (
            <div className="card region" style={{ marginTop: 8 }}>
              <div className="small">Annotating: <mark className="ann">{sel.q}</mark></div>
              <div className="row" style={{ marginTop: 6 }}><input type="text" value={annText} onChange={(e) => setAnnText(e.target.value)} placeholder="Comment on this passage…" autoFocus />
                <button className="btn primary" disabled={!annText.trim()} onClick={() => { setAnns([...anns, { id: newId(), paragraph: sel.p, quote: sel.q, comment: annText, by: db.users[0].id }]); setSel(null); setAnnText(''); }}>Add</button></div>
            </div>
          )}
          {shownAnns.length > 0 && <div className="col" style={{ marginTop: 8, gap: 4 }}>{shownAnns.map((a) => <div key={a.id} className="small"><mark className="ann">{a.quote}</mark> → {a.comment}</div>)}</div>}
        </Card>
        {fb ? (
          <>
            <Card title={`Feedback on v${fb.version} — ${fb.total}% (${fb.decision})`} actions={<Badge kind={fb.decision === 'pass' ? 'ok' : 'dangerweak'}>{fb.decision}</Badge>}>
              <p className="small muted">By {userName(db, fb.byId)} · {fmtDateTime(fb.createdAt)}</p>
              <p><b>Auto-feedback:</b> {fb.autoSummary}</p>
              <Html html={fb.comment} />
              <table className="plain"><tbody>{task.rubric.map((k) => <tr key={k.id}><td>{k.text}</td><td>{fb.scores[k.id]}/{k.max}</td></tr>)}</tbody></table>
            </Card>
            {fb.gradeHistory.length > 0 && <Card title="Grade change history">{fb.gradeHistory.map((h, i) => <div key={i} className="small">{fmtDateTime(h.at)} · {userName(db, h.by)}: {h.from}% → {h.to}% — {h.justification}</div>)}</Card>}
            {canGrade && (
              <Card title="Change grade (logged, needs justification)">
                <div className="row"><input type="number" min={0} max={100} placeholder="New %" style={{ width: 100 }} value={newGrade} onChange={(e) => setNewGrade(e.target.value)} /><input type="text" placeholder="Justification (min 10 characters)" value={why} onChange={(e) => setWhy(e.target.value)} />
                  <button className="btn" disabled={newGrade === ''} onClick={() => { if (cmd.changeGrade(fb.id, Number(newGrade), why).ok) { setNewGrade(''); setWhy(''); } }}>Change</button></div>
              </Card>
            )}
            {status === 'feedback' && <Banner kind="info">Feedback posted — awaiting completion decision.</Banner>}
          </>
        ) : canGrade && isLatest && (status === 'submitted' || status === 'resubmitted') ? (
          <>
            <Card title={`Rubric — ${total}%`} actions={<div className="row"><button className="btn sm" onClick={() => setScores(Object.fromEntries(task.rubric.map((k) => [k.id, k.max])))}>All max</button><button className="btn sm" onClick={() => setScores(Object.fromEntries(task.rubric.map((k) => [k.id, Math.round(k.max * 0.7)])))}>All 70%</button></div>}>
              <table className="plain"><tbody>{task.rubric.map((k) => (
                <tr key={k.id} className={sub.unticked.includes(k.id) ? 'overdue' : ''}><td>{k.text}{sub.unticked.includes(k.id) && <div className="small err">student did not tick this</div>}</td>
                  <td style={{ width: 130 }}><input type="number" min={0} max={k.max} value={scores[k.id]} onChange={(e) => setScores({ ...scores, [k.id]: Math.max(0, Math.min(k.max, Number(e.target.value))) })} style={{ width: 70 }} /> / {k.max}</td></tr>
              ))}</tbody></table>
            </Card>
            <Card title="Instructor comment"><Rte value={comment} onChange={setComment} placeholder="Overall comment…" /></Card>
            <Card title="Decision">
              <div className="row wrap"><label className="row"><input type="radio" checked={decision === 'pass'} onChange={() => setDecision('pass')} /> Pass — complete the quest (XP is granted after this feedback)</label>
                <label className="row"><input type="radio" checked={decision === 'revise'} onChange={() => setDecision('revise')} /> Request revision</label></div>
              <button className="btn primary big" style={{ marginTop: 12 }} onClick={post}>Post feedback for v{sub.version}</button>
            </Card>
          </>
        ) : !canGrade ? <Banner kind="info">Read-only for your role.</Banner> : null}
      </div>
    </Drawer>
  );
}
