import { useMemo, useState } from 'react';
import { useCmd, useDb } from '../../store';
import { Banner, Card, PageHead } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { boolCol, dateCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse } from './common';
import type { Competition } from '../../types';

export default function CompetitionsAdmin() {
  const db = useDb(), cmd = useCmd(), can = useCan(), course = useCourse();
  const [filter, setFilter] = useState<'all' | string>('all');
  const [showArchived, setShowArchived] = useState(true);
  const [tagCo, setTagCo] = useState('');
  const edit = can('update', 'Competition');
  const allCos = db.courses.flatMap((c) => c.cos.map((co) => co.code));
  const visible = useMemo(() => db.competitions.filter((c) => (showArchived || !c.archived) && (filter === 'all' || c.coCodes.includes(`${filter}-`))), [db.competitions, filter, showArchived]);
  const hidden = db.competitions.filter((c) => !visible.some((v) => v.id === c.id));
  const cols: GCol<Competition>[] = [
    textCol('name', 'Competition', { width: 260 }), textCol('organizer', 'Organizer', { width: 180 }),
    textCol('coCodes', 'Mapped COs (comma-separated)', { width: 220 }), textCol('tags', 'Tags', { width: 150 }),
    textCol('eligibility', 'Eligibility', { width: 200 }), dateCol('deadline', 'Deadline', false, { width: 110 }),
    textCol('prize', 'Prize', { width: 180 }), textCol('link', 'Official link', { width: 200 }), boolCol('archived', 'Archived'),
  ];
  return (
    <>
      <PageHead title="Competitions CMS" sub="One global list. Map each entry to COs; students see only competitions tied to courses they are enrolled in. All entries below are sample data."
        laws={['Miller’s Law — filter chips chunk the list by course', 'Spreadsheet-grade: add ten rows in one sitting, bulk-tag, undo']} />
      <div className="col">
        <div className="row wrap">
          <span className="lbl">Course filter</span>
          <button className={`btn sm ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
          {db.courses.map((c) => <button key={c.id} className={`btn sm ${filter === c.code ? 'on' : ''}`} onClick={() => setFilter(c.code)}>{c.code}</button>)}
          <label className="row small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> show archived</label>
        </div>
        <Card>
          <EditableGrid label="Competitions" rows={visible} columns={cols} readOnly={!edit} reorderable={false}
            onCommit={(rows, meta) => cmd.saveRows('competitions', '', [...hidden, ...rows] as never, meta) as never}
            rowClass={(r) => (r.archived ? 'row-muted' : new Date(r.deadline).getTime() < Date.now() ? 'row-warn' : undefined)}
            newRow={(): Competition => ({ id: newId(), name: 'New competition', organizer: '', coCodes: filter === 'all' ? course.cos[0]?.code ?? '' : `${filter}-CO1`, tags: '', eligibility: '', deadline: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), prize: '', link: 'https://', archived: false, rev: 1 })}
            bulk={(sel, clear) => edit && (
              <>
                <select value={tagCo} onChange={(e) => setTagCo(e.target.value)} style={{ width: 'auto', minHeight: 30, padding: '2px 8px' }} aria-label="CO to tag"><option value="">Bulk-tag with CO…</option>{allCos.map((c) => <option key={c}>{c}</option>)}</select>
                <button className="btn sm" disabled={!sel.length || !tagCo} onClick={() => cmd.bulkTagCompetitions(sel.map((s) => s.id), tagCo).ok && clear()}>Tag {sel.length || ''} selected</button>
                <button className="btn sm" disabled={!sel.length} onClick={() => cmd.saveRows('competitions', '', db.competitions.map((c) => (sel.some((s) => s.id === c.id) ? { ...c, archived: true } : c)) as never, { reason: 'bulk', label: 'Competitions archived' }).ok && clear()}>Archive selected</button>
              </>)} />
        </Card>
        <Banner kind="info">Rows past their deadline are tinted; archived entries are struck through and hidden from students. Deadlines feed the student reminder system.</Banner>
      </div>
    </>
  );
}
