// Phase 0 — frozen data model. Every entity the mock data layer (api.ts) holds.
// `rev` on editable records powers concurrent-edit detection.

export type RoleId = 'instructor' | 'coinstructor' | 'ta' | 'hod' | 'student';

export interface User {
  id: string;
  name: string;
  role: RoleId;
  email: string;
  courseIds: string[]; // courses taught (staff) or enrolled in (student)
}

export interface OutcomeDef {
  key: string; // PO1.. / PSO1..
  title: string;
  kind: 'PO' | 'PSO';
}

export interface CO {
  id: string;
  code: string; // e.g. PD301-CO1
  text: string;
  map: Record<string, 0 | 1 | 2 | 3>; // outcome key -> correlation level
  rev: number;
}

export interface Resource {
  id: string;
  kind: 'reading' | 'software';
  title: string;
  detail: string; // author / licence
  link: string;
  rev: number;
}

export interface PlanItem {
  id: string;
  week: number;
  topic: string;
  kind: 'lecture' | 'studio' | 'review' | 'break';
  start: string; // YYYY-MM-DD
  end: string;
  rev: number;
}

export interface CustomFieldDef {
  id: string;
  label: string;
  appliesTo: 'task' | 'project';
  type: 'text' | 'number';
}

export interface PeerConfig {
  cadence: 'every-milestone' | 'fortnightly' | 'manual';
  peerWeight: number; // weights sum to 1 (peer + effort)
  effortWeight: number;
  individualShare: number; // share of mark determined by personal contribution
  floor: number; // min multiplier
  cap: number; // max multiplier
  outlierGap: number; // self-vs-peer gap that triggers a flag
}

export interface Course {
  id: string;
  code: string;
  title: string;
  semester: string;
  syllabus: string;
  objectives: string[];
  cos: CO[];
  resources: Resource[];
  plan: PlanItem[];
  customFields: CustomFieldDef[];
  peer: PeerConfig;
  disclosureGate: boolean; // IP gate on/off for this course
  rev: number;
}

export interface CA {
  id: string;
  courseId: string;
  name: string;
  weight: number; // % of course
  order: number;
  rev: number;
}

export interface RubricCriterion {
  id: string;
  text: string;
  max: number;
  selfCheck: boolean; // appears as a checkbox in the student's pre-submit checklist
}

export interface Milestone {
  id: string;
  title: string;
  due: string;
  // role rotation: studentId -> role for this milestone
  assignments: Record<string, string>;
}

export interface GroupConfig {
  groupId: string;
  roles: string[]; // lead, researcher, maker, documenter
  roleDeliverables: Record<string, string>; // what each role owns at every milestone
  milestones: Milestone[];
}

export interface Task {
  id: string;
  courseId: string;
  caId: string;
  title: string;
  brief: string; // html from tiptap
  rubric: RubricCriterion[];
  rubricVersion: number; // bumps when rubric changes (concurrent-edit notice)
  start: string;
  deadline: string; // ISO datetime
  coId: string;
  type: 'individual' | 'group';
  tools: string; // comma separated
  order: number;
  custom: Record<string, string>;
  group?: GroupConfig;
  extensions: Record<string, { until: string; reason: string }>; // studentId -> extension
  rev: number;
}

export interface Group {
  id: string;
  courseId: string;
  name: string;
  memberIds: string[];
}

export type UnitStatus = 'assigned' | 'submitted' | 'feedback' | 'revision' | 'resubmitted' | 'complete';

export interface Progress {
  key: string; // `${unitId}:${studentId}`
  unitId: string;
  studentId: string;
  status: UnitStatus;
  completedAt?: string;
}

export interface Submission {
  id: string;
  unitId: string; // taskId or `${taskId}#${milestoneId}`
  studentId: string;
  version: number;
  fileNames: string[];
  note: string; // written documentation text (paragraphs split by blank line)
  submittedAt: string; // authoritative server time
  onTime: boolean;
  unticked: string[]; // self-check criteria left unticked
  rubricVersion: number;
}

export interface Annotation {
  id: string;
  paragraph: number;
  quote: string;
  comment: string;
  by: string;
}

export interface Feedback {
  id: string;
  unitId: string;
  studentId: string;
  version: number; // submission version this feedback is tied to
  submissionId: string;
  createdAt: string;
  byId: string;
  scores: Record<string, number>; // criterionId -> points
  total: number; // % 0..100
  autoSummary: string; // rubric-based auto-feedback
  comment: string; // html (tiptap)
  annotations: Annotation[];
  decision: 'pass' | 'revise';
  peerSummary?: { avg: number; count: number; flagged: number };
  gradeHistory: { at: string; by: string; from: number; to: number; justification: string }[];
  read: boolean;
}

export interface MilestoneArtifact {
  id: string;
  taskId: string;
  milestoneId: string;
  publishedAt: string;
  byId: string;
  feedbackIds: string[];
  peerAvg: Record<string, number>; // studentId -> avg peer score
  summary: string;
}

