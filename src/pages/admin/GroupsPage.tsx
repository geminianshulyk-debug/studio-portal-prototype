import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useCmd, useDb } from '../../store';
import { Badge, Banner, Card, Field, Modal, PageHead, Tabs } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { dateCol, selectCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse, useGridCommit } from './common';
import { contributionFor } from '../../lib/contribution';
import { avgScore } from '../../lib/peer';
import { fmtDateTime, firstName, userName } from '../../lib/selectors';
import type { Milestone, PeerConfig, PeerCycle, Task } from '../../types';

function Slot({ id, role, children, deliverable }: { id: string; role: string; children: React.ReactNode; deliverable: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ border: `2px dashed ${isOver ? 'var(--primary)' : 'var(--line-2)'}`, background: isOver ? 'var(--primary-weak)' : 'var(--surface-2)', borderRadius: 10, padding: 8, minHeight: 74 }}>
      <div className="lbl">{role}</div><div className="small muted" style={{ marginBottom: 4 }}>{deliverable}</div>{children}
    </div>
  );
}
function Chip({ id, name, disabled }: { id: string; name: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  return (
    <span ref={setNodeRef} {...listeners} {...attributes} className="badge" style={{ cursor: disabled ? 'default' : 'grab', padding: '6px 12px', fontSize: 13, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, zIndex: isDragging ? 10 : 1, position: 'relative', boxShadow: isDragging ? 'var(--shadow-lg)' : undefined }}>⠿ {name}</span>
  );
}

export default function GroupsPage() {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const groupTasks = db.tasks.filter((t) => t.courseId === course.id && t.type === 'group' && t.group);
  const [taskId, setTaskId] = useState(groupTasks[0]?.id);
  const [tab, setTab] = useState('roles');
  const task = groupTasks.find((t) => t.id === taskId) ?? groupTasks[0];
  if (!task) return <><PageHead title="Group & peer" sub="No group task in this course yet." /><Banner kind="info">Create a task of type “group” in CA &amp; tasks first.</Banner></>;
  const flagged = db.peerEvals.filter((e) => e.flag?.status === 'pending' && db.peerCycles.find((c) => c.id === e.cycleId)?.taskId === task.id);
  return (
    <>
      <PageHead title="Group tasks & peer evaluation" sub="Decompose a group task into individually owned sub-tasks with rotating roles, set the peer-evaluation cadence, and tune how individual contribution weights the group mark."
        laws={['Hick’s Law — three tabs, one concern each', 'Nielsen — formula preview shows the effect of every change before applying']}
        actions={groupTasks.length > 1 ? <select value={task.id} onChange={(e) => setTaskId(e.target.value)} style={{ width: 'auto' }}>{groupTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select> : <Badge kind="info">{task.title}</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'roles', label: 'Roles & rotation' }, { id: 'peer', label: 'Peer cycles & weighting' }, { id: 'review', label: `Outlier review${flagged.length ? ` (${flagged.length})` : ''}` }]} />
      {tab === 'roles' && <Roles task={task} />}
      {tab === 'peer' && <PeerTab task={task} />}
      {tab === 'review' && <Review taskId={task.id} />}
    </>
  );
  void can; void cmd;
}

