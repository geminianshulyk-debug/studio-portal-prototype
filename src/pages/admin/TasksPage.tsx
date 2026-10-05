import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCmd, useDb } from '../../store';
import { Badge, Banner, Card, Drawer, Field, Html, Modal, PageHead, Rte } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { boolCol, dateCol, numCol, selectCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse, useGridCommit } from './common';
import type { CA, RubricCriterion, Task } from '../../types';
import { fmtDateTime } from '../../lib/selectors';

import { Pencil } from 'lucide-react';

/** Header for instructor-defined custom fields: pencil icon marks them as editable extras. */
const customLabel = (label: string) => <span className="row" style={{ gap: 4 }}><Pencil size={12} aria-hidden />{label}</span>;

type GRow = Task & { _ca: string; _co: string; [k: string]: unknown };

const newTaskSchema = z.object({
  title: z.string().min(3, 'Give the task a title'),
  caId: z.string().min(1),
  coId: z.string().min(1, 'Tag a course outcome'),
  type: z.enum(['individual', 'group']),
  deadline: z.string().min(1, 'Deadline required').refine((v) => new Date(v).getTime() > Date.now(), 'Deadline must be in the future'),
  criteria: z.coerce.number().int().min(1).max(7, 'Keep rubrics to ≤7 criteria (Miller’s Law)'),
});