export interface PeerCycle {
  id: string;
  taskId: string;
  milestoneId: string;
  label: string;
  opens: string;
  due: string;
  status: 'scheduled' | 'open' | 'closed';
  rev: number;
}

export const PEER_CRITERIA = ['contribution', 'reliability', 'quality', 'collaboration'] as const;
export type PeerCriterion = (typeof PEER_CRITERIA)[number];

export interface PeerEval {
  id: string;
  cycleId: string;
  evaluatorId: string;
  evaluateeId: string; // may equal evaluatorId (self rating)
  scores: Record<PeerCriterion, number>; // 1..5
  comment: string;
  submittedAt: string;
  locked: true; // never editable after submission
  flag?: {
    reason: string;
    status: 'pending' | 'accepted' | 'discarded';
    resolvedBy?: string;
    resolvedAt?: string;
    justification?: string;
  };
}

export interface EffortLog {
  id: string;
  taskId: string;
  milestoneId: string;
  studentId: string;
  hours: number;
  note: string;
  at: string;
}

export interface ContributionLog {
  id: string;
  taskId: string;
  milestoneId: string;
  studentId: string;
  text: string;
  at: string;
}

export interface XPRule {
  id: string;
  name: string;
  action: string; // human label of trigger
  points: number;
  enabled: boolean;
  conditions: unknown; // json-rules-engine conditions
  rev: number;
}

export interface Rank {
  id: string;
  name: string;
  minXp: number;
  rev: number;
}

export interface XPEvent {
  id: string;
  studentId: string;
  points: number;
  label: string;
  unitId?: string;
  version?: number;
  ruleId?: string;
  kind: 'auto' | 'manual';
  justification?: string;
  byId: string;
  at: string;
}

export type IPStatus = 'unscreened' | 'screened' | 'filed' | 'registered' | 'not_eligible';

export interface Project {
  id: string;
  courseId: string;
  title: string;
  ownerIds: string[];
  ipStatus: IPStatus;
  ipKind: 'design registration' | 'patent' | '—';
  screening?: { byId: string; at: string; note: string };
  portfolioReady: boolean;
  competitionEligible: boolean;
  custom: Record<string, string>;
  rev: number;
}

export interface Competition {
  id: string;
  name: string;
  organizer: string;
  coCodes: string; // comma separated CO codes the competition maps to
  tags: string;
  eligibility: string;
  deadline: string; // YYYY-MM-DD
  prize: string;
  link: string;
  archived: boolean;
  rev: number;
}

export interface CompEntry {
  id: string;
  competitionId: string;
  studentId: string;
  marker: 'none' | 'interested' | 'applying';
  outcome: 'none' | 'submitted' | 'shortlisted' | 'won';
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  kind: 'feedback' | 'milestone' | 'rank' | 'peer' | 'deadline' | 'xp' | 'ip' | 'system';
  title: string;
  body: string;
  at: string;
  read: boolean;
  page?: string;
}

export interface Celebration {
  id: string;
  userId: string;
  kind: 'rank' | 'milestone' | 'quest';
  title: string;
  sub: string;
  seen: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorRole: RoleId;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before?: string;
  after?: string;
  justification?: string;
}

export interface XpRequest {
  id: string;
  studentId: string;
  unitId?: string;
  version?: number;
  facts: Record<string, unknown>;
  label: string;
}

export interface FeedbackTemplate {
  id: string;
  name: string;
  pct: number; // share of max marks applied to each criterion
  decision: 'pass' | 'revise';
  comment: string;
}

export interface Settings {
  atRiskSubmissionRate: number; // below this = at risk
  atRiskPeerScore: number;
  reminderHours: number; // deadlines within N hours raise a reminder
  passPct: number;
}

export interface DB {
  users: User[];
  outcomes: OutcomeDef[];
  courses: Course[];
  cas: CA[];
  tasks: Task[];
  groups: Group[];
  progress: Progress[];
  submissions: Submission[];
  feedback: Feedback[];
  artifacts: MilestoneArtifact[];
  peerCycles: PeerCycle[];
  peerEvals: PeerEval[];
  effort: EffortLog[];
  contributions: ContributionLog[];
  xpRules: XPRule[];
  ranks: Rank[];
  xpEvents: XPEvent[];
  projects: Project[];
  competitions: Competition[];
  compEntries: CompEntry[];
  notifications: Notification[];
  celebrations: Celebration[];
  audit: AuditEntry[];
  pendingXp: XpRequest[];
  templates: FeedbackTemplate[];
  settings: Settings;
  seedVersion: number;
}

export const isMilestoneUnit = (unitId: string) => unitId.includes('#');
export const unitTask = (unitId: string) => unitId.split('#')[0];
export const unitMilestone = (unitId: string) => unitId.split('#')[1];