function Roles({ task }: { task: Task }) {
  const db = useDb(), cmd = useCmd(), can = useCan();
  const g = task.group!;
  const group = db.groups.find((x) => x.id === g.groupId)!;
  const edit = can('update', 'Task');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const save = (group2: typeof g, label: string) => cmd.updateTask(task.id, { group: group2 } as never, task.rev, label);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !edit) return;
    const [mA, student] = String(e.active.id).split('|');
    const [mB, role] = String(e.over.id).split('|');
    if (mA !== mB) return;
    const m = g.milestones.find((x) => x.id === mA)!;
    const holder = Object.entries(m.assignments).find(([, r]) => r === role)?.[0];
    if (holder === student) return;
    const a = { ...m.assignments };
    if (holder) a[holder] = m.assignments[student];
    a[student] = role;
    save({ ...g, milestones: g.milestones.map((x) => (x.id === mA ? { ...x, assignments: a } : x)) }, `${m.title}: ${firstName(db, student)} → ${role}`);
  };
  const rotate = (mId: string) => {
    const i = g.milestones.findIndex((m) => m.id === mId);
    const prev = g.milestones[i - 1] ?? g.milestones[i];
    const a = Object.fromEntries(group.memberIds.map((s) => [s, g.roles[(g.roles.indexOf(prev.assignments[s]) + 1) % g.roles.length]]));
    save({ ...g, milestones: g.milestones.map((m) => (m.id === mId ? { ...m, assignments: a } : m)) }, `${g.milestones[i].title}: auto-rotated`);
  };
  const msCols: GCol<Milestone>[] = [textCol('title', 'Milestone', { width: 280 }), dateCol('due', 'Due', true, { width: 170 })];
  const roleRows = g.roles.map((r) => ({ id: r, role: r, deliverable: g.roleDeliverables[r] ?? '' }));
  const held = group.memberIds.map((s) => ({ s, roles: g.milestones.map((m) => m.assignments[s]) }));
  return (
    <div className="col">
      <Banner kind="info">Each milestone has one owned sub-task per role. Drag a member chip onto another role slot to swap — every member always holds exactly one role per milestone. “Auto-rotate” shifts everyone one role from the previous milestone.</Banner>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid3">
          {g.milestones.map((m, mi) => (
            <Card key={m.id} title={m.title} actions={edit && mi > 0 && <button className="btn sm" onClick={() => rotate(m.id)}>↻ Auto-rotate</button>}>
              <div className="small muted" style={{ marginBottom: 6 }}>Due {fmtDateTime(m.due)}</div>
              <div className="col" style={{ gap: 8 }}>
                {g.roles.map((r) => {
                  const holders = Object.entries(m.assignments).filter(([, x]) => x === r).map(([s]) => s);
                  return <Slot key={r} id={`${m.id}|${r}`} role={r} deliverable={g.roleDeliverables[r]}>{holders.map((s) => <Chip key={s} id={`${m.id}|${s}`} name={userName(db, s)} disabled={!edit} />)}</Slot>;
                })}
              </div>
            </Card>
          ))}
        </div>
      </DndContext>
      <div className="grid2">
        <Card title="Milestones">
          <EditableGrid label="Milestones" rows={g.milestones as (Milestone & { rev?: number })[]} columns={msCols} readOnly={!edit} reorderable canDelete={() => g.milestones.length > 1}
            onCommit={(rows, meta) => save({ ...g, milestones: rows }, `milestones ${meta.reason}`) as never}
            newRow={(): Milestone => ({ id: newId(), title: 'New milestone', due: new Date(Date.now() + 14 * 864e5).toISOString(), assignments: Object.fromEntries(group.memberIds.map((s, i) => [s, g.roles[i % g.roles.length]])) })} />
        </Card>
        <Card title="What each role owns (sub-task definition)">
          <EditableGrid label="Role deliverables" rows={roleRows} columns={[textCol<typeof roleRows[number]>('role', 'Role', { editable: false, width: 120 }), textCol<typeof roleRows[number]>('deliverable', 'Sub-task owned at every milestone', { width: 360 })]} readOnly={!edit} selectable={false}
            onCommit={(rows, meta) => save({ ...g, roleDeliverables: Object.fromEntries(rows.map((r) => [r.role, r.deliverable])) }, `role deliverables ${meta.reason}`) as never} />
        </Card>
      </div>
      <Card title="Roles held so far (rotation fairness)">
        <table className="plain"><tbody>{held.map((h) => <tr key={h.s}><td><b>{userName(db, h.s)}</b></td>{h.roles.map((r, i) => <td key={i}><span className="chip">{g.milestones[i].title.split(' · ')[0]}: {r}</span></td>)}<td>{new Set(h.roles).size === h.roles.length ? <Badge kind="ok">no repeats</Badge> : <Badge kind="warn">repeats a role</Badge>}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

function PeerTab({ task }: { task: Task }) {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const edit = can('update', 'Course');
  const [draft, setDraft] = useState<PeerConfig>(course.peer);
  const dirty = JSON.stringify(draft) !== JSON.stringify(course.peer);
  const cycles = db.peerCycles.filter((c) => c.taskId === task.id);
  const commitCycles = useGridCommit('peerCycles', task.id);
  const preview = useMemo(() => contributionFor(db, task.id, draft), [db, task.id, draft]);
  const g = task.group!;
  const num = (k: keyof PeerConfig, step = 0.05, min = 0, max = 1) => (
    <input type="number" step={step} min={min} max={max} value={draft[k] as number} disabled={!edit} onChange={(e) => {
      const v = Number(e.target.value);
      setDraft((d) => (k === 'peerWeight' ? { ...d, peerWeight: v, effortWeight: Math.round((1 - v) * 100) / 100 } : k === 'effortWeight' ? { ...d, effortWeight: v, peerWeight: Math.round((1 - v) * 100) / 100 } : { ...d, [k]: v }));
    }} />
  );
  const cols: GCol<PeerCycle>[] = [
    textCol('label', 'Cycle', { width: 210 }), selectCol('milestoneId', 'Milestone', g.milestones.map((m) => m.id), { width: 110 }),
    dateCol('opens', 'Opens', true, { width: 150 }), dateCol('due', 'Due', true, { width: 150 }), selectCol('status', 'Status', ['scheduled', 'open', 'closed'], { width: 110 }),
    { key: 'done', name: 'Submitted', width: 100, renderCell: ({ row }) => <span>{new Set(db.peerEvals.filter((e) => e.cycleId === row.id).map((e) => e.evaluatorId)).size}/{db.groups.find((x) => x.id === g.groupId)!.memberIds.length}</span> },
  ];
  const missing = g.milestones.filter((m) => !cycles.some((c) => c.milestoneId === m.id));
  return (
    <div className="col">
      <Card title="Peer-evaluation cadence" actions={<div className="row">
        <select value={draft.cadence} disabled={!edit} onChange={(e) => setDraft({ ...draft, cadence: e.target.value as PeerConfig['cadence'] })} style={{ width: 'auto' }}><option value="every-milestone">every milestone</option><option value="fortnightly">fortnightly</option><option value="manual">manual</option></select>
        {edit && missing.length > 0 && <button className="btn sm" onClick={() => cmd.saveRows('peerCycles', task.id, [...cycles, ...missing.map((m): PeerCycle => ({ id: newId(), taskId: task.id, milestoneId: m.id, label: `Cycle · after ${m.title.split(' · ')[0]}`, opens: m.due, due: new Date(new Date(m.due).getTime() + 3 * 864e5).toISOString(), status: 'scheduled', rev: 1 }))] as never, { reason: 'add', label: 'Cycles generated from milestones' })}>Generate {missing.length} missing cycle(s)</button>}
      </div>}>
        <EditableGrid label="Peer cycles" rows={cycles} columns={cols} readOnly={!edit} onCommit={commitCycles as never}
          bulk={(sel) => edit && <button className="btn sm" disabled={!sel.some((c) => c.status === 'open')} onClick={() => sel.filter((c) => c.status === 'open').forEach((c) => cmd.closePeerCycle(c.id))}>Close selected open cycle(s) &amp; run outlier check</button>} />
      </Card>
      <Card title="Contribution weighting formula" actions={edit && <div className="row">{dirty && <Badge kind="warn">unsaved</Badge>}<button className="btn sm" disabled={!dirty} onClick={() => setDraft(course.peer)}>Reset</button><button className="btn sm primary" disabled={!dirty} onClick={() => cmd.updateCourse(course.id, { peer: draft } as never, course.rev, 'peer/contribution weighting changed')}>Apply</button></div>}>
        <div className="mono small" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, marginBottom: 10 }}>
          index = {draft.peerWeight} × (peerAvg ÷ cohort peerAvg) + {draft.effortWeight} × (hours ÷ cohort hours)<br />
          multiplier = clamp(1 − {draft.individualShare} + {draft.individualShare} × index, {draft.floor}, {draft.cap})<br />
          individual mark = min(100, groupMark × multiplier)
        </div>
        <div className="grid3">
          <Field label="Peer weight">{num('peerWeight')}</Field><Field label="Effort-log weight" hint="Self-tracking signal, auto-balances with peer weight">{num('effortWeight')}</Field>
          <Field label="Individual share α" hint="How much of the mark is personal">{num('individualShare')}</Field>
          <Field label="Floor multiplier">{num('floor', 0.05, 0.3, 1)}</Field><Field label="Cap multiplier">{num('cap', 0.05, 1, 1.5)}</Field>
          <Field label="Outlier gap (flag if ≥)" hint="Self vs peer rating gap">{num('outlierGap', 0.25, 0.5, 4)}</Field>
        </div>
        <table className="plain" style={{ marginTop: 12 }}>
          <thead><tr><th>Member</th><th>Peer avg</th><th>Hours logged</th><th>Contribution logs</th><th>Index</th><th>×</th><th>Group mark</th><th>Individual mark</th></tr></thead>
          <tbody>{preview.map((m) => (
            <tr key={m.studentId}><td><b>{userName(db, m.studentId)}</b>{m.note && <div className="small muted">{m.note}</div>}</td><td>{m.peerAvg.toFixed(2)}</td><td>{m.hours}</td><td>{m.logs}</td><td>{m.index.toFixed(2)}</td><td>{m.multiplier.toFixed(2)}</td><td>{m.groupMark.toFixed(0)}</td><td><b>{m.individualMark.toFixed(0)}</b></td></tr>
          ))}</tbody>
        </table>
        <p className="small muted" style={{ marginTop: 6 }}>Live preview from real peer scores (flagged scores excluded) and effort logs. Effort logging is optional for students and framed to them as self-tracking.</p>
      </Card>
    </div>
  );
}

function Review({ taskId }: { taskId: string }) {
  const db = useDb(), cmd = useCmd(), can = useCan();
  const [target, setTarget] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const cycleIds = db.peerCycles.filter((c) => c.taskId === taskId).map((c) => c.id);
  const all = db.peerEvals.filter((e) => e.flag && cycleIds.includes(e.cycleId));
  const edit = can('update', 'PeerEval');
  const t = all.find((e) => e.id === target);
  return (
    <div className="col">
      <Banner kind="warn">Flagged scores are <b>excluded from averages</b> until you accept or discard them with a written reason. Both outcomes are audit-logged.</Banner>
      <Card title={`Flagged peer scores (${all.filter((e) => e.flag!.status === 'pending').length} pending)`}>
        {all.length === 0 && <p className="muted">No flagged scores.</p>}
        <table className="plain"><thead><tr><th>Cycle</th><th>Evaluator → evaluatee</th><th>Score</th><th>Why flagged</th><th>Status</th><th /></tr></thead>
          <tbody>{all.map((e) => (
            <tr key={e.id} className={e.flag!.status === 'pending' ? 'overdue' : ''}>
              <td>{db.peerCycles.find((c) => c.id === e.cycleId)?.label}</td>
              <td><b>{userName(db, e.evaluatorId)}</b> → {e.evaluatorId === e.evaluateeId ? <i>self</i> : userName(db, e.evaluateeId)}</td>
              <td>{avgScore(e.scores).toFixed(1)}</td><td className="small">{e.flag!.reason}</td>
              <td>{e.flag!.status === 'pending' ? <Badge kind="danger">pending</Badge> : <Badge kind={e.flag!.status === 'accepted' ? 'ok' : 'gray'}>{e.flag!.status}</Badge>}{e.flag!.justification && <div className="small muted">{e.flag!.justification}</div>}</td>
              <td>{e.flag!.status === 'pending' && edit && <button className="btn sm primary" onClick={() => { setTarget(e.id); setWhy(''); }}>Review</button>}</td>
            </tr>))}</tbody></table>
      </Card>
      {t && (
        <Modal title="Resolve flagged score" onClose={() => setTarget(null)}>
          <p className="small">{userName(db, t.evaluatorId)} → {t.evaluatorId === t.evaluateeId ? 'self' : userName(db, t.evaluateeId)} · <b>{t.flag!.reason}</b></p>
          <Field label="Written justification (required, min 10 characters)"><textarea value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => cmd.resolveFlag(t.id, 'accepted', why).ok && setTarget(null)}>Accept (count in average)</button>
            <button className="btn danger" onClick={() => cmd.resolveFlag(t.id, 'discarded', why).ok && setTarget(null)}>Discard (exclude permanently)</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
