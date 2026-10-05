import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCmd, useDb } from '../../store';
import { Badge, Banner, Card, Field, PageHead } from '../../components/ui';
import EditableGrid from '../../components/EditableGrid';
import { numCol, textCol, type GCol } from '../../components/gridCols';
import { useCan, useCourse } from './common';
import { chartColors, tok } from '../../lib/display';
import { coAttainment, engagement, outcomeAttainment, userName, type Engagement } from '../../lib/selectors';

// Brand categorical palette, validated against the #faf6ee card surface (dataviz validate_palette: all checks pass).
// Fixed order, never cycled: cobalt, vermilion, teal, brass, rose, violet. Text stays in ink tokens, never series colour.
type ERow = Engagement & { id: string; name: string; flag: string };

export default function AnalyticsPage() {
  const PALETTE = chartColors(), C1 = PALETTE[0], C2 = PALETTE[1];
  const INK = tok('--ink-2'), GRID = tok('--line'), SURFACE = tok('--surface');
  const db = useDb(), course = useCourse(), cmd = useCmd(), can = useCan();
  const [who, setWho] = useState('cohort');
  const [table, setTable] = useState(false);
  const students = db.users.filter((u) => u.role === 'student' && u.courseIds.includes(course.id));
  const coCohort = coAttainment(db, course.id);
  const coOne = who === 'cohort' ? undefined : coAttainment(db, course.id, who);
  const coData = course.cos.map((c) => ({ co: c.code.split('-')[1], Cohort: Math.round(coCohort[c.id].pct), Student: coOne ? Math.round(coOne[c.id].pct) : undefined, n: coCohort[c.id].n }));
  const outC = outcomeAttainment(db, [course.id]);
  const outS = who === 'cohort' ? undefined : outcomeAttainment(db, [course.id], who);
  const radar = db.outcomes.map((o) => ({ key: o.key, Cohort: Math.round(outC[o.key] ?? 0), Student: outS ? Math.round(outS[o.key] ?? 0) : undefined }));
  const eng = useMemo(() => engagement(db, course.id), [db, course.id]);
  const rows: ERow[] = eng.map((e) => ({ ...e, id: e.studentId, name: userName(db, e.studentId), flag: e.risks.length ? e.risks.join(' · ') : 'OK' }));
  const cols: GCol<ERow>[] = [
    textCol('name', 'Student', { width: 160, editable: false }),
    { key: 'sub', name: 'Submitted / due', width: 130, renderCell: ({ row }) => <span>{row.submitted}/{row.due} ({Math.round(row.submissionRate * 100)}%)</span> },
    { key: 'ot', name: 'On-time', width: 90, renderCell: ({ row }) => <span>{Math.round(row.onTimeRate * 100)}%</span> },
    { key: 'peer', name: 'Peer score', width: 100, renderCell: ({ row }) => <span>{row.peerAvg ? row.peerAvg.toFixed(1) : '—'}</span> },
    numCol('xp', 'XP', { width: 80, editable: false }),
    { key: 'flag', name: 'At-risk flag', width: 420, renderCell: ({ row }) => (row.risks.length ? <Badge kind="danger">AT RISK</Badge> : <Badge kind="ok">on track</Badge>) },
    { key: 'why', name: 'Reason', width: 330, renderCell: ({ row }) => <span className="small">{row.risks.join(' · ') || '—'}</span> },
  ];
  // cumulative XP per day across cohort
  const xpLine = useMemo(() => {
    const evs = db.xpEvents.filter((e) => students.some((s) => s.id === e.studentId)).sort((a, b) => a.at.localeCompare(b.at));
    const days = [...new Set(evs.map((e) => e.at.slice(5, 10)))];
    const run: Record<string, number> = {};
    return days.map((d) => { evs.filter((e) => e.at.slice(5, 10) === d).forEach((e) => { run[e.studentId] = (run[e.studentId] ?? 0) + e.points; }); return { day: d, ...Object.fromEntries(students.map((s) => [s.name.split(' ')[0], run[s.id] ?? 0])) }; });
  }, [db.xpEvents, students]);
  const atRisk = eng.filter((e) => e.risks.length).length;
  const avgRate = eng.reduce((a, e) => a + e.submissionRate, 0) / Math.max(1, eng.length);
  const edit = can('update', 'Analytics');
  return (
    <>
      <PageHead title={`Analytics — ${course.code}`} sub="CO/PO/PSO attainment is computed from task-level CO tags and marks through your mapping matrix — nothing is typed in by hand."
        laws={['Von Restorff — at-risk students are the only red on the page', 'Aesthetic-Usability — validated palette, thin marks']}
        actions={<><select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 'auto' }} aria-label="Scope"><option value="cohort">Cohort</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button className="btn" onClick={() => setTable(!table)}>{table ? 'Show charts' : 'Table view'}</button></>} />
      <div className="col">
        <div className="grid3">
          <Card><div className="stat"><b>{students.length}</b><span>Students enrolled</span></div></Card>
          <Card><div className="stat"><b>{Math.round(avgRate * 100)}%</b><span>Avg submission rate</span></div></Card>
          <Card className={atRisk ? 'overdue' : ''}><div className="stat"><b style={{ color: atRisk ? 'var(--danger)' : undefined }}>{atRisk}</b><span>At-risk students</span></div></Card>
        </div>
        {table ? (
          <Card title="Attainment (table view)">
            <table className="plain"><thead><tr><th>CO</th><th>Cohort %</th>{who !== 'cohort' && <th>Student %</th>}<th>Evidence (completed units)</th></tr></thead>
              <tbody>{coData.map((d) => <tr key={d.co}><td>{d.co}</td><td>{d.Cohort}</td>{who !== 'cohort' && <td>{d.Student}</td>}<td>{d.n}</td></tr>)}</tbody></table>
            <table className="plain" style={{ marginTop: 12 }}><thead><tr><th>PO/PSO</th><th>Cohort %</th></tr></thead><tbody>{radar.map((d) => <tr key={d.key}><td>{d.key}</td><td>{d.Cohort}</td></tr>)}</tbody></table>
          </Card>
        ) : (
          <div className="grid2">
            <Card title="CO attainment (% of rubric marks, completed work)">
              <div style={{ height: 260 }} role="img" aria-label="Bar chart of CO attainment">
                <ResponsiveContainer><BarChart data={coData} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="co" tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Cohort" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  {who !== 'cohort' && <Bar dataKey="Student" fill={C2} radius={[4, 4, 0, 0]} maxBarSize={22} />}
                </BarChart></ResponsiveContainer>
              </div>
            </Card>
            <Card title="PO / PSO attainment (via mapping matrix)">
              <div style={{ height: 260 }} role="img" aria-label="Radar chart of PO and PSO attainment">
                <ResponsiveContainer><RadarChart data={radar}><PolarGrid stroke={GRID} /><PolarAngleAxis dataKey="key" tick={{ fill: INK, fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Cohort" dataKey="Cohort" stroke={C1} fill={C1} fillOpacity={0.18} strokeWidth={2} />
                  {who !== 'cohort' && <Radar name="Student" dataKey="Student" stroke={C2} fill={C2} fillOpacity={0.15} strokeWidth={2} />}
                  <Legend /><Tooltip /></RadarChart></ResponsiveContainer>
              </div>
            </Card>
            <Card title="XP progression (cumulative per student)" style={{ gridColumn: '1 / -1' }}>
              <div style={{ height: 240 }} role="img" aria-label="Line chart of cumulative XP">
                <ResponsiveContainer><LineChart data={xpLine}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="day" tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} width={40} /><Tooltip /><Legend />
                  {students.map((s, i) => <Line key={s.id} type="monotone" dataKey={s.name.split(' ')[0]} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} />)}</LineChart></ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}
        <Card title="Engagement & at-risk flags">
          <EditableGrid label="Engagement" rows={rows} columns={cols} readOnly selectable={false} onCommit={() => ({ ok: true, value: null })} rowClass={(r) => (r.risks.length ? 'row-danger' : undefined)} />
          <div className="grid3" style={{ marginTop: 12 }}>
            <Field label="Flag if submission rate below (0–1)"><input type="number" step={0.05} min={0} max={1} disabled={!edit} defaultValue={db.settings.atRiskSubmissionRate} onBlur={(e) => cmd.updateSettings({ atRiskSubmissionRate: Number(e.target.value) })} /></Field>
            <Field label="Flag if peer score below (1–5)"><input type="number" step={0.1} min={1} max={5} disabled={!edit} defaultValue={db.settings.atRiskPeerScore} onBlur={(e) => cmd.updateSettings({ atRiskPeerScore: Number(e.target.value) })} /></Field>
          </div>
        </Card>
        {!edit && <Banner kind="info">Oversight view: thresholds are read-only.</Banner>}
      </div>
    </>
  );
}
