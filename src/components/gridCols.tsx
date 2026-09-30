import { useEffect, useRef } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import { renderTextEditor } from 'react-data-grid';

export type Kind = 'text' | 'number' | 'select' | 'bool' | 'date' | 'datetime' | 'json' | 'matrix';
export type GCol<T> = Column<T> & { kind?: Kind; options?: string[]; toText?: (row: T) => string; fromText?: (row: T, text: string) => T | null };

const base = { resizable: true, sortable: true } as const;

export function textCol<T>(key: keyof T & string, name: string, o: Partial<GCol<T>> = {}): GCol<T> {
  return { key, name, kind: 'text', renderEditCell: renderTextEditor, editable: true, ...base, ...o };
}
export function numCol<T>(key: keyof T & string, name: string, o: Partial<GCol<T>> = {}): GCol<T> {
  function Ed({ row, column, onRowChange, onClose }: RenderEditCellProps<T>) {
    return (
      <input type="number" autoFocus style={{ width: '100%', height: '100%', border: 0, padding: '0 8px' }}
        value={String((row as Record<string, unknown>)[column.key] ?? '')}
        onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
        onBlur={() => onClose(true, false)} />
    );
  }
  return { key, name, kind: 'number', renderEditCell: Ed, editable: true, ...base, ...o };
}
export function selectCol<T>(key: keyof T & string, name: string, options: string[], o: Partial<GCol<T>> = {}): GCol<T> {
  function Ed({ row, column, onRowChange }: RenderEditCellProps<T>) {
    const ref = useRef<HTMLSelectElement>(null);
    useEffect(() => ref.current?.focus(), []);
    return (
      <select ref={ref} style={{ width: '100%', height: '100%', border: 0 }} value={String((row as Record<string, unknown>)[column.key])}
        onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value }, true)}>
        {options.map((x) => <option key={x}>{x}</option>)}
      </select>
    );
  }
  return { key, name, kind: 'select', options, renderEditCell: Ed, editable: true, ...base, ...o };
}
export function boolCol<T>(key: keyof T & string, name: string, o: Partial<GCol<T>> = {}): GCol<T> {
  return {
    key, name, kind: 'bool', ...base, width: 90,
    renderCell: ({ row, onRowChange }) => (
      <input type="checkbox" aria-label={name} checked={!!(row as Record<string, unknown>)[key]} onChange={(e) => onRowChange({ ...row, [key]: e.target.checked })} />
    ),
    ...o,
  };
}
export function dateCol<T>(key: keyof T & string, name: string, time = false, o: Partial<GCol<T>> = {}): GCol<T> {
  const toIn = (v: string) => (time ? (v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '') : (v ?? '').slice(0, 10));
  function Ed({ row, column, onRowChange, onClose }: RenderEditCellProps<T>) {
    return (
      <input type={time ? 'datetime-local' : 'date'} autoFocus style={{ width: '100%', height: '100%', border: 0, padding: '0 6px' }}
        value={toIn(String((row as Record<string, unknown>)[column.key] ?? ''))}
        onChange={(e) => e.target.value && onRowChange({ ...row, [column.key]: time ? new Date(e.target.value).toISOString() : e.target.value })}
        onBlur={() => onClose(true, false)} />
    );
  }
  return {
    key, name, kind: time ? 'datetime' : 'date', renderEditCell: Ed, editable: true, ...base,
    renderCell: ({ row }) => {
      const v = String((row as Record<string, unknown>)[key] ?? '');
      return <span>{v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—'}</span>;
    },
    toText: (r) => String((r as Record<string, unknown>)[key] ?? ''),
    ...o,
  };
}
/** CO × PO/PSO matrix cell: click or press Enter to cycle 0→1→2→3→0. */
export function matrixCol<T>(key: string, name: string, get: (r: T) => number, set: (r: T, v: number) => T, o: Partial<GCol<T>> = {}): GCol<T> {
  const cycle = (v: number) => (v + 1) % 4;
  function Ed({ row, onRowChange }: RenderEditCellProps<T>) {
    useEffect(() => { onRowChange(set(row, cycle(get(row))), true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }
  return {
    key, name, kind: 'matrix', width: 62, minWidth: 54, resizable: false, sortable: true, editable: true, renderEditCell: Ed,
    renderCell: ({ row, onRowChange }) => {
      const v = get(row);
      return (
        <button className={`mx l${v}`} tabIndex={-1} aria-label={`${name}: level ${v}. Click to change`} onClick={() => onRowChange(set(row, cycle(v)))}>{v || '·'}</button>
      );
    },
    toText: (r) => String(get(r)),
    fromText: (r, t) => { const n = Number(t); return n >= 0 && n <= 3 && Number.isInteger(n) ? set(r, n) : null; },
    ...o,
  };
}
