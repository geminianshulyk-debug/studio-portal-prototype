import type {
  AuditEntry, CA, Celebration, CompEntry, Competition, Course, DB, EffortLog, Feedback, Group, Milestone,
  MilestoneArtifact, Notification, PeerCriterion, PeerCycle, PeerEval, Progress, Project, Rank, RubricCriterion,
  Submission, Task, UnitStatus, User, XPEvent, XPRule,
} from '../types';
import { PEER_CRITERIA } from '../types';
import { detectOutliers, peerScoreFor } from '../lib/peer';

export const SEED_VERSION = 3;

const DAY = 86400000;
export function buildSeed(nowMs = Date.now()): DB {
  const iso = (days: number, hour = 17) => {
    const d = new Date(nowMs + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => iso(days).slice(0, 10);
  let n = 0;
  const id = (p: string) => `${p}${++n}`;

  // ---------- users ----------
  const users: User[] = [
    { id: 'u-inst', name: 'Dr. Meera Kulkarni', role: 'instructor', email: 'meera@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 'u-co', name: 'Prof. Arjun Rao', role: 'coinstructor', email: 'arjun@mitwpu.example', courseIds: ['c1'] },
    { id: 'u-ta', name: 'Riya Shah (TA)', role: 'ta', email: 'riya@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 'u-hod', name: 'Prof. S. Iyer (HOD)', role: 'hod', email: 'hod@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 's1', name: 'Aarav Mehta', role: 'student', email: 'aarav@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 's2', name: 'Diya Nair', role: 'student', email: 'diya@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 's3', name: 'Kabir Sethi', role: 'student', email: 'kabir@mitwpu.example', courseIds: ['c1'] },
    { id: 's4', name: 'Sana Qureshi', role: 'student', email: 'sana@mitwpu.example', courseIds: ['c1'] },
    { id: 's5', name: 'Ishaan Patil', role: 'student', email: 'ishaan@mitwpu.example', courseIds: ['c1', 'c2'] },
    { id: 's6', name: 'Tara Deshpande', role: 'student', email: 'tara@mitwpu.example', courseIds: ['c1', 'c2'] },
  ];
  const students = users.filter((u) => u.role === 'student').map((u) => u.id);

  const outcomes = [
    ...['Engineering & design knowledge', 'Problem analysis', 'Design of solutions', 'Research & investigation', 'Modern tool usage', 'Communication & teamwork'].map(
      (title, i) => ({ key: `PO${i + 1}`, title, kind: 'PO' as const }),
    ),
    ...['Form, aesthetics & ergonomics', 'Human-centred research', 'Materials & manufacturing', 'Communication & IP'].map((title, i) => ({
      key: `PSO${i + 1}`,
      title,
      kind: 'PSO' as const,
    })),
  ];

  // ---------- courses ----------
  const map = (o: Record<string, 1 | 2 | 3>) => o as Record<string, 0 | 1 | 2 | 3>;
  const c1Cos = [
    { id: 'c1-co1', code: 'PD301-CO1', text: 'Apply anthropometric and ergonomic data to size and shape a product.', map: map({ PO1: 3, PO2: 2, PSO1: 3 }), rev: 1 },
    { id: 'c1-co2', code: 'PD301-CO2', text: 'Plan and conduct user observation and synthesise findings into insights.', map: map({ PO2: 3, PO4: 3, PSO2: 3 }), rev: 1 },
    { id: 'c1-co3', code: 'PD301-CO3', text: 'Generate and communicate multiple concept directions through sketching.', map: map({ PO3: 3, PO6: 2, PSO1: 2, PSO4: 1 }), rev: 1 },
    { id: 'c1-co4', code: 'PD301-CO4', text: 'Collaboratively prototype and iterate an ergonomic product with defined roles.', map: map({ PO3: 3, PO5: 2, PO6: 3, PSO1: 2, PSO3: 2 }), rev: 1 },
    { id: 'c1-co5', code: 'PD301-CO5', text: 'Document design work and assess eligibility for design registration / patent.', map: map({ PO6: 2, PO4: 1, PSO4: 3 }), rev: 1 },
  ];
  const c2Cos = [
    { id: 'c2-co1', code: 'PD302-CO1', text: 'Classify materials and relate properties to product requirements.', map: map({ PO1: 3, PSO3: 3 }), rev: 1 },
    { id: 'c2-co2', code: 'PD302-CO2', text: 'Select and justify a manufacturing process for a given design.', map: map({ PO3: 2, PO5: 2, PSO3: 3 }), rev: 1 },
    { id: 'c2-co3', code: 'PD302-CO3', text: 'Analyse an existing product through teardown and cost reasoning.', map: map({ PO2: 2, PO4: 2, PSO3: 2, PSO2: 1 }), rev: 1 },
  ];
  const peer = { cadence: 'every-milestone' as const, peerWeight: 0.6, effortWeight: 0.4, individualShare: 0.3, floor: 0.7, cap: 1.15, outlierGap: 1.5 };
  const courses: Course[] = [
    {
      id: 'c1', code: 'PD301', title: 'Product Ergonomics & Human Factors Studio', semester: 'Sem 5 · Monsoon',
      syllabus: 'Unit 1 — Human body, anthropometry and percentiles\nUnit 2 — Observation, shadowing and user research synthesis\nUnit 3 — Ideation, sketching and concept communication\nUnit 4 — Collaborative prototyping sprint (group studio)\nUnit 5 — Documentation, design registration and IP awareness',
      objectives: ['Build fluency with human-factors data in form decisions', 'Practise team-based studio work with individual accountability', 'Introduce IP screening as a normal step in the design process'],
      cos: c1Cos,
      resources: [
        { id: 'r1', kind: 'reading', title: 'The Measure of Man and Woman', detail: 'Henry Dreyfuss Associates', link: 'https://example.org/reading/measure-of-man', rev: 1 },
        { id: 'r2', kind: 'reading', title: 'Observing the User Experience', detail: 'Goodman, Kuniavsky', link: 'https://example.org/reading/observing-ux', rev: 1 },
        { id: 'r3', kind: 'reading', title: 'Design Registration Basics (India)', detail: 'Institute IP cell note', link: 'https://example.org/reading/design-reg', rev: 1 },
        { id: 'r4', kind: 'software', title: 'Fusion 360', detail: 'Education licence', link: 'https://example.org/sw/fusion', rev: 1 },
        { id: 'r5', kind: 'software', title: 'Figma', detail: 'Education plan', link: 'https://example.org/sw/figma', rev: 1 },
        { id: 'r6', kind: 'software', title: 'Procreate / Sketchbook', detail: 'Tablet lab', link: 'https://example.org/sw/sketch', rev: 1 },
      ],
      plan: [
        { id: 'pl1', week: 1, topic: 'Anthropometry & percentiles', kind: 'lecture', start: day(-42), end: day(-36), rev: 1 },
        { id: 'pl2', week: 2, topic: 'Studio: data audit clinic', kind: 'studio', start: day(-35), end: day(-29), rev: 1 },
        { id: 'pl3', week: 3, topic: 'Observation methods', kind: 'lecture', start: day(-28), end: day(-22), rev: 1 },
        { id: 'pl4', week: 4, topic: 'Sprint kickoff & briefing', kind: 'studio', start: day(-21), end: day(-15), rev: 1 },
        { id: 'pl5', week: 5, topic: 'Mid-semester break', kind: 'break', start: day(-14), end: day(-12), rev: 1 },
        { id: 'pl6', week: 6, topic: 'Prototype review 1', kind: 'review', start: day(-7), end: day(-4), rev: 1 },
        { id: 'pl7', week: 7, topic: 'IP awareness workshop', kind: 'lecture', start: day(3), end: day(6), rev: 1 },
        { id: 'pl8', week: 8, topic: 'Final jury preparation', kind: 'studio', start: day(10), end: day(16), rev: 1 },
      ],
      customFields: [
        { id: 'cf1', label: 'Material used', appliesTo: 'task', type: 'text' },
        { id: 'cf2', label: 'Prototype iteration #', appliesTo: 'task', type: 'number' },
        { id: 'cf3', label: 'Client brief ref', appliesTo: 'project', type: 'text' },
      ],
      peer, disclosureGate: true, rev: 1,
    },
    {
      id: 'c2', code: 'PD302', title: 'Materials & Manufacturing Processes', semester: 'Sem 5 · Monsoon',
      syllabus: 'Unit 1 — Material families and properties\nUnit 2 — Forming, casting, machining and additive processes\nUnit 3 — Teardown and cost reasoning',
      objectives: ['Link material properties to design intent', 'Justify process selection with evidence'],
      cos: c2Cos,
      resources: [
        { id: 'r7', kind: 'reading', title: 'Materials and Design', detail: 'Ashby, Johnson', link: 'https://example.org/reading/materials-design', rev: 1 },
        { id: 'r8', kind: 'software', title: 'Granta EduPack', detail: 'Lab licence', link: 'https://example.org/sw/granta', rev: 1 },
      ],
      plan: [
        { id: 'pl9', week: 1, topic: 'Material families', kind: 'lecture', start: day(-40), end: day(-34), rev: 1 },
        { id: 'pl10', week: 4, topic: 'Process selection clinic', kind: 'studio', start: day(-20), end: day(-14), rev: 1 },
        { id: 'pl11', week: 7, topic: 'Teardown week', kind: 'studio', start: day(4), end: day(10), rev: 1 },
      ],
      customFields: [],
      peer, disclosureGate: false, rev: 1,
    },
  ];

  // ---------- CAs ----------
  const cas: CA[] = [
    { id: 'ca1', courseId: 'c1', name: 'CA1 · Research & Ideation', weight: 30, order: 1, rev: 1 },
    { id: 'ca2', courseId: 'c1', name: 'CA2 · Group Studio Sprint', weight: 40, order: 2, rev: 1 },
    { id: 'ca3', courseId: 'c1', name: 'CA3 · Documentation & IP', weight: 30, order: 3, rev: 1 },
    { id: 'ca4', courseId: 'c2', name: 'CA1 · Materials Portfolio', weight: 50, order: 1, rev: 1 },
    { id: 'ca5', courseId: 'c2', name: 'CA2 · Teardown', weight: 50, order: 2, rev: 1 },
  ];

  // ---------- tasks ----------
  const rub = (prefix: string, items: [string, boolean][]): RubricCriterion[] =>
    items.map(([text, selfCheck], i) => ({ id: `${prefix}-k${i + 1}`, text, max: 25, selfCheck }));
  const groupRoles = ['Lead', 'Researcher', 'Maker', 'Documenter'];
  const rotate = (k: number): Record<string, string> =>
    Object.fromEntries(['s1', 's2', 's3', 's4'].map((s, i) => [s, groupRoles[(i + k) % 4]]));
  const milestones: Milestone[] = [
    { id: 'm1', title: 'M1 · Research & Brief', due: iso(-21), assignments: rotate(0) },
    { id: 'm2', title: 'M2 · Prototype v1', due: iso(-7), assignments: rotate(1) },
    { id: 'm3', title: 'M3 · Final Model & Documentation', due: iso(14), assignments: rotate(2) },
  ];
  const t = (p: Partial<Task> & Pick<Task, 'id' | 'courseId' | 'caId' | 'title' | 'coId' | 'deadline' | 'start' | 'rubric'>): Task => ({
    brief: '<p></p>', rubricVersion: 1, type: 'individual', tools: '', order: 1, custom: {}, extensions: {}, rev: 1, ...p,
  });
  const tasks: Task[] = [
    t({ id: 't1', courseId: 'c1', caId: 'ca1', order: 1, title: 'Anthropometric data audit', coId: 'c1-co1', start: iso(-34), deadline: iso(-20),
      brief: '<p>Collect <strong>5th / 50th / 95th percentile</strong> data for a hand-held product of your choice and justify three dimensions.</p><ul><li>Cite data source</li><li>Show percentile reasoning</li></ul>',
      tools: 'Spreadsheet, Figma', custom: { cf1: '—', cf2: '1' },
      rubric: rub('t1', [['Data sources cited and current', true], ['Percentile choice justified', true], ['Dimensions tied to product features', true], ['Clarity of presentation', false]]) }),
    t({ id: 't2', courseId: 'c1', caId: 'ca1', order: 2, title: 'User shadowing report', coId: 'c1-co2', start: iso(-12), deadline: iso(2),
      brief: '<p>Shadow <strong>two users</strong> performing a task with a hand tool. Submit observations, pain points and <em>three insights</em>.</p>',
      tools: 'Notebook, Phone camera', custom: { cf1: '—', cf2: '1' },
      rubric: rub('t2', [['Observation protocol described', true], ['Pain points evidenced with notes/photos', true], ['Insights are non-obvious and synthesised', true], ['Reflection on researcher bias', false]]) }),
    t({ id: 't3', courseId: 'c1', caId: 'ca1', order: 3, title: 'Concept sketch set (8 thumbnails)', coId: 'c1-co3', start: iso(0), deadline: iso(9),
      brief: '<p>Eight thumbnail concepts, three developed to a rendered sketch with annotated ergonomic rationale.</p>',
      tools: 'Procreate / Sketchbook', custom: { cf1: 'Clay / foam', cf2: '1' },
      rubric: rub('t3', [['Range of concept directions', true], ['Line quality and communication', false], ['Ergonomic rationale annotated', true], ['Selection rationale', true]]) }),
    t({ id: 't4', courseId: 'c1', caId: 'ca2', order: 1, type: 'group', title: 'Ergo-Handle Studio Sprint', coId: 'c1-co4', start: iso(-21), deadline: iso(14),
      brief: '<p>In your group of four, design and prototype an <strong>ergonomic handle</strong> for a kitchen tool. Every milestone, each member owns one role; roles <em>rotate</em>.</p>',
      tools: 'Fusion 360, foam/clay, 3D printer', custom: { cf1: 'PLA + silicone', cf2: '2' },
      rubric: rub('t4', [['Deliverable meets milestone brief', true], ['Ergonomic evidence used', true], ['Quality of prototype / documentation', true], ['Handover note for next role-holder', true]]),
      group: {
        groupId: 'g1', roles: groupRoles,
        roleDeliverables: { Lead: 'Plans the milestone, unblocks others, runs the stand-up', Researcher: 'Gathers data and references for the milestone', Maker: 'Builds the physical or digital artefact', Documenter: 'Captures process, decisions and the milestone report' },
        milestones,
      } }),
    t({ id: 't5', courseId: 'c1', caId: 'ca3', order: 1, title: 'Design-registration disclosure pack', coId: 'c1-co5', start: iso(5), deadline: iso(25),
      brief: '<p>Prepare representations and a novelty statement for your project. <strong>IP screening must be logged</strong> before this can be marked portfolio-ready.</p>',
      tools: 'Figma, Fusion 360', custom: {}, rubric: rub('t5', [['Representations complete (all views)', true], ['Novelty statement', true], ['Prior-art search log', true], ['Formatting to registry norms', false]]) }),
    t({ id: 't6', courseId: 'c1', caId: 'ca3', order: 2, title: 'Reflective portfolio entry', coId: 'c1-co5', start: iso(10), deadline: iso(30),
      brief: '<p>One-page reflection linking your contribution to a course outcome.</p>', custom: {},
      rubric: rub('t6', [['Specific evidence of own contribution', true], ['Links to course outcome', true], ['Honest reflection on gaps', false], ['Writing quality', false]]) }),
    t({ id: 't7', courseId: 'c2', caId: 'ca4', order: 1, title: 'Material swatch library', coId: 'c2-co1', start: iso(-30), deadline: iso(-10),
      brief: '<p>Build a swatch library of 12 materials with properties and everyday-product examples.</p>', custom: {},
      rubric: rub('t7', [['Coverage across material families', true], ['Properties accurately reported', true], ['Product examples relevant', true], ['Presentation', false]]) }),
    t({ id: 't8', courseId: 'c2', caId: 'ca4', order: 2, title: 'Process flow mapping', coId: 'c2-co2', start: iso(-8), deadline: iso(5),
      brief: '<p>Map the manufacturing process chain for a product and justify each step.</p>', custom: {},
      rubric: rub('t8', [['Chain is complete and ordered', true], ['Process justification', true], ['Tolerance / finish considered', true], ['Diagram clarity', false]]) }),
    t({ id: 't9', courseId: 'c2', caId: 'ca5', order: 1, title: 'Product teardown analysis', coId: 'c2-co3', start: iso(4), deadline: iso(20),
      brief: '<p>Tear down a small appliance; document parts, materials, joins and a rough BOM cost.</p>', custom: {},
      rubric: rub('t9', [['Parts & joins documented', true], ['Materials identified', true], ['Cost reasoning', true], ['Insights for redesign', false]]) }),
  ];
  const groups: Group[] = [{ id: 'g1', courseId: 'c1', name: 'Team Kinetic', memberIds: ['s1', 's2', 's3', 's4'] }];

  // ---------- progress / submissions / feedback ----------
  const progress: Progress[] = [];
  const submissions: Submission[] = [];
  const feedback: Feedback[] = [];
  const xpEvents: XPEvent[] = [];
  const setProg = (unitId: string, studentId: string, status: UnitStatus, completedAt?: string) => {
    const key = `${unitId}:${studentId}`;
    const ex = progress.find((p) => p.key === key);
    if (ex) { ex.status = status; ex.completedAt = completedAt; } else progress.push({ key, unitId, studentId, status, completedAt });
  };
  const taskOf = (unitId: string) => tasks.find((x) => x.id === unitId.split('#')[0])!;
  const sub = (unitId: string, studentId: string, version: number, at: number, onTime: boolean, note: string, unticked: string[] = []) => {
    const s: Submission = { id: id('sub'), unitId, studentId, version, fileNames: [`${unitId.replace('#', '_')}_v${version}_${studentId}.pdf`, ...(version === 1 ? ['process-photos.zip'] : [])], note, submittedAt: iso(at, 14), onTime, unticked, rubricVersion: 1 };
    submissions.push(s);
    return s;
  };
  const fb = (s: Submission, pct: number, decision: 'pass' | 'revise', by: string, daysAfter: number, comment: string): Feedback => {
    const task = taskOf(s.unitId);
    const scores = Object.fromEntries(task.rubric.map((k, i) => [k.id, Math.round(k.max * Math.min(1, Math.max(0, pct / 100 + (i % 2 ? -0.04 : 0.03))))]));
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const f: Feedback = {
      id: id('fb'), unitId: s.unitId, studentId: s.studentId, version: s.version, submissionId: s.id,
      createdAt: new Date(new Date(s.submittedAt).getTime() + daysAfter * DAY).toISOString(), byId: by, scores, total,
      autoSummary: autoSummary(task, scores, s.unticked), comment: `<p>${comment}</p>`, annotations: [], decision, gradeHistory: [], read: true,
    };
    feedback.push(f);
    return f;
  };
  const xp = (studentId: string, points: number, label: string, unitId?: string, version?: number, ruleId?: string, daysAgo = 5) =>
    xpEvents.push({ id: id('xp'), studentId, points, label, unitId, version, ruleId, kind: 'auto', byId: 'system', at: iso(-daysAgo, 12) });

  const note = 'Observation notes were collected over two sessions.\n\nThe main pain point was wrist deviation when twisting the lid; we measured it on a goniometer app.\n\nInsight: users compensate with their non-dominant hand when grip width is above 45mm.';

  // T1: everyone complete. Kabir late, Ishaan revised.
  for (const s of students) {
    const late = s === 's3';
    const s1v = sub('t1', s, 1, late ? -19 : -21, !late, note);
    if (s === 's5') {
      fb(s1v, 52, 'revise', 'u-inst', 1, 'Percentile reasoning is thin — justify the 95th percentile choice for the grip diameter.');
      setProg('t1', s, 'revision');
      const v2 = sub('t1', s, 2, -20, true, note);
      fb(v2, 78, 'pass', 'u-inst', 0.5, 'Much stronger. Good use of the 95th percentile for clearance.');
      xp(s, 20, 'Task submitted on time', 't1', 2, 'xr1', 18); xp(s, 10, 'Task revised after feedback', 't1', 2, 'xr2', 18);
    } else {
      fb(s1v, late ? 64 : 72 + (s === 's2' ? 14 : 0), 'pass', 'u-inst', 1, late ? 'Solid data but submitted after the deadline. Watch the timeline.' : 'Clear sourcing and well-argued percentile choices.');
      xp(s, late ? 5 : 20, late ? 'Completed after deadline' : 'Task submitted on time', 't1', 1, late ? 'xr7' : 'xr1', 18);
    }
    setProg('t1', s, 'complete', iso(-18));
  }

  // T2: mixed
  const t2a = sub('t2', 's1', 1, -1, true, note);
  setProg('t2', 's1', 'submitted');
  const t2b = sub('t2', 's2', 1, -2, true, note, ['t2-k4']);
  fb(t2b, 48, 'revise', 'u-inst', 0.5, 'Insights read as observations — push them into interpretation. See my annotations.');
  feedback[feedback.length - 1].annotations.push({ id: id('an'), paragraph: 1, quote: 'wrist deviation', comment: 'Quantify this: how many degrees, how often?', by: 'u-inst' });
  feedback[feedback.length - 1].read = false;
  setProg('t2', 's2', 'revision');
  const t2d = sub('t2', 's4', 1, -4, true, note);
  fb(t2d, 88, 'pass', 'u-ta', 1, 'Excellent synthesis; the insight about grip-width compensation is genuinely non-obvious.');
  setProg('t2', 's4', 'complete', iso(-3));
  xp('s4', 20, 'Task submitted on time', 't2', 1, 'xr1', 3);
  const t2e = sub('t2', 's5', 1, -1, true, note);
  fb(t2e, 70, 'pass', 'u-ta', 0.5, 'Good work. Reflection on bias could be more honest.');
  setProg('t2', 's5', 'complete', iso(-1));
  xp('s5', 20, 'Task submitted on time', 't2', 1, 'xr1', 1);
  void t2a;

  // Group task milestones M1, M2: all complete with feedback and artifacts
  const artifacts: MilestoneArtifact[] = [];
  for (const [mi, m] of milestones.slice(0, 2).entries()) {
    const fids: string[] = [];
    for (const s of ['s1', 's2', 's3', 's4']) {
      const unit = `t4#${m.id}`;
      const late = mi === 1 && s === 's3';
      const sb = sub(unit, s, 1, mi === 0 ? -22 : (late ? -6 : -8), !late, `${m.assignments[s]} deliverable for ${m.title}.\n\nDecisions recorded in the team log.`);
      const f = fb(sb, mi === 0 ? 74 : 70 + (s === 's2' ? 10 : 0) - (s === 's3' ? 8 : 0), 'pass', 'u-inst', 1, `${m.assignments[s]} work on ${m.title} is on track.`);
      fids.push(f.id);
      setProg(unit, s, 'complete', iso(mi === 0 ? -20 : -6));
      xp(s, 30, `Milestone passed — ${m.title}`, unit, 1, 'xr4', mi === 0 ? 20 : 6);
    }
    artifacts.push({
      id: id('art'), taskId: 't4', milestoneId: m.id, publishedAt: iso(mi === 0 ? -19 : -5), byId: 'u-inst', feedbackIds: fids, peerAvg: {},
      summary: mi === 0 ? 'Brief and research accepted. Roles rotate for M2 — Makers: bring foam mock-ups.' : 'Prototype v1 accepted with minor revisions. Documenter: capture grip-angle tests.',
    });
  }
  setProg('t4#m3', 's2', 'submitted');
  sub('t4#m3', 's2', 1, -1, true, `Researcher deliverable for M3 — final ergonomics evidence pack.\n\nTested with six users at two grip sizes.`);
  for (const s of ['s1', 's3', 's4']) setProg('t4#m3', s, 'assigned');

  // PD302: T7 complete for enrolled; T8 some
  for (const s of ['s1', 's2', 's5', 's6']) {
    const sb = sub('t7', s, 1, -11, true, 'Swatch library documented with 12 materials.\n\nEach swatch includes density and typical use.');
    fb(sb, 70 + (s === 's2' ? 12 : 0), 'pass', 'u-inst', 1, 'Good coverage across families.');
    setProg('t7', s, 'complete', iso(-9));
    xp(s, 20, 'Task submitted on time', 't7', 1, 'xr1', 9);
  }
  sub('t8', 's5', 1, -1, true, 'Process chain for injection-moulded bottle.');
  setProg('t8', 's5', 'submitted');

  // peer cycles + evaluations
  const cycles: PeerCycle[] = [
    { id: 'pc1', taskId: 't4', milestoneId: 'm1', label: 'Cycle 1 · after M1', opens: iso(-21), due: iso(-18), status: 'closed', rev: 1 },
    { id: 'pc2', taskId: 't4', milestoneId: 'm2', label: 'Cycle 2 · after M2', opens: iso(-7), due: iso(-4), status: 'closed', rev: 1 },
    { id: 'pc3', taskId: 't4', milestoneId: 'm3', label: 'Cycle 3 · after M3', opens: iso(-1), due: iso(5), status: 'open', rev: 1 },
  ];
  const base: Record<string, number> = { s1: 4.2, s2: 4.5, s3: 3.0, s4: 3.8 };
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5);
  const peerEvals: PeerEval[] = [];
  const mkEval = (cycleId: string, ev: string, tg: string, forceSelf?: number, at = -4): PeerEval => {
    const scores = {} as Record<PeerCriterion, number>;
    for (const c of PEER_CRITERIA) {
      const v = forceSelf ?? Math.max(1, Math.min(5, Math.round(base[tg] + rnd() * 0.9 + (ev === tg ? 0.3 : 0))));
      scores[c] = v;
    }
    return { id: id('pe'), cycleId, evaluatorId: ev, evaluateeId: tg, scores, comment: ev === tg ? 'Self-reflection.' : `${tg === 's3' ? 'Needs to pick up pace' : 'Dependable contributor'}.`, submittedAt: iso(at, 10), locked: true };
  };
  for (const c of ['pc1', 'pc2']) for (const ev of ['s1', 's2', 's3', 's4']) for (const tg of ['s1', 's2', 's3', 's4']) peerEvals.push(mkEval(c, ev, tg, undefined, c === 'pc1' ? -19 : -5));
  // cycle 2: Kabir's self-rating slipped through high → flagged, then resolved by instructor (accepted, with justification)
  const flagged2 = peerEvals.find((e) => e.cycleId === 'pc2' && e.evaluatorId === 's3' && e.evaluateeId === 's3')!;
  for (const c of PEER_CRITERIA) flagged2.scores[c] = 5;
  // cycle 3 (open): Diya + Kabir submitted; Kabir's self-rating is self-favouring → pending flag
  for (const tg of ['s1', 's2', 's3', 's4']) peerEvals.push(mkEval('pc3', 's2', tg, undefined, -1));
  for (const tg of ['s1', 's2', 's3', 's4']) peerEvals.push(mkEval('pc3', 's3', tg, tg === 's3' ? 5 : undefined, -1));
  for (const cyc of cycles) {
    const flags = detectOutliers(peerEvals.filter((e) => e.cycleId === cyc.id), courses[0].peer);
    for (const e of peerEvals.filter((x) => x.cycleId === cyc.id)) {
      if (flags[e.id]) e.flag = { reason: flags[e.id], status: 'pending' };
    }
  }
  for (const e of peerEvals.filter((x) => x.cycleId === 'pc2' && x.flag)) e.flag = { ...e.flag!, status: 'accepted', resolvedBy: 'u-inst', resolvedAt: iso(-4, 18), justification: 'Reviewed with team log: rating reflects a late push in M2; retained after discussion.' };
  // peer summaries for artifacts
  for (const a of artifacts) {
    const evs = peerEvals.filter((e) => e.cycleId === (a.milestoneId === 'm1' ? 'pc1' : 'pc2'));
    for (const s of ['s1', 's2', 's3', 's4']) a.peerAvg[s] = Math.round(peerScoreFor(evs, s).avg * 10) / 10;
    for (const fid of a.feedbackIds) {
      const f = feedback.find((x) => x.id === fid)!;
      const p = peerScoreFor(evs, f.studentId);
      f.peerSummary = { avg: Math.round(p.avg * 10) / 10, count: p.count, flagged: p.flagged };
    }
  }
  // peer-eval XP (cycles 1,2 for all; cycle 3 for s2,s3)
  for (const cy of ['pc1', 'pc2']) for (const s of ['s1', 's2', 's3', 's4']) xp(s, 5, 'Peer evaluation completed', undefined, undefined, 'xr3', cy === 'pc1' ? 18 : 4);
  for (const s of ['s2', 's3']) xp(s, 5, 'Peer evaluation completed', undefined, undefined, 'xr3', 1);

  const effort: EffortLog[] = [];
  const eff = (studentId: string, milestoneId: string, hours: number, noteText: string, at: number) =>
    effort.push({ id: id('ef'), taskId: 't4', milestoneId, studentId, hours, note: noteText, at: iso(at, 20) });
  eff('s1', 'm1', 6, 'Planning + stand-ups', -24); eff('s2', 'm1', 9, 'Anthropometric review', -24); eff('s3', 'm1', 5, 'Foam mock-ups', -23); eff('s4', 'm1', 7, 'Brief doc', -22);
  eff('s1', 'm2', 8, 'Research on grip angles', -10); eff('s2', 'm2', 6, 'Doc + photos', -9); eff('s3', 'm2', 4, 'Printing handle v1', -8); eff('s4', 'm2', 10, 'Prototype build', -9);
  const contributions = [
    { id: id('ct'), taskId: 't4', milestoneId: 'm2', studentId: 's4', text: 'Built handle v1 in clay, 3 grip diameters', at: iso(-9, 18) },
    { id: id('ct'), taskId: 't4', milestoneId: 'm2', studentId: 's3', text: 'Printed PLA handle shell', at: iso(-8, 11) },
    { id: id('ct'), taskId: 't4', milestoneId: 'm2', studentId: 's1', text: 'Led stand-up, resolved print queue clash', at: iso(-10, 10) },
  ];

  // ---------- XP rules ----------
  const cond = (...all: { fact: string; operator: string; value: unknown }[]) => ({ all });
  const eq = (fact: string, value: unknown) => ({ fact, operator: 'equal', value });
  const xpRules: XPRule[] = [
    { id: 'xr1', name: 'Task submitted on time', action: 'Task completed · first submission on time', points: 20, enabled: true, rev: 1, conditions: cond(eq('action', 'task_complete'), eq('onTime', true), eq('hasFeedback', true), eq('isMilestone', false)) },
    { id: 'xr2', name: 'Task revised after feedback', action: 'Task completed · resubmitted after feedback', points: 10, enabled: true, rev: 1, conditions: cond(eq('action', 'task_complete'), eq('revised', true), eq('hasFeedback', true)) },
    { id: 'xr3', name: 'Peer evaluation completed', action: 'Peer evaluation submitted', points: 5, enabled: true, rev: 1, conditions: cond(eq('action', 'peer_eval')) },
    { id: 'xr4', name: 'Milestone passed', action: 'Group milestone completed with feedback', points: 30, enabled: true, rev: 1, conditions: cond(eq('action', 'task_complete'), eq('isMilestone', true), eq('hasFeedback', true)) },
    { id: 'xr5', name: 'IP milestone — filed', action: 'Project IP status → filed', points: 50, enabled: true, rev: 1, conditions: cond(eq('action', 'ip_milestone'), eq('ipStatus', 'filed')) },
    { id: 'xr5b', name: 'IP milestone — registered', action: 'Project IP status → registered', points: 100, enabled: true, rev: 1, conditions: cond(eq('action', 'ip_milestone'), eq('ipStatus', 'registered')) },
    { id: 'xr6', name: 'Competition entered', action: 'Competition outcome → submitted', points: 25, enabled: true, rev: 1, conditions: cond(eq('action', 'competition_entered')) },
    { id: 'xr7', name: 'Completed after deadline', action: 'Task completed · first submission late', points: 5, enabled: true, rev: 1, conditions: cond(eq('action', 'task_complete'), eq('onTime', false), eq('hasFeedback', true)) },
  ];
  const ranks: Rank[] = [
    { id: 'rk1', name: 'Apprentice', minXp: 0, rev: 1 }, { id: 'rk2', name: 'Sketcher', minXp: 100, rev: 1 },
    { id: 'rk3', name: 'Maker', minXp: 250, rev: 1 }, { id: 'rk4', name: 'Designer', minXp: 500, rev: 1 }, { id: 'rk5', name: 'Master Craftsperson', minXp: 900, rev: 1 },
  ];

  // ---------- projects (IP) ----------
  const projects: Project[] = [
    { id: 'p1', courseId: 'c1', title: 'Ergo-Handle (Team Kinetic)', ownerIds: ['s1', 's2', 's3', 's4'], ipStatus: 'filed', ipKind: 'design registration',
      screening: { byId: 'u-inst', at: iso(-6), note: 'Novelty confirmed vs. three prior-art searches; filed with registry.' }, portfolioReady: true, competitionEligible: true, custom: { cf3: 'BRIEF-KT-01' }, rev: 1 },
    { id: 'p2', courseId: 'c1', title: 'Modular Planter Concept', ownerIds: ['s5', 's6'], ipStatus: 'unscreened', ipKind: '—', portfolioReady: false, competitionEligible: false, custom: { cf3: 'BRIEF-MP-02' }, rev: 1 },
    { id: 'p3', courseId: 'c1', title: 'Foldable Desk Lamp', ownerIds: ['s3'], ipStatus: 'screened', ipKind: 'patent',
      screening: { byId: 'u-co', at: iso(-2), note: 'Screened: hinge mechanism potentially patentable; awaiting student decision to file.' }, portfolioReady: false, competitionEligible: false, custom: { cf3: 'BRIEF-FL-03' }, rev: 1 },
  ];
  for (const s of ['s1', 's2', 's3', 's4']) xp(s, 50, 'IP milestone — filed (Ergo-Handle)', undefined, undefined, 'xr5', 6);

  // ---------- competitions ----------
  const competitions: Competition[] = [
    { id: 'cp1', name: 'Red Dot Concept (sample)', organizer: 'Sample organiser A', coCodes: 'PD301-CO3, PD301-CO4', tags: 'concept, international', eligibility: 'Students, individual or team', deadline: day(3), prize: 'Sample: trophy + exhibition', link: 'https://example.org/comp/a', archived: false, rev: 1 },
    { id: 'cp2', name: 'National Student Ergonomics Challenge (sample)', organizer: 'Sample Ergonomics Society', coCodes: 'PD301-CO1, PD301-CO2', tags: 'ergonomics, national', eligibility: 'UG Design students', deadline: day(9), prize: 'Sample: ₹50,000', link: 'https://example.org/comp/b', archived: false, rev: 1 },
    { id: 'cp3', name: 'Sustainable Materials Prize (sample)', organizer: 'Sample Materials Council', coCodes: 'PD302-CO1, PD302-CO2', tags: 'materials, sustainability', eligibility: 'Teams up to 4', deadline: day(21), prize: 'Sample: mentorship + grant', link: 'https://example.org/comp/c', archived: false, rev: 1 },
    { id: 'cp4', name: 'Design Registration Hack-Week (sample)', organizer: 'Sample IP Cell', coCodes: 'PD301-CO5', tags: 'ip, workshop', eligibility: 'Projects with IP screening logged', deadline: day(45), prize: 'Sample: filing fee waiver', link: 'https://example.org/comp/d', archived: false, rev: 1 },
    { id: 'cp5', name: 'Teardown Teardown Cup (sample)', organizer: 'Sample Makers Club', coCodes: 'PD302-CO3', tags: 'teardown, cost', eligibility: 'Open', deadline: day(-5), prize: 'Sample: hardware kit', link: 'https://example.org/comp/e', archived: false, rev: 1 },
  ];
  const compEntries: CompEntry[] = [
    { id: id('ce'), competitionId: 'cp1', studentId: 's1', marker: 'applying', outcome: 'none', updatedAt: iso(-1) },
    { id: id('ce'), competitionId: 'cp2', studentId: 's1', marker: 'interested', outcome: 'none', updatedAt: iso(-2) },
    { id: id('ce'), competitionId: 'cp5', studentId: 's5', marker: 'applying', outcome: 'submitted', updatedAt: iso(-8) },
  ];
  xp('s5', 25, 'Competition entered', undefined, undefined, 'xr6', 8);
  xp('s1', 25, 'Competition entered (Sample Internal Showcase)', undefined, undefined, 'xr6', 12);

  // tune Aarav so the next pass triggers a rank-up (Maker at 250)
  const total = (s: string) => xpEvents.filter((e) => e.studentId === s).reduce((a, e) => a + e.points, 0);
  const manual: XPEvent = { id: id('xp'), studentId: 's1', points: 235 - total('s1'), label: 'Guest-talk participation (manual award)', kind: 'manual', justification: 'Asked two substantive questions at the visiting-designer talk; attendance sheet verified.', byId: 'u-inst', at: iso(-3, 12) };
  xpEvents.push(manual);

  // ---------- notifications ----------
  const notifications: Notification[] = [
    { id: id('nt'), userId: 's2', kind: 'feedback', title: 'Feedback received — User shadowing report', body: 'Revision requested on v1. Open your feedback inbox.', at: iso(-1, 16), read: false, page: 'feedback' },
    { id: id('nt'), userId: 's1', kind: 'peer', title: 'Peer evaluation open — Cycle 3', body: 'Due in 5 days. Your evaluation is not submitted yet.', at: iso(-1, 9), read: false, page: 'peer' },
    { id: id('nt'), userId: 's1', kind: 'milestone', title: 'Milestone unlocked — M3 Final Model', body: 'M2 feedback + peer summary published.', at: iso(-5, 9), read: true, page: 'quests' },
  ];

  const celebrations: Celebration[] = [];
  const audit: AuditEntry[] = [
    { id: id('au'), at: iso(-4, 18), actorId: 'u-inst', actorRole: 'instructor', action: 'peer.flag.resolve', entity: 'PeerEval', entityId: flagged2.id, summary: 'Flag accepted for Kabir Sethi (cycle 2)', after: 'accepted', justification: 'Reviewed with team log: rating reflects a late push in M2; retained after discussion.' },
    { id: id('au'), at: iso(-3, 12), actorId: 'u-inst', actorRole: 'instructor', action: 'xp.manual', entity: 'XPEvent', entityId: manual.id, summary: `+${manual.points} XP to Aarav Mehta`, after: String(manual.points), justification: manual.justification },
    { id: id('au'), at: iso(-6, 11), actorId: 'u-inst', actorRole: 'instructor', action: 'ip.screen', entity: 'Project', entityId: 'p1', summary: 'Ergo-Handle → filed', before: 'unscreened', after: 'filed', justification: 'Novelty confirmed vs. three prior-art searches; filed with registry.' },
  ];

  const db: DB = {
    users, outcomes, courses, cas, tasks, groups, progress, submissions, feedback, artifacts,
    peerCycles: cycles, peerEvals, effort, contributions, xpRules, ranks, xpEvents, projects, competitions, compEntries,
    notifications, celebrations, audit, pendingXp: [],
    templates: [
      { id: 'ft1', name: 'Strong work — pass', pct: 85, decision: 'pass', comment: 'Strong, well-evidenced work. Keep this standard for the next milestone.' },
      { id: 'ft2', name: 'Good — minor polish', pct: 70, decision: 'pass', comment: 'Good work overall; polish the presentation and tighten your justification.' },
      { id: 'ft3', name: 'Needs revision — depth', pct: 45, decision: 'revise', comment: 'The submission needs more depth. Please revise using the rubric and resubmit.' },
    ],
    settings: { atRiskSubmissionRate: 0.6, atRiskPeerScore: 3.2, reminderHours: 72, passPct: 50 },
    seedVersion: SEED_VERSION,
  };
  return db;
}

export function autoSummary(task: Task, scores: Record<string, number>, unticked: string[]): string {
  const strong = task.rubric.filter((k) => (scores[k.id] ?? 0) / k.max >= 0.75).map((k) => k.text);
  const weak = task.rubric.filter((k) => (scores[k.id] ?? 0) / k.max < 0.6).map((k) => k.text);
  const parts: string[] = [];
  if (strong.length) parts.push(`Strong on: ${strong.join('; ')}.`);
  if (weak.length) parts.push(`Focus next on: ${weak.join('; ')}.`);
  if (unticked.length) parts.push(`You left ${unticked.length} self-check item(s) unticked — review them before resubmitting.`);
  return parts.join(' ') || 'Solid across all criteria.';
}
