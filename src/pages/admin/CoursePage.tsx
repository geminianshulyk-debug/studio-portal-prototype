import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCmd, useDb } from '../../store';
import { Banner, Card, Field, PageHead, Tabs, Badge } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { matrixCol, selectCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse, useGridCommit } from './common';
import type { CO, CustomFieldDef } from '../../types';

const schema = z.object({
  code: z.string().min(3, 'Course code is required'),
  title: z.string().min(5, 'Title needs at least 5 characters'),
  semester: z.string().min(2),
  syllabus: z.string().min(20, 'Add at least a short unit-wise syllabus'),
  objectives: z.string().min(5, 'Add at least one objective (one per line)'),
});
type FormVals = z.infer<typeof schema>;

export default function CoursePage() {
  const course = useCourse();
  const db = useDb();
  const cmd = useCmd();
  const can = useCan();
  const [tab, setTab] = useState('basics');
  const canEdit = can('update', 'Course');
  const form = useForm<FormVals>({ resolver: zodResolver(schema), defaultValues: toForm() });
  function toForm(): FormVals { return { code: course.code, title: course.title, semester: course.semester, syllabus: course.syllabus, objectives: course.objectives.join('\n') }; }
  // reset when course (or a concurrent edit → new rev) changes
  useEffect(() => { form.reset(toForm()); }, [course.id, course.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = form.handleSubmit((v) => {
    cmd.updateCourse(course.id, { ...v, objectives: v.objectives.split('\n').map((s) => s.trim()).filter(Boolean) }, course.rev, 'basics edited');
  });

  const commitCos = useGridCommit('cos', course.id);
  const commitCf = useGridCommit('customFields', course.id);
  const cols: GCol<CO>[] = useMemo(() => [
    textCol<CO>('code', 'CO', { width: 110, frozen: true }),
    textCol<CO>('text', 'Course outcome statement', { width: 320, frozen: false }),
    ...db.outcomes.map((o) => matrixCol<CO>(o.key, o.key, (r) => r.map[o.key] ?? 0, (r, v) => ({ ...r, map: { ...r.map, [o.key]: v as 0 | 1 | 2 | 3 } }))),
  ], [db.outcomes]);
  const cfCols: GCol<CustomFieldDef>[] = [
    textCol('label', 'Field label', { width: 240 }),
    selectCol('appliesTo', 'Applies to', ['task', 'project'], { width: 130 }),
    selectCol('type', 'Type', ['text', 'number'], { width: 120 }),
  ];
  const coverage = db.outcomes.map((o) => ({ ...o, n: course.cos.filter((c) => (c.map[o.key] ?? 0) > 0).length }));
  const gaps = coverage.filter((c) => c.n === 0);

  return (
    <>
      <PageHead title={`Course setup — ${course.code}`} sub="Syllabus, objectives, outcomes and the CO → PO/PSO mapping matrix. Everything is editable in place."
        laws={['Hick’s Law — tabs disclose one config area at a time', 'Common Region — bounded cards per concern']} />
      {!canEdit && <Banner kind="info">You have read-only oversight access to this course (your role cannot edit content).</Banner>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'basics', label: 'Basics & syllabus' }, { id: 'outcomes', label: 'Outcomes & mapping matrix' }, { id: 'custom', label: 'Custom fields' }]} />
      {tab === 'basics' && (
        <form onSubmit={save} className="grid2" aria-label="Course basics">
          <Card title="Identity">
            <div className="col">
              <Field label="Code"><input type="text" disabled={!canEdit} {...form.register('code')} /></Field>
              {form.formState.errors.code && <span className="err">{form.formState.errors.code.message}</span>}
              <Field label="Title"><input type="text" disabled={!canEdit} {...form.register('title')} /></Field>
              {form.formState.errors.title && <span className="err">{form.formState.errors.title.message}</span>}
              <Field label="Semester"><input type="text" disabled={!canEdit} {...form.register('semester')} /></Field>
            </div>
          </Card>
          <Card title="Objectives (one per line)">
            <textarea rows={6} disabled={!canEdit} {...form.register('objectives')} />
            {form.formState.errors.objectives && <span className="err">{form.formState.errors.objectives.message}</span>}
          </Card>
          <Card title="Syllabus" className="region" style={{ gridColumn: '1 / -1' }}>
            <textarea rows={7} disabled={!canEdit} {...form.register('syllabus')} />
            {form.formState.errors.syllabus && <span className="err">{form.formState.errors.syllabus.message}</span>}
          </Card>
          {canEdit && <div className="row"><button className="btn primary big" type="submit">Save course basics</button><span className="small muted">Saves are versioned (rev {course.rev}) and logged in the audit trail.</span></div>}
        </form>
      )}
      {tab === 'outcomes' && (
        <div className="col">
          <Banner kind="info">Click a cell (or press Enter) to cycle correlation <b>· → 1 → 2 → 3</b>. Select cells and Ctrl+C / Ctrl+V to copy a mapping pattern between rows (or paste a column of values from Excel). Undo with Ctrl+Z.</Banner>
          <EditableGrid label="CO mapping matrix" rows={course.cos} columns={cols} readOnly={!canEdit} reorderable height={Math.min(420, 80 + 35 * course.cos.length)}
            onCommit={commitCos as never}
            newRow={() => ({ id: newId(), code: `${course.code}-CO${course.cos.length + 1}`, text: 'New course outcome', map: {}, rev: 1 })}
            hint="1 = low, 2 = medium, 3 = high correlation · feeds PO/PSO attainment analytics" />
          <Card title="Outcome coverage" actions={gaps.length ? <Badge kind="dangerweak">{gaps.length} uncovered</Badge> : <Badge kind="ok">all covered</Badge>}>
            <div className="row wrap">
              {coverage.map((o) => <span key={o.key} className={`badge ${o.n ? 'info' : 'dangerweak'}`} title={o.title}>{o.key}: {o.n} CO</span>)}
            </div>
            <details style={{ marginTop: 8 }}><summary className="small" style={{ cursor: 'pointer' }}>Show outcome titles</summary>
              <div className="grid3 small" style={{ marginTop: 6 }}>{db.outcomes.map((o) => <div key={o.key}><b>{o.key}</b> {o.title}</div>)}</div>
            </details>
          </Card>
        </div>
      )}
      {tab === 'custom' && (
        <div className="col">
          <Banner kind="info">Add your own metadata fields to tasks or projects (e.g. “Material used”). They appear as new columns in the task grid and on project cards — no code change.</Banner>
          <EditableGrid label="Custom fields" rows={course.customFields} columns={cfCols} readOnly={!canEdit} onCommit={commitCf as never}
            newRow={(): CustomFieldDef => ({ id: newId(), label: 'New field', appliesTo: 'task', type: 'text' })} />
        </div>
      )}
    </>
  );
}