export default function TasksPage() {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canEdit = can('update', 'Task');
  const cas = db.cas.filter((c) => c.courseId === course.id).sort((a, b) => a.order - b.order);
  const tasks = db.tasks.filter((t) => t.courseId === course.id).sort((a, b) => (cas.findIndex((c) => c.id === a.caId) - cas.findIndex((c) => c.id === b.caId)) || a.order - b.order);
  const cfDefs = course.customFields.filter((f) => f.appliesTo === 'task');
  const caName = (id: string) => cas.find((c) => c.id === id)?.name ?? '';
  const coCode = (id: string) => course.cos.find((c) => c.id === id)?.code ?? '';

  const toGrid = (t: Task): GRow => ({ ...t, _ca: caName(t.caId), _co: coCode(t.coId), ...Object.fromEntries(cfDefs.map((f) => [`_cf_${f.id}`, t.custom[f.id] ?? ''])) });
  const fromGrid = (g: GRow): Task => {
    const { _ca, _co, ...rest } = g;
    const t = rest as Task;
    const custom = { ...t.custom };
    for (const f of cfDefs) { custom[f.id] = String(g[`_cf_${f.id}`] ?? ''); delete (t as never as Record<string, unknown>)[`_cf_${f.id}`]; }
    return { ...t, caId: cas.find((c) => c.name === _ca)?.id ?? t.caId, coId: course.cos.find((c) => c.code === _co)?.id ?? t.coId, custom };
  };
  const commitTasks = useGridCommit('tasks', course.id);
  const gridRows = useMemo(() => tasks.map(toGrid), [tasks, cas, cfDefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols: GCol<GRow>[] = [
    { key: 'order', name: '#', width: 46, resizable: false, renderCell: ({ row }) => <span className="muted">{row.order}</span> },
    textCol<GRow>('title', 'Task title', { width: 250 }),
    selectCol<GRow>('_ca', 'CA', cas.map((c) => c.name), { width: 190 }),
    selectCol<GRow>('type', 'Type', ['individual', 'group'], { width: 110 }),
    selectCol<GRow>('_co', 'CO tag', course.cos.map((c) => c.code), { width: 120 }),
    dateCol<GRow>('start', 'Start', false, { width: 110 }),
    dateCol<GRow>('deadline', 'Deadline', true, { width: 150 }),
    textCol<GRow>('tools', 'Software / tools', { width: 180 }),
    {
      key: 'rubric', name: 'Rubric (copy/paste me)', width: 170, kind: 'json', editable: true, sortable: false,
      renderEditCell: undefined,
      renderCell: ({ row }) => <span className="chip">{row.rubric.length} criteria · {row.rubric.reduce((a, k) => a + k.max, 0)} pts</span>,
      toText: (r) => JSON.stringify(r.rubric.map(({ text, max, selfCheck }) => ({ text, max, selfCheck }))),
      fromText: (r, text) => {
        try {
          const arr = JSON.parse(text) as Partial<RubricCriterion>[];
          if (!Array.isArray(arr) || !arr.every((k) => typeof k.text === 'string')) return null;
          return { ...r, rubric: arr.map((k, i) => ({ id: `${r.id}-k${i + 1}`, text: k.text!, max: k.max ?? 25, selfCheck: k.selfCheck ?? true })) };
        } catch { return null; }
      },
    },
    ...cfDefs.map((f) => (f.type === 'number' ? numCol<GRow>(`_cf_${f.id}`, customLabel(f.label), { width: 150 }) : textCol<GRow>(`_cf_${f.id}`, customLabel(f.label), { width: 150 }))),
    { key: 'open', name: '', width: 92, sortable: false, resizable: false, renderCell: ({ row }) => <button className="btn sm" onClick={() => setOpen(row.id)}>Details ›</button> },
  ];
  const commitAdapter = (rows: GRow[], meta: never) => commitTasks(rows.map(fromGrid), meta);

  const commitCas = useGridCommit('cas', course.id);
  const caCols: GCol<CA>[] = [
    { key: 'order', name: '#', width: 46, resizable: false, renderCell: ({ row }) => <span className="muted">{row.order}</span> },
    textCol<CA>('name', 'Continuous Assessment component', { width: 300 }),
    numCol<CA>('weight', 'Weight %', { width: 110 }),
    { key: 'n', name: 'Tasks', width: 80, renderCell: ({ row }) => <span>{tasks.filter((t) => t.caId === row.id).length}</span> },
  ];
  const weightSum = cas.reduce((a, c) => a + c.weight, 0);
  const openTask = tasks.find((t) => t.id === open);

  return (
    <>
      <PageHead title={`CA & task builder — ${course.code}`} sub="1–3 CA components per course, each split into as many tasks as you need. Edit like a spreadsheet; open a task for brief, rubric checklist and custom fields."
        laws={['Common Region — brief/rubric/deadline grouped in drawer cards', 'Miller’s Law — rubrics warned past 7 criteria', 'Fitts’s Law — “Add task” is a large, adjacent primary action']}
        actions={canEdit ? <button className="btn primary big" onClick={() => setCreating(true)}>＋ New task (guided)</button> : undefined} />
      {!canEdit && <Banner kind="info">Read-only for your role ({can('grade', 'Submission') ? 'you can grade in the Grading queue' : 'oversight'}).</Banner>}
      <div className="col">
        <Card title="CA components" actions={weightSum === 100 ? <Badge kind="ok">weights = 100%</Badge> : <Badge kind="dangerweak">weights sum to {weightSum}% — should be 100%</Badge>}>
          <EditableGrid label="CA components" rows={cas} columns={caCols} readOnly={!canEdit} reorderable height={Math.min(260, 90 + 35 * cas.length)}
            onCommit={commitCas as never} canDelete={() => cas.length > 1}
            newRow={() => ({ id: newId(), courseId: course.id, name: `CA${cas.length + 1} · New component`, weight: 0, order: cas.length + 1, rev: 1 })}
            hint={cas.length >= 3 ? 'Maximum of 3 CA components reached' : undefined} />
        </Card>
        <Card title="Tasks">
          <EditableGrid label="Tasks" rows={gridRows} columns={cols} readOnly={!canEdit} reorderable height={Math.min(460, 80 + 35 * gridRows.length)}
            onCommit={commitAdapter as never}
            rowClass={(r) => (new Date(r.deadline).getTime() < Date.now() ? 'row-muted' : undefined)}
            newRow={() => toGrid({ id: newId(), courseId: course.id, caId: cas[0].id, title: 'New task', brief: '<p></p>', rubric: [{ id: newId(), text: 'Criterion 1', max: 25, selfCheck: true }], rubricVersion: 1, start: new Date().toISOString().slice(0, 10), deadline: new Date(Date.now() + 14 * 864e5).toISOString(), coId: course.cos[0]?.id ?? '', type: 'individual', tools: '', order: 99, custom: {}, extensions: {}, rev: 1 })} />
        </Card>
      </div>
      {openTask && <TaskDrawer taskId={openTask.id} onClose={() => setOpen(null)} />}
      {creating && <NewTask onClose={() => setCreating(false)} />}
    </>
  );
}

function NewTask({ onClose }: { onClose: () => void }) {
  const course = useCourse(), db = useDb(), cmd = useCmd();
  const cas = db.cas.filter((c) => c.courseId === course.id);
  const f = useForm({ resolver: zodResolver(newTaskSchema), defaultValues: { title: '', caId: cas[0]?.id ?? '', coId: course.cos[0]?.id ?? '', type: 'individual' as const, deadline: '', criteria: 4 } });
  const submit = f.handleSubmit((v) => {
    const tasks = db.tasks.filter((t) => t.courseId === course.id);
    const id = newId();
    const row: Task = {
      id, courseId: course.id, caId: v.caId, title: v.title, brief: '<p>Describe the brief…</p>', rubricVersion: 1, start: new Date().toISOString().slice(0, 10), deadline: new Date(v.deadline).toISOString(), coId: v.coId, type: v.type, tools: '', order: 99, custom: {}, extensions: {}, rev: 1,
      rubric: Array.from({ length: v.criteria }, (_, i) => ({ id: `${id}-k${i + 1}`, text: `Criterion ${i + 1}`, max: Math.round(100 / v.criteria), selfCheck: true })),
    };
    const r = cmd.saveRows('tasks', course.id, [...tasks, row] as never, { reason: 'add', label: 'Task created' });
    if (r.ok) onClose();
  });
  const e = f.formState.errors;
  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit} className="col">
        <Field label="Title"><input type="text" {...f.register('title')} /></Field>{e.title && <span className="err">{e.title.message}</span>}
        <div className="grid2">
          <Field label="CA component"><select {...f.register('caId')}>{cas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="CO tag"><select {...f.register('coId')}>{course.cos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
          <Field label="Type"><select {...f.register('type')}><option value="individual">individual</option><option value="group">group (configure roles later)</option></select></Field>
          <Field label="Deadline"><input type="datetime-local" {...f.register('deadline')} /></Field>
          <Field label="Rubric criteria (1–7)"><input type="number" {...f.register('criteria')} /></Field>
        </div>
        {e.deadline && <span className="err">{e.deadline.message}</span>}{e.criteria && <span className="err">{e.criteria.message}</span>}
        <div className="row"><button className="btn primary big" type="submit">Create task</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const db = useDb(), cmd = useCmd(), can = useCan(), course = useCourse();
  const t = db.tasks.find((x) => x.id === taskId)!;
  const [brief, setBrief] = useState(t.brief);
  const canEdit = can('update', 'Task'), canRubric = can('update', 'Rubric');
  const cfDefs = course.customFields.filter((f) => f.appliesTo === 'task');
  const rubCols: GCol<RubricCriterion>[] = [
    textCol('text', 'Criterion', { width: 300 }), numCol('max', 'Max', { width: 80 }), boolCol('selfCheck', 'Student self-check', { width: 150 }),
  ];
  const save = (patch: Partial<Task>, label: string) => cmd.updateTask(t.id, patch as never, t.rev, label);
  return (
    <Drawer title={t.title} onClose={onClose}>
      <div className="col">
        <div className="row wrap"><Badge>{t.type}</Badge><Badge kind="info">{db.cas.find((c) => c.id === t.caId)?.name}</Badge><Badge kind="gray">rev {t.rev} · rubric v{t.rubricVersion}</Badge></div>
        <Card title="Brief" actions={canEdit && <button className="btn sm primary" onClick={() => save({ brief }, 'brief edited')}>Save brief</button>}>
          {canEdit ? <Rte value={t.brief} onChange={setBrief} /> : <Html html={t.brief} />}
        </Card>
        <Card title="Rubric & self-check checklist" actions={t.rubric.length > 7 ? <Badge kind="warn">&gt;7 criteria — consider chunking</Badge> : <Badge kind="ok">{t.rubric.length} criteria</Badge>}>
          <p className="small muted">Criteria marked self-check appear as tick-boxes the student completes before submitting. Changing the rubric bumps its version so students mid-submission are notified.</p>
          <EditableGrid label="Rubric criteria" rows={t.rubric} columns={rubCols} readOnly={!canRubric} reorderable height={Math.min(300, 90 + 35 * t.rubric.length)}
            onCommit={(rows, meta) => cmd.updateTask(t.id, { rubric: rows } as never, t.rev, `rubric ${meta.reason}`) as never}
            newRow={() => ({ id: newId(), text: 'New criterion', max: 10, selfCheck: true })} />
        </Card>
        <Card title="Deadline, tools & type">
          <div className="grid2">
            <Field label="Deadline"><input type="datetime-local" disabled={!canEdit} defaultValue={new Date(new Date(t.deadline).getTime() - new Date(t.deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onBlur={(e) => e.target.value && save({ deadline: new Date(e.target.value).toISOString() }, 'deadline changed')} /></Field>
            <Field label="Tools / software"><input type="text" disabled={!canEdit} defaultValue={t.tools} onBlur={(e) => e.target.value !== t.tools && save({ tools: e.target.value }, 'tools edited')} /></Field>
          </div>
          {t.type === 'group' && <p className="small muted" style={{ marginTop: 8 }}>Group decomposition (roles, milestones, rotation) lives in <b>Group &amp; peer</b>.</p>}
        </Card>
        {cfDefs.length > 0 && (
          <Card title="Custom fields">
            <div className="grid2">{cfDefs.map((f) => (
              <Field key={f.id} label={f.label}><input type={f.type === 'number' ? 'number' : 'text'} disabled={!canEdit} defaultValue={t.custom[f.id] ?? ''} onBlur={(e) => e.target.value !== (t.custom[f.id] ?? '') && save({ custom: { ...t.custom, [f.id]: e.target.value } }, `custom field “${f.label}”`)} /></Field>
            ))}</div>
          </Card>
        )}
        {Object.keys(t.extensions).length > 0 && (
          <Card title="Deadline extensions (documented)">
            {Object.entries(t.extensions).map(([s, e]) => <div key={s} className="small"><b>{db.users.find((u) => u.id === s)?.name}</b> → {fmtDateTime(e.until)} · {e.reason}</div>)}
          </Card>
        )}
      </div>
    </Drawer>
  );
}
