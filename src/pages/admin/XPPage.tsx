import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import { useCmd, useDb } from '../../store';
import { Badge, Banner, Card, Field, Modal, PageHead, Tabs , SortMark } from '../../components/ui';
import EditableGrid, { newId } from '../../components/EditableGrid';
import { boolCol, numCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useGridCommit } from './common';
import { evaluateXp, validateConditions, type XpAward } from '../../lib/rules';
import { fmtDateTime, rankFor, userName, xpTotal } from '../../lib/selectors';
import type { Rank, XPEvent, XPRule } from '../../types';

const manualSchema = z.object({
  studentId: z.string().min(1, 'Pick a student'),
  points: z.coerce.number().refine((n) => n !== 0, 'Points cannot be 0').refine((n) => Math.abs(n) <= 500, 'Max ±500 per adjustment'),
  justification: z.string().min(10, 'A justification of at least 10 characters is required — it appears in the audit log'),
});

const SCENARIOS: Record<string, Record<string, unknown>> = {
  'Individual task · first submission on time · feedback exists': { action: 'task_complete', onTime: true, revised: false, hasFeedback: true, isMilestone: false },
  'Individual task · resubmitted after feedback · on time': { action: 'task_complete', onTime: true, revised: true, hasFeedback: true, isMilestone: false },
  'Individual task · late first submission': { action: 'task_complete', onTime: false, revised: false, hasFeedback: true, isMilestone: false },
  'Group milestone passed': { action: 'task_complete', onTime: true, revised: false, hasFeedback: true, isMilestone: true },
  'Task completion attempt with NO feedback': { action: 'task_complete', onTime: true, revised: false, hasFeedback: false, isMilestone: false },
  'Peer evaluation submitted': { action: 'peer_eval' },
  'IP status → filed': { action: 'ip_milestone', ipStatus: 'filed' },
  'IP status → registered': { action: 'ip_milestone', ipStatus: 'registered' },
  'Competition entered': { action: 'competition_entered' },
};

