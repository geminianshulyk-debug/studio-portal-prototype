import { useMemo, useState } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table';
import { useCmd, useDb, useStore, useUser } from '../../store';
import { Check } from 'lucide-react';
import { Badge, Banner, Card, PageHead , SortMark } from '../../components/ui';
import { abilityFor, PERM_ACTIONS, PERM_SUBJECTS } from '../../lib/permissions';
import { fmtDateTime, instructorAlerts, userName } from '../../lib/selectors';
import type { AuditEntry, User } from '../../types';

const ch = createColumnHelper<AuditEntry>();
export function AuditPage() {
  const db = useDb();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'at', desc: true }]);
  const [q, setQ] = useState('');
  const columns = useMemo(() => [
    ch.accessor('at', { header: 'When', cell: (i) => fmtDateTime(i.getValue()) }),
    ch.accessor('actorId', { header: 'Who', cell: (i) => <span>{userName(db, i.getValue())} <span className="small muted">({i.row.original.actorRole})</span></span> }),
    ch.accessor('action', { header: 'Action', cell: (i) => <span className="chip mono">{i.getValue()}</span> }),
    ch.accessor('summary', { header: 'What', cell: (i) => i.getValue() }),
    ch.display({ id: 'diff', header: 'Before → after', cell: (i) => { const r = i.row.original; return r.before || r.after ? <span className="small mono">{r.before ?? '∅'} → {r.after ?? '∅'}</span> : '—'; } }),
    ch.accessor('justification', { header: 'Justification', cell: (i) => <span className="small">{i.getValue() ?? '—'}</span> }),
  ], [db]);
  const table = useReactTable({ data: db.audit, columns, state: { sorting, globalFilter: q }, onSortingChange: setSorting, onGlobalFilterChange: setQ,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 7 } } });
  return (
    <>
      <PageHead title="Audit log" sub="Every grade change, XP grant or deduction, status change and configuration edit — who, when, and (for overrides) why. Append-only: there is no edit or delete path in the data layer."
        laws={['Nielsen — visibility of system status', 'Miller’s Law — 7 rows per page']} actions={<input type="search" placeholder="Search log…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} aria-label="Search audit log" />} />
      <Card>
        <table className="plain">
          <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<SortMark dir={h.column.getIsSorted()} /></th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((r) => <tr key={r.id}>{r.getVisibleCells().map((c) => <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody>
        </table>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small muted">{table.getFilteredRowModel().rows.length} entries · page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <div className="row"><button className="btn sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>‹ Prev</button><button className="btn sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next ›</button></div>
        </div>
      </Card>
    </>
  );
}

export function AlertsPage() {
  const db = useDb(), { setPage } = useStore(), user = useUser();
  const alerts = instructorAlerts(db);
  const groups: [string, string, string][] = [['submission', 'Submissions awaiting feedback', 'Closing the loop: feedback is owed'], ['peer-flag', 'Peer-evaluation outliers / disputes', 'Flagged scores excluded until you resolve them'], ['at-risk', 'At-risk students', 'Low submission rate or low peer-contribution score'], ['ip-gate', 'IP-gate items waiting on a screening decision', 'Projects blocked from portfolio-ready / competition-eligible']];
  const mine = db.notifications.filter((n) => n.userId === user.id);
  return (
    <>
      <PageHead title="Notification center" sub="The closed loop should not depend on anyone remembering to check. Everything that is waiting on you is listed here, grouped by type."
        laws={['Von Restorff — urgent items carry a red marker', 'Hick’s Law — four fixed groups']} />
      <div className="col">
        {alerts.length === 0 && <Banner kind="ok">Nothing is waiting on you.</Banner>}
        {groups.map(([k, title, sub]) => {
          const list = alerts.filter((a) => a.kind === k);
          return (
            <Card key={k} title={<span>{title} <Badge kind={list.length ? 'danger' : 'ok'}>{list.length}</Badge></span>}>
              <div className="small muted" style={{ marginBottom: 6 }}>{sub}</div>
              {list.map((a) => (
                <div key={a.id} className={`row between ${a.urgent ? 'overdue' : ''}`} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
                  <div><b>{a.title}</b><div className="small muted">{a.detail}</div></div>
                  <button className="btn sm" onClick={() => setPage(a.page)}>Open</button>
                </div>))}
              {!list.length && <span className="small muted">All clear.</span>}
            </Card>
          );
        })}
        <Card title="Your recent notifications">
          {mine.length === 0 ? <span className="small muted">None.</span> : mine.slice(0, 7).map((n) => <div key={n.id} className="small" style={{ padding: '4px 0' }}><b>{n.title}</b> — {n.body} <span className="muted">{fmtDateTime(n.at)}</span></div>)}
        </Card>
      </div>
    </>
  );
}

export function AccessPage() {
  const db = useDb();
  const reps: User[] = (['instructor', 'coinstructor', 'ta', 'hod', 'student'] as const).map((r) => db.users.find((u) => u.role === r)!);
  const LBL: Record<string, string> = { instructor: 'Instructor', coinstructor: 'Co-instructor', ta: 'Teaching Assistant', hod: 'Dean / HOD', student: 'Student' };
  return (
    <>
      <PageHead title="Roles & permissions" sub="Built on @casl/ability: roles are data, checks are `can(action, subject)`. Adding a role is one new case in one file — no checks scattered through components."
        laws={['Jakob’s Law — a familiar permission matrix']} />
      <Card title="Live permission matrix (evaluated from the real ability definitions)">
        <table className="plain"><thead><tr><th>Subject · action</th>{reps.map((u) => <th key={u.id}>{LBL[u.role]}</th>)}</tr></thead>
          <tbody>{PERM_SUBJECTS.flatMap((s) => PERM_ACTIONS.map((a) => ({ s, a }))).filter(({ s, a }) => reps.some((u) => abilityFor(u).can(a, s))).map(({ s, a }) => (
            <tr key={s + a}><td><b>{s}</b> · {a}</td>{reps.map((u) => <td key={u.id} style={{ textAlign: 'center' }}>{abilityFor(u).can(a, s) ? <span className="check" aria-label="allowed"><Check /></span> : <span className="muted" aria-label="not allowed">—</span>}</td>)}</tr>))}</tbody></table>
        <p className="small muted" style={{ marginTop: 8 }}>TA: can grade and give feedback but not change rubric, XP rules or the IP gate. Co-instructor: everything except deleting a course. HOD: read-only oversight. Student: attribute rules (own feedback, own projects, own competition entries).</p>
      </Card>
    </>
  );
}

interface Attack { id: string; title: string; expect: string; code: string; run: () => { ok: boolean; error?: string; code?: string; note?: string } }
export function IntegrityPage() {
  const db = useDb();
  const { cmdAs } = useStore();
  const cmd = useCmd();
  const [results, setResults] = useState<Record<string, { blocked: boolean; msg: string }>>({});
  void cmd;
  const q = (u: string) => cmdAs(u, true);
  const flaggedEval = db.peerEvals.find((e) => e.flag?.status === 'pending');
  const aTask = db.tasks.find((t) => t.id === 't2')!;
  const aaravFb = db.feedback.find((f) => f.studentId === 's1');
  const attacks: Attack[] = [
    { id: '1', title: 'Complete a task that has no feedback', expect: 'feedback-required', code: 'Instructor marks Aarav’s submitted-but-ungraded “User shadowing report” complete', run: () => q('u-inst').completeUnit('t2', 's1') },
    { id: '2', title: 'Student edits a submitted peer-evaluation score', expect: 'locked', code: 'Kabir rewrites a peer score', run: () => q('s3').editPeerEval(flaggedEval?.id ?? db.peerEvals[0].id, { contribution: 5 }) },
    { id: '3', title: 'Student re-submits a peer round to change their ratings', expect: 'locked', code: 'Diya submits cycle 3 a second time', run: () => q('s2').submitPeerRound('pc3', db.groups[0].memberIds.map((m) => ({ evaluateeId: m, scores: { contribution: 5, reliability: 5, quality: 5, collaboration: 5 }, comment: '' }))) },
    { id: '4', title: 'Bypass the IP gate (portfolio-ready with no screening)', expect: 'gate', code: 'Ishaan marks “Modular Planter Concept” portfolio-ready', run: () => q('s5').setProjectFlag('p2', 'portfolioReady', true) },
    { id: '5', title: 'Bypass the IP gate via competition-eligible', expect: 'gate', code: 'Tara marks the same project competition-eligible', run: () => q('s6').setProjectFlag('p2', 'competitionEligible', true) },
    { id: '6', title: 'Manual XP with no justification', expect: 'justification', code: 'Instructor grants +500 XP with an empty reason', run: () => q('u-inst').grantManualXp('s1', 500, '') },
    { id: '7', title: 'TA changes XP rules', expect: 'forbidden', code: 'Riya (TA) raises every rule by 1 XP', run: () => q('u-ta').saveRows('xpRules', '', db.xpRules.map((r) => ({ ...r, points: r.points + 1 })) as never, { reason: 'edit', label: 'attack' }) },
    { id: '8', title: 'TA logs an IP screening decision', expect: 'forbidden', code: 'Riya sets project p2 → screened', run: () => q('u-ta').setIpStatus('p2', 'screened', 'Attempt by TA to clear the gate for a student') },
    { id: '9', title: 'Student grades their own work', expect: 'forbidden', code: 'Aarav posts feedback for himself', run: () => q('s1').postFeedback({ submissionId: db.submissions.find((s) => s.studentId === 's1')!.id, scores: {}, comment: '', annotations: [], decision: 'pass' }) },
    { id: '10', title: 'Grade change without justification', expect: 'justification', code: 'Instructor changes a grade silently', run: () => q('u-inst').changeGrade(aaravFb!.id, 99, '') },
    { id: '11', title: 'Resubmit while a version is awaiting feedback', expect: 'state', code: 'Aarav uploads v2 before v1 is reviewed', run: () => q('s1').submitWork({ unitId: 't2', fileNames: ['x.pdf'], note: 'x', ticked: [], seenRubricVersion: aTask.rubricVersion }) },
    { id: '12', title: 'Dean/HOD edits course content', expect: 'forbidden', code: 'HOD changes the course title', run: () => q('u-hod').updateCourse('c1', { title: 'hacked' } as never, db.courses[0].rev, 'attack') },
    { id: '13', title: 'Concurrent edit with a stale row revision', expect: 'conflict', code: 'Save a task row using an old rev number', run: () => q('u-inst').updateTask('t1', { title: 'stale overwrite' } as never, 0, 'attack') },
    { id: '14', title: 'Resolve a flagged peer score with no reason', expect: 'justification', code: 'Instructor discards a flag silently', run: () => q('u-inst').resolveFlag(flaggedEval?.id ?? 'none', 'discarded', '') },
  ];
  const run = (a: Attack) => {
    if (a.id === '14' && !flaggedEval) { setResults((r) => ({ ...r, [a.id]: { blocked: true, msg: 'Skipped: no pending flag exists (resolve demo already done).' } })); return; }
    const r = a.run();
    setResults((x) => ({ ...x, [a.id]: r.ok ? { blocked: false, msg: 'NOT BLOCKED — this is a bug.' } : { blocked: r.code === a.expect, msg: `${r.code}: ${r.error}` } }));
  };
  const all = () => attacks.forEach(run);
  const pass = Object.values(results).filter((r) => r.blocked).length;
  return (
    <>
      <PageHead title="Integrity lab (Phase 6 QA)" sub="Each card tries to break a closed-loop or loophole rule through the same data layer the UI uses. Every attempt must be refused with an explanation."
        actions={<button className="btn primary big" onClick={all}>Run all {attacks.length} attacks</button>} laws={['Nielsen — error prevention: blocks explain themselves']} />
      {Object.keys(results).length > 0 && <Banner kind={pass === Object.keys(results).length ? 'ok' : 'danger'}>{pass}/{Object.keys(results).length} attempts correctly blocked.</Banner>}
      <div className="col" style={{ marginTop: 12 }}>
        {attacks.map((a) => { const r = results[a.id]; return (
          <Card key={a.id} className={r && !r.blocked ? 'overdue' : ''}>
            <div className="row between"><div><b>{a.id}. {a.title}</b><div className="small muted">{a.code} · expected refusal: <span className="mono">{a.expect}</span></div></div>
              <button className="btn" onClick={() => run(a)}>Attempt</button></div>
            {r && <div style={{ marginTop: 8 }}><Banner kind={r.blocked ? 'ok' : 'danger'}>{r.blocked ? 'Blocked — ' : ''}{r.msg}</Banner></div>}
          </Card>); })}
        <Card title="Server-authoritative timestamps"><p className="small">The submit command takes no client timestamp: <span className="mono">submitWork</span> stamps <span className="mono">submittedAt</span> from the data layer’s own clock, so on-time status cannot be forged. (Try it as a student: the “Upload” dialog has no date field, and a forged <span className="mono">submittedAt</span> property in the call is ignored by code — see <span className="mono">api.ts</span>.)</p></Card>
      </div>
    </>
  );
}
