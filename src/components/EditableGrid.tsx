import { AlertTriangle, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
// Excel-style grid wrapper around react-data-grid (one library across every editable table).
// Satisfies: inline cell editing, tab/arrow nav (RDG), copy/paste (incl. multi-cell TSV paste), fill-handle drag,
// sort + filter on every column, inline row add/delete, drag-to-reorder (dnd-kit), undo/redo, concurrent-edit notice.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DataGrid, SelectColumn, type Column, type SortColumn } from 'react-data-grid';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import 'react-data-grid/lib/styles.css';
import type { GCol } from './gridCols';
import type { Result } from '../store';
import type { SaveMeta } from '../api';

type R = { id: string; rev?: number };
export interface GridProps<T extends R> {
  label: string;
  rows: T[];
  columns: GCol<T>[];
  onCommit: (rows: T[], meta: SaveMeta) => Result<unknown>;
  newRow?: () => T;
  readOnly?: boolean;
  reorderable?: boolean;
  selectable?: boolean;
  height?: number;
  rowClass?: (r: T) => string | undefined;
  toolbar?: ReactNode;
  bulk?: (selected: T[], clear: () => void) => ReactNode;
  canDelete?: (r: T) => boolean;
  hint?: string;
}

const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newId = uid;

function DragCell({ id, disabled }: { id: string; disabled?: boolean }) {
  const d = useDraggable({ id, disabled });
  const dr = useDroppable({ id });
  return (
    <span ref={(n) => { d.setNodeRef(n); dr.setNodeRef(n); }} {...d.listeners} {...d.attributes}
      className={`drag-h ${dr.isOver ? 'over' : ''}`} title={disabled ? 'Clear sort/filter to reorder' : 'Drag to reorder'} aria-label="Drag to reorder row" style={{ opacity: disabled ? 0.3 : 1, cursor: disabled ? 'not-allowed' : 'grab' }}>⠿</span>
  );
}

export default function EditableGrid<T extends R>(p: GridProps<T>) {
  const { rows, columns, readOnly, reorderable } = p;
  const [sort, setSort] = useState<readonly SortColumn[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [conflict, setConflict] = useState<string | null>(null);
  const undo = useRef<{ before: T[]; after: T[] }[]>([]);
  const redo = useRef<{ before: T[]; after: T[] }[]>([]);
  const [, bump] = useState(0);
  const pending = useRef<T[] | null>(null);
  const pasteExtra = useRef<Map<string, Partial<T>> | null>(null);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  // record history once the store has handed the committed rows back to us
  useEffect(() => {
    if (pending.current) { undo.current.push({ before: pending.current, after: rows }); redo.current = []; pending.current = null; bump((x) => x + 1); }
  }, [rows]);

  const commit = useCallback((next: T[], reason: SaveMeta['reason']) => {
    const before = rowsRef.current;
    const res = p.onCommit(next, { reason, label: p.label });
    if (res.ok) { setConflict(null); if (reason !== 'undo' && reason !== 'redo') pending.current = before; }
    else if (res.code === 'conflict') setConflict(res.error);
    return res.ok;
  }, [p]);

  const view = useMemo(() => {
    let v = rows;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      v = v.filter((r) => columns.some((c) => String((c.toText ? c.toText(r) : (r as Record<string, unknown>)[c.key]) ?? '').toLowerCase().includes(q)));
    }
    if (sort.length) {
      const { columnKey, direction } = sort[0];
      const col = columns.find((c) => c.key === columnKey);
      const val = (r: T) => (col?.toText ? col.toText(r) : (r as Record<string, unknown>)[columnKey]) as string | number;
      v = [...v].sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return direction === 'ASC' ? c : -c;
      });
    }
    return v;
  }, [rows, columns, filter, sort]);
  const reorderBlocked = !!filter || sort.length > 0;

  const onSort = (s: SortColumn[]) => setSort(s.slice(-1));

  function onRowsChange(next: T[], data: { indexes: number[] }) {
    if (readOnly) return;
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const i of data.indexes) {
      const nr = { ...next[i] } as T;
      const extra = pasteExtra.current?.get(nr.id);
      map.set(nr.id, extra ? { ...nr, ...extra } : nr);
    }
    if (pasteExtra.current) for (const [id, patch] of pasteExtra.current) if (!data.indexes.some((i) => next[i].id === id)) map.set(id, { ...(map.get(id) as T), ...patch });
    const reason = pasteExtra.current ? 'paste' : 'edit';
    pasteExtra.current = null;
    commit(rows.map((r) => map.get(r.id) ?? r), reason);
  }

  // ---- clipboard: copy active cell; paste TSV across rows/cols from the active cell ----
  const colFor = (key: string) => columns.find((c) => c.key === key);
  function onCellCopy({ row, column }: { row: T; column: { key: string } }, e: ClipboardEvent | React.ClipboardEvent) {
    const c = colFor(column.key);
    const txt = c?.toText ? c.toText(row) : c?.kind === 'json' ? JSON.stringify((row as Record<string, unknown>)[column.key]) : String((row as Record<string, unknown>)[column.key] ?? '');
    (e as ClipboardEvent).clipboardData?.setData('text/plain', txt);
    e.preventDefault();
  }
  function coerce(row: T, key: string, text: string): T | null {
    const c = colFor(key);
    if (!c || c.editable === false) return null;
    if (c.fromText) return c.fromText(row, text);
    const r = { ...row } as Record<string, unknown>;
    if (c.kind === 'number' || c.kind === 'matrix') { const n = Number(text); if (Number.isNaN(n)) return null; r[key] = n; }
    else if (c.kind === 'bool') r[key] = /^(true|1|yes|✓)$/i.test(text.trim());
    else if (c.kind === 'select') { if (!c.options?.includes(text.trim())) return null; r[key] = text.trim(); }
    else if (c.kind === 'json') { try { r[key] = JSON.parse(text); } catch { return null; } }
    else r[key] = text;
    return r as T;
  }
  function onCellPaste({ row, column }: { row: T; column: { key: string } }, e: ClipboardEvent | React.ClipboardEvent): T {
    if (readOnly) return row;
    const text = (e as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const editableCols = columns.filter((c) => c.editable !== false && c.key !== 'select-row');
    const startCol = editableCols.findIndex((c) => c.key === column.key);
    const startRow = view.findIndex((r) => r.id === row.id);
    if (startCol < 0 || startRow < 0) return row;
    const extra = new Map<string, Partial<T>>();
    let target = row;
    lines.forEach((cells, dy) => {
      const vr = view[startRow + dy];
      if (!vr) return;
      let acc: T = vr;
      cells.forEach((cell, dx) => {
        const c = editableCols[startCol + dx];
        if (!c) return;
        const out = coerce(acc, c.key, cell);
        if (out) acc = out;
      });
      if (vr.id === row.id) target = acc; else extra.set(vr.id, acc);
    });
    pasteExtra.current = extra;
    return target;
  }
  function onFill({ columnKey, sourceRow, targetRow }: { columnKey: string; sourceRow: T; targetRow: T }): T {
    if (readOnly) return targetRow;
    const c = colFor(columnKey);
    if (!c || c.editable === false) return targetRow;
    return { ...targetRow, [columnKey]: (sourceRow as Record<string, unknown>)[columnKey] } as T;
  }

  // ---- undo / redo (every undo is itself committed + audit-logged; stale history is refused) ----
  function stepHistory(dir: 'undo' | 'redo') {
    const from = dir === 'undo' ? undo.current : redo.current;
    const entry = from.at(-1);
    if (!entry) return;
    const expect = dir === 'undo' ? entry.after : entry.before;
    const cur = rowsRef.current;
    const same = cur.length === expect.length && cur.every((r, i) => r.id === expect[i].id && r.rev === expect[i].rev) ||
      JSON.stringify(cur.map((r) => [r.id, r.rev])) === JSON.stringify(expect.map((r) => [r.id, r.rev]));
    if (!same) { setConflict('This grid was just updated elsewhere, so undo/redo history was cleared to avoid overwriting newer work.'); undo.current = []; redo.current = []; bump((x) => x + 1); return; }
    const target = dir === 'undo' ? entry.before : entry.after;
    const curMap = new Map(cur.map((r) => [r.id, r]));
    const rebased = target.map((r) => ({ ...r, rev: curMap.get(r.id)?.rev ?? r.rev })) as T[];
    const ok = commit(rebased, dir);
    if (ok) {
      from.pop();
      (dir === 'undo' ? redo : undo).current.push(entry);
      pending.current = null;
      bump((x) => x + 1);
    }
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const inEditor = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT';
    if (inEditor) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); stepHistory('undo'); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); stepHistory('redo'); }
  }

  // ---- add / delete / duplicate ----
  const add = () => { if (p.newRow) commit([...rows, p.newRow()], 'add'); };
  const delSel = () => {
    const del = rows.filter((r) => selected.has(r.id) && (p.canDelete?.(r) ?? true));
    if (!del.length) return;
    if (commit(rows.filter((r) => !del.some((d) => d.id === r.id)), 'delete')) setSelected(new Set());
  };
  const dup = () => {
    const copies = rows.filter((r) => selected.has(r.id)).map((r) => ({ ...JSON.parse(JSON.stringify(r)), id: uid(), rev: 1 }) as T);
    if (copies.length) commit([...rows, ...copies], 'add');
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id || readOnly) return;
    const from = rows.findIndex((r) => r.id === e.active.id), to = rows.findIndex((r) => r.id === e.over!.id);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    commit(next, 'reorder');
  }

  const cols = useMemo(() => {
    const out: Column<T>[] = [];
    if (p.selectable ?? !readOnly) out.push({ ...SelectColumn, key: 'select-row' } as Column<T>);
    if (reorderable && !readOnly) out.push({ key: 'drag', name: '', width: 34, resizable: false, sortable: false, renderCell: ({ row }) => <DragCell id={row.id} disabled={reorderBlocked} /> });
    for (const c of columns) out.push(readOnly ? { ...c, editable: false, renderEditCell: undefined } : c);
    if (!readOnly && p.newRow) out.push({ key: 'x', name: '', width: 38, resizable: false, sortable: false, renderCell: ({ row }) => (
      <button className="btn sm ghost" aria-label="Delete row" title="Delete row" disabled={p.canDelete ? !p.canDelete(row) : false}
        onClick={() => commit(rows.filter((r) => r.id !== row.id), 'delete')}><X /></button>
    ) });
    return out;
  }, [columns, readOnly, reorderable, reorderBlocked, rows, p.newRow, p.canDelete]); // eslint-disable-line react-hooks/exhaustive-deps

  const selRows = rows.filter((r) => selected.has(r.id));
  const h = p.height ?? Math.min(440, 42 + 35 * Math.max(3, view.length + 1));
  return (
    <div className="gridwrap" onKeyDownCapture={onKeyDown}>
      <div className="gridbar">
        {!readOnly && p.newRow && <button className="btn sm" onClick={add}><Plus /> Add row</button>}
        {!readOnly && <>
          <button className="btn sm" onClick={() => stepHistory('undo')} disabled={!undo.current.length} title="Undo (Ctrl+Z)"><Undo2 /> Undo</button>
          <button className="btn sm" onClick={() => stepHistory('redo')} disabled={!redo.current.length} title="Redo (Ctrl+Y)"><Redo2 /> Redo</button>
        </>}
        {!readOnly && p.newRow && <>
          <button className="btn sm" onClick={dup} disabled={!selRows.length}>⧉ Duplicate</button>
          <button className="btn sm" onClick={delSel} disabled={!selRows.length}><Trash2 /> Delete selected{selRows.length ? ` (${selRows.length})` : ''}</button>
        </>}
        {p.bulk?.(selRows, () => setSelected(new Set()))}
        {p.toolbar}
        <span className="grow" />
        <input type="search" placeholder="Filter rows…" aria-label={`Filter ${p.label}`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {conflict && (
        <div className="banner warn" role="alert" style={{ borderRadius: 0 }}>
          <span className="inl"><AlertTriangle className="ico-svg" aria-hidden /><span><b>This was just updated.</b> {conflict}</span></span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setConflict(null)}>Got it</button>
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ height: h }}>
          <DataGrid
            aria-label={p.label}
            className="rdg-light"
            columns={cols}
            rows={view}
            rowKeyGetter={(r) => r.id}
            onRowsChange={onRowsChange}
            sortColumns={sort}
            onSortColumnsChange={onSort}
            selectedRows={selected}
            onSelectedRowsChange={setSelected}
            onCellCopy={onCellCopy as never}
            onCellPaste={onCellPaste as never}
            onFill={onFill as never}
            defaultColumnOptions={{ resizable: true, sortable: true }}
            rowClass={(r) => p.rowClass?.(r)}
            rowHeight={34}
            headerRowHeight={34}
          />
        </div>
      </DndContext>
      <div className="gridfoot">
        <span>{view.length}{view.length !== rows.length ? ` of ${rows.length}` : ''} rows{readOnly ? ' · read-only for your role' : ''}</span>
        <span>{p.hint ?? (readOnly ? '' : 'Click a cell & type · Tab/arrows move · Ctrl+C / Ctrl+V (multi-cell paste) · drag the fill handle · Ctrl+Z undo')}</span>
      </div>
    </div>
  );
}