export default function XPPage() {
  const db = useDb(), cmd = useCmd(), can = useCan();
  const [tab, setTab] = useState('rules');
  const [editRule, setEditRule] = useState<string | null>(null);
  const edit = can('update', 'XPRule');
  const commitRules = useGridCommit('xpRules', '');
  const commitRanks = useGridCommit('ranks', '');
  const ruleCols: GCol<XPRule>[] = [
    textCol('name', 'Rule', { width: 230 }), textCol('action', 'Trigger (plain language)', { width: 290 }),
    numCol('points', 'XP', { width: 80 }), boolCol('enabled', 'On'),
    { key: 'cond', name: 'Condition (JSON)', width: 150, sortable: false, renderCell: ({ row }) => <button className="btn sm" onClick={() => setEditRule(row.id)}>{'{ }'} {edit ? 'Edit' : 'View'}</button> },
  ];
  const rankCols: GCol<Rank>[] = [textCol('name', 'Rank', { width: 240 }), numCol('minXp', 'Min XP', { width: 120 })];
  return (
    <>
      <PageHead title="XP / gamification rule engine" sub="Every rule is data: a JSON condition + a point value, evaluated by json-rules-engine. Change a number or a condition and the economy changes — no code edit. Nothing is a black box."
        laws={['Hick’s Law — JSON conditions hidden behind an Edit button (progressive disclosure)', 'Nielsen — rule tester shows exactly what a scenario pays']} />
      {!edit && <Banner kind="info">Your role can view the XP economy but not change it.</Banner>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rules', label: 'Rule table' }, { id: 'ranks', label: 'Rank thresholds' }, { id: 'ledger', label: 'Ledger & manual adjustments' }]} />
      {tab === 'rules' && (
        <div className="col">
          <EditableGrid label="XP rules" rows={db.xpRules} columns={ruleCols} readOnly={!edit} reorderable onCommit={commitRules as never}
            newRow={(): XPRule => ({ id: newId(), name: 'New rule', action: 'Describe when this pays', points: 10, enabled: true, rev: 1, conditions: { all: [{ fact: 'action', operator: 'equal', value: 'task_complete' }] } })}
            rowClass={(r) => (r.enabled ? undefined : 'row-muted')} />
          <Tester />
        </div>
      )}
      {tab === 'ranks' && (
        <Card title="Rank thresholds">
          <EditableGrid label="Ranks" rows={[...db.ranks].sort((a, b) => a.minXp - b.minXp)} columns={rankCols} readOnly={!edit} onCommit={commitRanks as never}
            newRow={(): Rank => ({ id: newId(), name: 'New rank', minXp: (db.ranks.at(-1)?.minXp ?? 0) + 500, rev: 1 })} />
          <div className="small muted" style={{ marginTop: 8 }}>{db.users.filter((u) => u.role === 'student').map((u) => `${u.name.split(' ')[0]}: ${rankFor(db.ranks, xpTotal(db, u.id)).rank.name}`).join(' · ')}</div>
        </Card>
      )}
      {tab === 'ledger' && <Ledger />}
      {editRule && <CondModal id={editRule} onClose={() => setEditRule(null)} readOnly={!edit} />}
    </>
  );
  void cmd;
}

function CondModal({ id, onClose, readOnly }: { id: string; onClose: () => void; readOnly: boolean }) {
  const db = useDb(), cmd = useCmd();
  const rule = db.xpRules.find((r) => r.id === id)!;
  const [txt, setTxt] = useState(JSON.stringify(rule.conditions, null, 2));
  const err = validateConditions(txt);
  return (
    <Modal title={`Condition — ${rule.name}`} onClose={onClose}>
      <p className="small muted">Facts available: <span className="mono">action, onTime, revised, hasFeedback, isMilestone, ipStatus</span>. Conditions use json-rules-engine <span className="mono">all / any</span> syntax.</p>
      <textarea className="mono" rows={14} value={txt} readOnly={readOnly} onChange={(e) => setTxt(e.target.value)} style={{ fontSize: 12.5 }} />
      {err ? <span className="err">Invalid: {err}</span> : <span className="small" style={{ color: 'var(--ok)' }}>Valid condition</span>}
      {!readOnly && <div className="row" style={{ marginTop: 10 }}><button className="btn primary" disabled={!!err} onClick={() => { if (cmd.saveRows('xpRules', '', db.xpRules.map((r) => (r.id === id ? { ...r, conditions: JSON.parse(txt) } : r)) as never, { reason: 'edit', label: `Condition of “${rule.name}” edited` }).ok) onClose(); }}>Save condition</button></div>}
    </Modal>
  );
}

function Tester() {
  const db = useDb();
  const [key, setKey] = useState(Object.keys(SCENARIOS)[0]);
  const [res, setRes] = useState<XpAward[] | null>(null);
  const run = async (k: string) => { setKey(k); setRes(await evaluateXp(db.xpRules, SCENARIOS[k])); };
  return (
    <Card title="Rule tester — what would this scenario pay?" actions={<select value={key} onChange={(e) => run(e.target.value)} style={{ width: 'auto' }}>{Object.keys(SCENARIOS).map((k) => <option key={k}>{k}</option>)}</select>}>
      <div className="row wrap"><button className="btn sm" onClick={() => run(key)}>Evaluate</button>
        {res && (res.length ? res.map((r) => <span key={r.ruleId} className="badge xp">+{r.points} {r.label}</span>) : <Badge kind="gray">No rule fires → 0 XP</Badge>)}
        {res && <b>Total: {res.reduce((a, r) => a + r.points, 0)} XP</b>}</div>
      <p className="small mono muted" style={{ marginTop: 8 }}>facts = {JSON.stringify(SCENARIOS[key])}</p>
    </Card>
  );
}

const ch = createColumnHelper<XPEvent>();
function Ledger() {
  const db = useDb(), cmd = useCmd(), can = useCan();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'at', desc: true }]);
  const [page, setPage] = useState(0);
  const f = useForm({ resolver: zodResolver(manualSchema), defaultValues: { studentId: '', points: 25, justification: '' } });
  const edit = can('update', 'XPRule');
  const columns = useMemo(() => [
    ch.accessor('at', { header: 'When', cell: (i) => fmtDateTime(i.getValue()) }),
    ch.accessor('studentId', { header: 'Student', cell: (i) => userName(db, i.getValue()) }),
    ch.accessor('points', { header: 'XP', cell: (i) => <b style={{ color: i.getValue() < 0 ? 'var(--danger)' : 'var(--xp)' }}>{i.getValue() > 0 ? '+' : ''}{i.getValue()}</b> }),
    ch.accessor('label', { header: 'Reason', cell: (i) => <span>{i.getValue()}{i.row.original.justification && <div className="small muted">“{i.row.original.justification}”</div>}</span> }),
    ch.accessor('kind', { header: 'Type', cell: (i) => <Badge kind={i.getValue() === 'manual' ? 'warn' : 'gray'}>{i.getValue()}</Badge> }),
    ch.accessor('byId', { header: 'By', cell: (i) => userName(db, i.getValue()) }),
  ], [db]);
  const table = useReactTable({ data: db.xpEvents, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const all = table.getRowModel().rows;
  const PER = 7; // Miller's Law chunk
  const rows = all.slice(page * PER, page * PER + PER);
  return (
    <div className="col">
      {edit && (
        <Card title="Manual XP adjustment (always logged)">
          <form className="grid3" onSubmit={f.handleSubmit((v) => { if (cmd.grantManualXp(v.studentId, v.points, v.justification).ok) f.reset({ studentId: v.studentId, points: 25, justification: '' }); })}>
            <Field label="Student"><select {...f.register('studentId')}><option value="">Select…</option>{db.users.filter((u) => u.role === 'student').map((u) => <option key={u.id} value={u.id}>{u.name} ({xpTotal(db, u.id)} XP)</option>)}</select></Field>
            <Field label="Points (negative to deduct)"><input type="number" {...f.register('points')} /></Field>
            <Field label="Justification (required)"><input type="text" {...f.register('justification')} /></Field>
            <div className="row">{Object.values(f.formState.errors).map((e) => <span className="err" key={e.message}>{e.message}</span>)}</div>
            <button className="btn primary" type="submit">Apply adjustment</button>
          </form>
        </Card>
      )}
      <Card title={`XP ledger (${all.length} events)`}>
        <table className="plain">
          <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<SortMark dir={h.column.getIsSorted()} /></th>)}</tr>)}</thead>
          <tbody>{rows.map((r) => <tr key={r.id}>{r.getVisibleCells().map((c) => <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody>
        </table>
        <div className="row between" style={{ marginTop: 8 }}><span className="small muted">Page {page + 1} of {Math.ceil(all.length / PER)}</span>
          <div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button><button className="btn sm" disabled={(page + 1) * PER >= all.length} onClick={() => setPage(page + 1)}>Next ›</button></div></div>
      </Card>
    </div>
  );
}
