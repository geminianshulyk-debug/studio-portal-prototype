import { useCmd } from '../../store';
import { Card, PageHead } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse } from './common';
import type { Resource } from '../../types';

export default function ResourcesPage() {
  const course = useCourse(), cmd = useCmd(), can = useCan();
  const ro = !can('update', 'Resource');
  const cols = (detail: string): GCol<Resource>[] => [
    textCol('title', 'Title', { width: 300 }), textCol('detail', detail, { width: 220 }), textCol('link', 'Link', { width: 280 }),
  ];
  const section = (kind: Resource['kind'], title: string, detail: string) => {
    const rows = course.resources.filter((r) => r.kind === kind);
    const others = course.resources.filter((r) => r.kind !== kind);
    return (
      <Card title={title}>
        <EditableGrid label={title} rows={rows} columns={cols(detail)} readOnly={ro} reorderable
          onCommit={(next, meta) => cmd.saveRows('resources', course.id, [...others, ...next] as never, meta) as never}
          newRow={(): Resource => ({ id: newId(), kind, title: 'New item', detail: '', link: 'https://', rev: 1 })} />
      </Card>
    );
  };
  return (
    <>
      <PageHead title={`Resources — ${course.code}`} sub="External reading list and software list, edited inline." laws={['Common Region — one card per list']} />
      <div className="col">{section('reading', 'Reading list', 'Author / source')}{section('software', 'Software list', 'Licence / access')}</div>
    </>
  );
}
