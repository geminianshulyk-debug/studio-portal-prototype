import type { ComponentType } from 'react';
import FeatureMap from './FeatureMap';
import CoursePage from './admin/CoursePage';
import TasksPage from './admin/TasksPage';
import PlanPage from './admin/PlanPage';
import ResourcesPage from './admin/ResourcesPage';
import GroupsPage from './admin/GroupsPage';
import GradingPage from './admin/GradingPage';
import IPPage from './admin/IPPage';
import CompetitionsAdmin from './admin/CompetitionsAdmin';
import XPPage from './admin/XPPage';
import AnalyticsPage from './admin/AnalyticsPage';
import Dashboard from './student/Dashboard';
import QuestsPage from './student/QuestsPage';
import FeedbackInbox from './student/FeedbackInbox';
import PeerPage from './student/PeerPage';
import { XPSkills, Portfolio, CompetitionsStudent, Notifications } from './student/StudentMisc';
import { AuditPage, AlertsPage, AccessPage, IntegrityPage } from './admin/GovernPages';

export interface PageDef { id: string; label: string; icon: string; group: string; comp: ComponentType; badge?: 'alerts' | 'notifs' | 'feedback' }
// Hick's Law: ≤ 4 groups, ≤ 6 items per group. Dense configuration hides behind tabs (progressive disclosure).
export const ADMIN_PAGES: PageDef[] = [
  { id: 'course', label: 'Course & outcomes', icon: '📘', group: 'Teach', comp: CoursePage },
  { id: 'tasks', label: 'CA & tasks', icon: '🗂', group: 'Teach', comp: TasksPage },
  { id: 'plan', label: 'Gantt & plan', icon: '📅', group: 'Teach', comp: PlanPage },
  { id: 'resources', label: 'Resources', icon: '📚', group: 'Teach', comp: ResourcesPage },
  { id: 'groups', label: 'Group & peer', icon: '👥', group: 'Teach', comp: GroupsPage },
  { id: 'alerts', label: 'Notification center', icon: '🔔', group: 'Assess', comp: AlertsPage, badge: 'alerts' },
  { id: 'grading', label: 'Grading queue', icon: '✍️', group: 'Assess', comp: GradingPage },
  { id: 'analytics', label: 'Analytics', icon: '📊', group: 'Assess', comp: AnalyticsPage },
  { id: 'ip', label: 'IP screening', icon: '🛡', group: 'Govern', comp: IPPage },
  { id: 'competitions', label: 'Competitions CMS', icon: '🏁', group: 'Govern', comp: CompetitionsAdmin },
  { id: 'xp', label: 'XP rule engine', icon: '⚡', group: 'Govern', comp: XPPage },
  { id: 'audit', label: 'Audit log', icon: '📜', group: 'Govern', comp: AuditPage },
  { id: 'access', label: 'Roles & access', icon: '🔑', group: 'Govern', comp: AccessPage },
  { id: 'integrity', label: 'Integrity lab', icon: '🧪', group: 'Govern', comp: IntegrityPage },
];
export const STUDENT_PAGES: PageDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', group: 'Play', comp: Dashboard },
  { id: 'quests', label: 'Quest map', icon: '🗺', group: 'Play', comp: QuestsPage },
  { id: 'feedback', label: 'Feedback inbox', icon: '💬', group: 'Play', comp: FeedbackInbox, badge: 'feedback' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', group: 'Play', comp: Notifications, badge: 'notifs' },
  { id: 'peer', label: 'Peer evaluation', icon: '👥', group: 'Grow', comp: PeerPage },
  { id: 'xp', label: 'XP & skills', icon: '⚡', group: 'Grow', comp: XPSkills },
  { id: 'portfolio', label: 'Portfolio & IP', icon: '🛡', group: 'Grow', comp: Portfolio },
  { id: 'competitions', label: 'Competitions', icon: '🏁', group: 'Grow', comp: CompetitionsStudent },
];
export const SHARED: Record<string, ComponentType> = { map: FeatureMap };
