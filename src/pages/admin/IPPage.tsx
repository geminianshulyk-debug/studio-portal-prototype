import { useState } from 'react';
import { useCmd, useDb } from '../../store';
import { Badge, Banner, Card, Field, PageHead } from '../../components/ui';
import EditableGrid from '../../components/EditableGrid';
import { textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse } from './common';
import { fmtDateTime, userName } from '../../lib/selectors';
import type { IPStatus, Project } from '../../types';

export const IP_LABEL: Record<IPStatus, string> = { unscreened: 'Not yet screened', screened: 'Screened', filed: 'Filed', registered: 'Registered', not_eligible: 'Not eligible' };
export const ipBadge = (s: IPStatus) => <Badge kind={s === 'unscreened' ? 'danger' : s === 'registered' ? 'ok' : s === 'not_eligible' ? 'gray' : 'info'}>{IP_LABEL[s]}</Badge>;

export default function IPPage() {
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const projects = db.projects.filter((p) => p.courseId === course.id);
  const [sel, setSel] = useState<string | null>(projects[0]?.id ?? null);
  const p = projects.find((x) => x.id === sel) ?? projects[0];
  const [status, setStatus] = useState<IPStatus>('screened');
  const [kind, setKind] = useState<'design registration' | 'patent'>('design registration');
  const [note, setNote] = useState('');
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const canScreen = can('update', 'IPGate');
  const cols: GCol<Project>[] = [
    textCol('title', 'Project', { width: 240, editable: false }),
    { key: 'owners', name: 'Owners', width: 200, renderCell: ({ row }) => <span>{row.ownerIds.map((s) => userName(db, s).split(' ')[0]).join(', ')}</span> },
    { key: 'ipStatus', name: 'IP status', width: 150, renderCell: ({ row }) => ipBadge(row.ipStatus) },
    textCol('ipKind', 'Route', { width: 150, editable: false }),
    { key: 'gate', name: 'Disclosure gate', width: 160, renderCell: ({ row }) => (course.disclosureGate && row.ipStatus === 'unscreened' ? <Badge kind="danger">⛔ BLOCKED</Badge> : <Badge kind="ok">cleared</Badge>) },
    { key: 'pr', name: 'Portfolio-ready', width: 130, renderCell: ({ row }) => <span>{row.portfolioReady ? '✓' : '—'}</span> },
    { key: 'ce', name: 'Competition-eligible', width: 160, renderCell: ({ row }) => <span>{row.competitionEligible ? '✓' : '—'}</span> },
  ];
  const tryFlag = (flag: 'portfolioReady' | 'competitionEligible', v: boolean) => {
    const r = cmd.setProjectFlag(p.id, flag, v);
    setGateMsg(r.ok ? null : r.error);
  };
  const waiting = projects.filter((x) => x.ipStatus === 'unscreened');
  return (
    <>
      <PageHead title="IP screening & disclosure gate" sub="Log each project’s IP decision. While the gate is on, a project cannot be marked portfolio-ready or competition-eligible until a screening record exists."
        laws={['Von Restorff — blocked projects are red-isolated', 'Nielsen — every block explains exactly why']} />
      <div className="col">
        <Card title="Disclosure gate" actions={<label className="row"><input type="checkbox" checked={course.disclosureGate} disabled={!canScreen} onChange={(e) => cmd.updateCourse(course.id, { disclosureGate: e.target.checked } as never, course.rev, `disclosure gate ${e.target.checked ? 'enabled' : 'disabled'}`)} /> Gate enabled for {course.code}</label>}>
          {!canScreen && <Banner kind="info">Your role cannot change the IP gate or log screening decisions (Teaching Assistants and oversight roles are read-only here).</Banner>}
          {waiting.length > 0 ? <Banner kind="danger">⛔ {waiting.length} project(s) waiting on a screening decision: {waiting.map((w) => w.title).join(', ')}</Banner> : <Banner kind="ok">No projects waiting for screening.</Banner>}
        </Card>
        <EditableGrid label="Projects" rows={projects} columns={cols} readOnly selectable={false} onCommit={() => ({ ok: true, value: null })} hint="Select a project card below to act"
          rowClass={(r) => (course.disclosureGate && r.ipStatus === 'unscreened' ? 'row-danger' : undefined)} />
        <div className="row wrap">{projects.map((x) => <button key={x.id} className={`btn ${p?.id === x.id ? 'primary' : ''}`} onClick={() => { setSel(x.id); setGateMsg(null); }}>{x.title}</button>)}</div>
        {p && (
          <div className="grid2">
            <Card title={p.title} actions={ipBadge(p.ipStatus)}>
              <p className="small">Owners: {p.ownerIds.map((s) => userName(db, s)).join(', ')} · Route: {p.ipKind}</p>
              {p.screening ? <p className="small"><b>Screening record:</b> {userName(db, p.screening.byId)} · {fmtDateTime(p.screening.at)}<br />{p.screening.note}</p> : <Banner kind="danger">No screening record — gate is blocking this project.</Banner>}
              {course.customFields.filter((f) => f.appliesTo === 'project').map((f) => (
                <Field key={f.id} label={f.label}><input type="text" defaultValue={p.custom[f.id] ?? ''} disabled={!canScreen} onBlur={(e) => e.target.value !== (p.custom[f.id] ?? '') && cmd.updateProjectCustom(p.id, f.id, e.target.value)} /></Field>
              ))}
              <div className="row wrap" style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => tryFlag('portfolioReady', !p.portfolioReady)}>{p.portfolioReady ? 'Unmark portfolio-ready' : 'Mark portfolio-ready'}</button>
                <button className="btn" onClick={() => tryFlag('competitionEligible', !p.competitionEligible)}>{p.competitionEligible ? 'Unmark competition-eligible' : 'Mark competition-eligible'}</button>
              </div>
              {gateMsg && <div style={{ marginTop: 8 }}><Banner kind="danger">⛔ {gateMsg}</Banner></div>}
            </Card>
            <Card title="Log screening decision">
              <div className="col">
                <Field label="Status"><select value={status} disabled={!canScreen} onChange={(e) => setStatus(e.target.value as IPStatus)}><option value="screened">Screened</option><option value="filed">Filed</option><option value="registered">Registered</option><option value="not_eligible">Not eligible</option></select></Field>
                <Field label="Route"><select value={kind} disabled={!canScreen} onChange={(e) => setKind(e.target.value as never)}><option>design registration</option><option>patent</option></select></Field>
                <Field label="Screening note (required — the gate relies on this record)"><textarea value={note} disabled={!canScreen} onChange={(e) => setNote(e.target.value)} placeholder="Prior-art search done; novelty assessment…" /></Field>
                <button className="btn primary big" disabled={!canScreen} onClick={() => { if (cmd.setIpStatus(p.id, status, note, kind).ok) { setNote(''); } }}>Log decision</button>
                <span className="small muted">Moving to “filed” or “registered” grants IP-milestone XP to every owner through the rule engine.</span>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
