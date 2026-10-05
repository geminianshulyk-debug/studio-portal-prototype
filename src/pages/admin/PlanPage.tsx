import { useEffect, useMemo, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import 'frappe-gantt-css';
import { useCmd, useDb } from '../../store';
import { Banner, Card, PageHead } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { dateCol, numCol, selectCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse, useGridCommit } from './common';
import type { PlanItem } from '../../types';

const ymd = (iso: string) => iso.slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Instruction plan builder. Tasks, CAs and group milestones plot automatically from their deadlines; bars are draggable. */
export default function PlanPage() {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const host = useRef<HTMLDivElement>(null);
  const gantt = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [mode, setMode] = useState('Week');
  const canEdit = can('update', 'Plan');
  const cas = db.cas.filter((c) => c.courseId === course.id).sort((a, b) => a.order - b.order);
  const tasks = db.tasks.filter((t) => t.courseId === course.id);
  const commitPlan = useGridCommit('plan', course.id);

  const items = useMemo(() => {
    const out: { id: string; name: string; start: string; end: string; progress: number; custom_class: string }[] = [];
    for (const p of course.plan) out.push({ id: `plan:${p.id}`, name: `Wk ${p.week} · ${p.topic}`, start: p.start, end: p.end, progress: 0, custom_class: p.kind === 'review' ? 'review' : 'plan' });
    for (const t of tasks) {
      const caIdx = cas.findIndex((c) => c.id === t.caId) + 1;
      const units = db.users.filter((u) => u.role === 'student' && u.courseIds.includes(course.id));
      const done = units.filter((u) => t.type === 'individual' ? db.progress.some((p) => p.key === `${t.id}:${u.id}` && p.status === 'complete') : false).length;
      const dl = ymd(t.deadline);
      const start = ymd(t.start) < dl ? ymd(t.start) : addDays(dl, -1);
      out.push({ id: `task:${t.id}`, name: `CA${caIdx} · ${t.title}`, start, end: dl, progress: t.type === 'individual' && units.length ? Math.round((done / units.length) * 100) : 0, custom_class: `ca${caIdx}` });
      if (t.group) {
        let prev = start;
        for (const m of t.group.milestones) {
          const due = ymd(m.due);
          out.push({ id: `ms:${t.id}:${m.id}`, name: `   ↳ ${m.title}`, start: prev < due ? prev : addDays(due, -1), end: due, progress: 0, custom_class: `ca${caIdx}` });
          prev = due;
        }
      }
    }
    return out;
  }, [course, tasks, cas, db.progress, db.users]);

  const handlers = useRef({ onDate: (_id: string, _s: Date, _e: Date) => {} });
  handlers.current.onDate = (id, start, end) => {
    if (!canEdit) return;
    const s = ymd(new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString());
    const endIncl = new Date(end.getTime() - 1000);
    const e = ymd(new Date(endIncl.getTime() - endIncl.getTimezoneOffset() * 60000).toISOString());
    const [kind, a, b] = id.split(':');
    if (kind === 'plan') {
      cmd.saveRows('plan', course.id, course.plan.map((p) => (p.id === a ? { ...p, start: s, end: e } : p)) as never, { reason: 'edit', label: 'Plan rescheduled by drag' });
    } else if (kind === 'task') {
      const t = tasks.find((x) => x.id === a)!;
      const dl = new Date(t.deadline); const nd = new Date(e + 'T00:00:00'); nd.setHours(dl.getHours(), dl.getMinutes(), 0, 0);
      cmd.updateTask(a, { start: s, deadline: nd.toISOString() } as never, t.rev, 'rescheduled by drag (Gantt)');
    } else if (kind === 'ms') {
      const t = tasks.find((x) => x.id === a)!;
      const g = t.group!;
      const m = g.milestones.find((x) => x.id === b)!;
      const nd = new Date(e + 'T00:00:00'); const od = new Date(m.due); nd.setHours(od.getHours(), 0, 0, 0);
      cmd.updateTask(a, { group: { ...g, milestones: g.milestones.map((x) => (x.id === b ? { ...x, due: nd.toISOString() } : x)) } } as never, t.rev, `${m.title} due date dragged (Gantt)`);
    }
  };

  useEffect(() => {
    if (!host.current) return;
    if (!gantt.current) {
      host.current.innerHTML = '';
      gantt.current = new Gantt(host.current, items, {
        view_mode: mode, readonly: !canEdit, readonly_progress: true, bar_height: 22, padding: 14, today_button: true, scroll_to: 'today',
        popup_on: 'hover',
        on_date_change: (t: { id: string }, s: Date, e: Date) => handlers.current.onDate(t.id, s, e),
      });
    } else {
      gantt.current.refresh(items);
    }
  }, [items, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { gantt.current?.change_view_mode(mode); }, [mode]);

  const cols: GCol<PlanItem>[] = [
    numCol('week', 'Wk', { width: 60 }),
    textCol('topic', 'Instruction plan topic', { width: 280 }),
    selectCol('kind', 'Type', ['lecture', 'studio', 'review', 'break'], { width: 110 }),
    dateCol('start', 'Start', false, { width: 120 }),
    dateCol('end', 'End', false, { width: 120 }),
  ];
  return (
    <>
      <PageHead title={`Instruction plan & Gantt — ${course.code}`} sub="Lay out the semester. Tasks, CAs and group milestones plot from their deadlines; drag a bar to reschedule, or drag plan rows to reorder."
        laws={['Fitts’s Law — bars are large drag targets', 'Nielsen — every drag is confirmed and audit-logged']}
        actions={<select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Timeline scale" style={{ width: 'auto' }}>{['Day', 'Week', 'Month'].map((m) => <option key={m}>{m}</option>)}</select>} />
      {!canEdit && <Banner kind="info">Read-only oversight — bars cannot be dragged.</Banner>}
      <div className="col">
        <div className="row wrap small">
          {['ca1', 'ca2', 'ca3'].map((c, i) => <span key={c} className="row" style={{ gap: 4 }}><i className="legend-dot" style={{ background: ['#e8452c', '#1f3fbf', '#3e6b48'][i] }} />CA{i + 1} tasks</span>)}
          <span className="row" style={{ gap: 4 }}><i className="legend-dot" style={{ background: '#b8b09f' }} />Instruction plan</span>
          <span className="row" style={{ gap: 4 }}><i className="legend-dot" style={{ background: '#d9a21b' }} />Reviews</span>
        </div>
        <div className="gantt-host"><div ref={host} /></div>
        <Card title="Instruction plan (ordered rows)">
          <EditableGrid label="Instruction plan" rows={course.plan} columns={cols} readOnly={!canEdit} reorderable onCommit={commitPlan as never}
            newRow={(): PlanItem => ({ id: newId(), week: course.plan.length + 1, topic: 'New session', kind: 'lecture', start: new Date().toISOString().slice(0, 10), end: addDays(new Date().toISOString().slice(0, 10), 5), rev: 1 })} />
        </Card>
      </div>
    </>
  );
}
