import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { useCmd, useDb, useNow, useStore, useUser } from '../../store';
import { Badge, Banner, Bar, Card, Drawer, Html, Modal, PageHead } from '../../components/ui';
import UppyUploader, { type UploaderApi } from '../../components/UppyUploader';
import { countdown } from '../../lib/time';
import { feedbackOfSubmission, fmtDateTime, submissionsOf, unitsFor, userName, type Unit } from '../../lib/selectors';
import { unitTask } from '../../types';

const ICON: Record<string, string> = { assigned: '📝', submitted: '📤', resubmitted: '📤', feedback: '💬', revision: '🔁', complete: '✅' };
const LABEL: Record<string, string> = { assigned: 'To do', submitted: 'Awaiting feedback', resubmitted: 'Awaiting feedback', feedback: 'Feedback posted', revision: 'Revise & resubmit', complete: 'Complete' };
const CHUNK = 7; // Miller's Law

export default function QuestsPage() {
  const db = useDb(), user = useUser(), courseId = useStore((s) => s.courseId);
  const now = useNow(30000);
  const [view, setView] = useState<'map' | 'board'>('map');
  const [open, setOpen] = useState<string | null>(null);
  const units = useMemo(() => unitsFor(db, user.id, courseId, now), [db, user.id, courseId, now]);
  const cas = db.cas.filter((c) => c.courseId === courseId).sort((a, b) => a.order - b.order);
  const course = db.courses.find((c) => c.id === courseId)!;
  const done = units.filter((u) => u.status === 'complete').length;
  return (
    <>
      <PageHead title={`Quest map — ${course.code}`} sub="Every task is a quest on your path. Unfinished quests stay open until feedback closes the loop."
        laws={['Zeigarnik — progress rings keep unfinished quests visible', 'Von Restorff — overdue quests pulse red', 'Miller — 7 quests per world, then “show more”']}
        actions={<div className="row"><button className={`btn ${view === 'map' ? 'primary' : ''}`} onClick={() => setView('map')}>🗺 Map</button><button className={`btn ${view === 'board' ? 'primary' : ''}`} onClick={() => setView('board')}>▦ Board</button></div>} />
      <Card style={{ marginBottom: 16 }}><div className="row"><b>{done}/{units.length} quests complete</b><div className="grow"><Bar value={units.length ? done / units.length : 0} kind="ok" /></div></div></Card>
      {view === 'map' ? (
        <div>{cas.map((ca) => <World key={ca.id} name={ca.name} weight={ca.weight} units={units.filter((u) => u.task.caId === ca.id)} onOpen={setOpen} now={now} />)}</div>
      ) : <Board units={units} onOpen={setOpen} />}
      {open && <QuestDrawer unitId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function World({ name, weight, units, onOpen, now }: { name: string; weight: number; units: Unit[]; onOpen: (id: string) => void; now: number }) {
  const [more, setMore] = useState(false);
  const shown = more ? units : units.slice(0, CHUNK);
  const done = units.filter((u) => u.status === 'complete').length;
  return (
    <section className="quest-world">
      <h3><span>{name} <span className="muted small">· {weight}% of course</span></span><Badge kind={done === units.length ? 'ok' : 'info'}>{done}/{units.length}</Badge></h3>
      <div className="quest-path">
        {shown.map((u) => {
          const cd = countdown(u.due, now);
          const kind = u.locked ? 'locked' : u.status === 'complete' ? 'done' : u.overdue ? 'overdue' : '';
          return (
            <div key={u.unitId} className={`qnode ${u.status === 'complete' ? 'done' : ''}`}>
              <div className={`orb ${kind}`} style={{ ['--p' as never]: Math.round(u.pct * 100) }} data-ico={u.locked ? '🔒' : ICON[u.status]} aria-hidden />
              <button className={`qcard ${kind}`} style={{ textAlign: 'left', font: 'inherit' }} onClick={() => !u.locked ? onOpen(u.unitId) : toast.info('Locked', { description: 'This milestone opens when the previous milestone’s merged feedback + peer summary is published.' })} aria-label={`${u.title}: ${LABEL[u.status]}`}>
                <div className="row between wrap"><b>{u.title}</b>{u.role && <Badge kind="info">Role: {u.role}</Badge>}</div>
                <div className="row wrap small" style={{ marginTop: 4 }}>
                  <Badge kind={u.status === 'complete' ? 'ok' : u.status === 'revision' ? 'dangerweak' : u.status === 'assigned' ? 'gray' : 'warn'}>{u.locked ? 'Locked' : LABEL[u.status]}</Badge>
                  {u.status !== 'complete' && !u.locked && <span className={u.overdue ? 'err' : cd.urgent ? 'err' : 'muted'}>⏱ {cd.text}</span>}
                  <span className="chip">{u.task.type}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {units.length > CHUNK && <button className="btn sm" onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show ${units.length - CHUNK} more`}</button>}
    </section>
  );
}

const COLS = [
  { id: 'todo', title: 'To do', hint: 'Drop here = nothing; submit to move forward' },
  { id: 'review', title: 'Awaiting feedback', hint: 'Drag a To-do card here to submit' },
  { id: 'revise', title: 'Revise & resubmit', hint: 'Drag here from Awaiting after feedback' },
  { id: 'done', title: 'Complete', hint: 'Reached only after feedback passes' },
];
const colOf = (s: string) => (s === 'assigned' ? 'todo' : s === 'submitted' || s === 'resubmitted' ? 'review' : s === 'complete' ? 'done' : 'revise');
function BCard({ u, onOpen }: { u: Unit; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: u.unitId, disabled: u.locked || u.status === 'complete' });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`bcard ${u.overdue ? 'overdue' : ''}`} style={{ transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined, zIndex: transform ? 20 : undefined }} onDoubleClick={() => !u.locked && onOpen(u.unitId)}>
      <b className="small">{u.title}</b><div className="small muted">{u.locked ? '🔒 locked' : `⏱ ${countdown(u.due).text}`}</div>
      <button className="btn sm" style={{ marginTop: 4 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => !u.locked && onOpen(u.unitId)}>Open</button>
    </div>
  );
}
function BCol({ id, title, hint, children, over }: { id: string; title: string; hint: string; children: React.ReactNode; over?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`bcol ${isOver || over ? 'over' : ''}`}><b>{title}</b><span className="small muted">{hint}</span>{children}</div>;
}
function Board({ units, onOpen }: { units: Unit[]; onOpen: (id: string) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const u = units.find((x) => x.unitId === e.active.id)!;
    const from = colOf(u.status), to = String(e.over.id);
    if (from === to) return;
    if ((from === 'todo' && to === 'review') || (from === 'revise' && to === 'review')) { onOpen(u.unitId); toast.info('Submit to move this quest forward', { description: 'Attach your files in the drawer.' }); return; }
    if (to === 'done') toast.error('Quests can’t be dragged to Complete', { description: 'A quest completes only after a reviewer posts feedback on your latest version — that’s how the loop stays closed.' });
    else toast.error('That move isn’t allowed', { description: 'Status changes come from submitting and from feedback, not from dragging.' });
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onEnd}>
      <div className="board">{COLS.map((c) => <BCol key={c.id} {...c}>{units.filter((u) => colOf(u.status) === c.id).map((u) => <BCard key={u.unitId} u={u} onOpen={onOpen} />)}</BCol>)}</div>
    </DndContext>
  );
}

export function QuestDrawer({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const db = useDb(), user = useUser();
  const now = useNow(15000);
  const u = unitsFor(db, user.id, undefined, now).find((x) => x.unitId === unitId)!;
  const task = u.task;
  const opened = useRef({ at: new Date().toISOString(), rubric: task.rubricVersion });
  const [submitting, setSubmitting] = useState(false);
  const subs = submissionsOf(db, unitId, user.id);
  const cd = countdown(u.due, now);
  const others = db.submissions.filter((s) => s.unitId === unitId && s.studentId !== user.id && s.submittedAt > opened.current.at);
  const rubricChanged = task.rubricVersion !== opened.current.rubric;
  return (
    <Drawer title={u.title} onClose={onClose}>
      <div className="col">
        <div className="row wrap"><Badge kind="info">{db.courses.find((c) => c.id === task.courseId)?.cos.find((c) => c.id === task.coId)?.code}</Badge><Badge>{task.type}</Badge>{u.role && <Badge kind="xp">Your role: {u.role}</Badge>}
          <Badge kind={u.overdue ? 'danger' : cd.urgent ? 'warn' : 'gray'}>⏱ {cd.text} · {fmtDateTime(u.due)}</Badge></div>
        {rubricChanged && <Banner kind="warn">⚠ <b>This was just updated.</b> The instructor changed the rubric while you had this open. Review the criteria below.</Banner>}
        {others.map((s) => <Banner key={s.id} kind="info">ℹ {userName(db, s.studentId)} just uploaded to this milestone (their own sub-task) at {fmtDateTime(s.submittedAt)}. Your upload is separate and nothing of theirs is overwritten.</Banner>)}
        <Card title="Brief"><Html html={task.brief} />{task.tools && <p className="small muted">Tools: {task.tools}</p>}</Card>
        <Card title="Rubric — what good looks like">
          {task.rubric.map((k) => <div key={k.id} className="row between small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}><span>{k.selfCheck ? '☑' : '☐'} {k.text}</span><Badge kind="gray">{k.max} pts</Badge></div>)}
        </Card>
        <Card title={`Submissions & feedback (${subs.length} version${subs.length === 1 ? '' : 's'})`}>
          {subs.length === 0 && <p className="muted small">Nothing submitted yet.</p>}
          {[...subs].reverse().map((s) => {
            const fb = feedbackOfSubmission(db, s.id);
            return (
              <div key={s.id} className="card region" style={{ marginBottom: 8 }}>
                <div className="row between wrap"><b>Version {s.version}</b><span className="small muted">{fmtDateTime(s.submittedAt)} {s.onTime ? '' : '· LATE'}</span></div>
                <div className="row wrap" style={{ margin: '6px 0' }}>{s.fileNames.map((f) => <span className="chip" key={f}>📎 {f}</span>)}</div>
                {fb ? (
                  <div className="banner ok" style={{ flexDirection: 'column' }}>
                    <div className="row between" style={{ width: '100%' }}><b>Feedback on v{s.version}: {fb.total}%</b><Badge kind={fb.decision === 'pass' ? 'ok' : 'dangerweak'}>{fb.decision === 'pass' ? 'passed' : 'revision requested'}</Badge></div>
                    <span className="small">{fb.autoSummary}</span><Html html={fb.comment} />
                    {fb.annotations.map((a) => <span key={a.id} className="small"><mark className="ann">{a.quote}</mark> → {a.comment}</span>)}
                  </div>
                ) : <Banner kind="info">Awaiting feedback on this version…</Banner>}
              </div>
            );
          })}
        </Card>
        {u.locked ? <Banner kind="warn">🔒 Locked until the previous milestone’s feedback and peer summary are published.</Banner>
          : u.status === 'assigned' || u.status === 'revision' ? <button className="btn primary big" onClick={() => setSubmitting(true)}>{u.status === 'revision' ? `↻ Revise & resubmit (v${subs.length + 1})` : '⬆ Submit work'}</button>
          : u.status === 'complete' ? <Banner kind="ok">✅ Complete — feedback received and XP granted.</Banner>
          : <Banner kind="info">⏳ Version {subs.length} is with your reviewer. You can resubmit once feedback is posted.</Banner>}
      </div>
      {submitting && <SubmitDialog unit={u} seenRubric={opened.current.rubric} onClose={() => setSubmitting(false)} />}
    </Drawer>
  );
}

function SubmitDialog({ unit, seenRubric, onClose }: { unit: Unit; seenRubric: number; onClose: () => void }) {
  const cmd = useCmd(), db = useDb();
  const task = db.tasks.find((t) => t.id === unitTask(unit.unitId))!;
  const api = useRef<UploaderApi>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const checks = task.rubric.filter((k) => k.selfCheck);
  const rubricChanged = task.rubricVersion !== seenRubric && !ack;
  useEffect(() => { if (task.rubricVersion !== seenRubric) setTicked([]); }, [task.rubricVersion, seenRubric]);
  const go = async () => {
    setBusy(true);
    try { await api.current!.upload(); } catch { toast.error('Upload failed — your files are kept, try again'); setBusy(false); return; }
    const r = cmd.submitWork({ unitId: unit.unitId, fileNames: files, note, ticked, seenRubricVersion: task.rubricVersion, ackRubric: ack });
    setBusy(false);
    if (r.ok) { toast.success(`Submission received — v${r.value.version}`, { description: 'Timestamped by the server. Your reviewer has been notified.' }); onClose(); }
  };
  return (
    <Modal title={`Submit — ${unit.title}`} onClose={onClose} wide>
      <div className="col">
        {task.rubricVersion !== seenRubric && <Banner kind="warn">⚠ <b>This was just updated.</b> The rubric changed while you were working; the self-check list below reflects the new version. <button className="btn sm" onClick={() => setAck(true)}>I’ve reviewed the changes</button></Banner>}
        <UppyUploader apiRef={api} onChange={setFiles} />
        <label className="lbl">Written documentation (separate paragraphs with a blank line — your reviewer can annotate any passage)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Explain what you did and why…" />
        <Card title={`Self-check before you submit — ${ticked.length}/${checks.length}`}>
          <Bar value={checks.length ? ticked.length / checks.length : 1} thin />
          {checks.map((k) => <label key={k.id} className="row" style={{ padding: '6px 0' }}><input type="checkbox" checked={ticked.includes(k.id)} onChange={(e) => setTicked(e.target.checked ? [...ticked, k.id] : ticked.filter((x) => x !== k.id))} style={{ width: 20, height: 20 }} /> {k.text}</label>)}
          <p className="small muted">Unticked items are shown to your reviewer — you can still submit.</p>
        </Card>
        <button className="btn primary big" disabled={!files.length || busy || rubricChanged} onClick={go}>{busy ? 'Uploading…' : `Submit v${db.submissions.filter((s) => s.unitId === unit.unitId && s.studentId === unit.studentId).length + 1}`}</button>
        {!files.length && <span className="small muted">Add at least one file to enable Submit.</span>}
        {rubricChanged && <span className="small err">Review the rubric update first.</span>}
      </div>
    </Modal>
  );
}
