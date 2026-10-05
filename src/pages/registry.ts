import type { ComponentType } from 'react';
import {
  BarChart3, BellRing, BookOpen, CalendarRange, Compass, FlaskConical, Flag, FolderKanban, House, KeyRound, Library, Map as MapIcon,
  MessageSquareText, PenLine, ScrollText, ShieldCheck, Sparkles, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import FeatureMap from './FeatureMap';
import HomePage from './admin/HomePage';
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

export interface PageDef { id: string; label: string; icon: LucideIcon; group: string; comp: ComponentType; badge?: 'alerts' | 'notifs' | 'feedback'; hidden?: boolean }
// Hick's Law: ≤ 4 groups, ≤ 6 items per group. Dense configuration hides behind tabs (progressive disclosure).
export const ADMIN_PAGES: PageDef[] = [
  { id: 'home', label: 'Home', icon: House, group: '', comp: HomePage },
  { id: 'course', label: 'Course & outcomes', icon: BookOpen, group: 'Teach', comp: CoursePage },
  { id: 'tasks', label: 'CA & tasks', icon: FolderKanban, group: 'Teach', comp: TasksPage },
  { id: 'plan', label: 'Gantt & plan', icon: CalendarRange, group: 'Teach', comp: PlanPage },
  { id: 'resources', label: 'Resources', icon: Library, group: 'Teach', comp: ResourcesPage },
  { id: 'groups', label: 'Group & peer', icon: Users, group: 'Teach', comp: GroupsPage },
  { id: 'grading', label: 'Grading queue', icon: PenLine, group: 'Assess', comp: GradingPage },
  { id: 'alerts', label: 'Notification center', icon: BellRing, group: 'Assess', comp: AlertsPage, badge: 'alerts' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Assess', comp: AnalyticsPage },
  { id: 'ip', label: 'IP screening', icon: ShieldCheck, group: 'Govern', comp: IPPage },
  { id: 'competitions', label: 'Competitions CMS', icon: Flag, group: 'Govern', comp: CompetitionsAdmin },
  { id: 'xp', label: 'XP rule engine', icon: Sparkles, group: 'Govern', comp: XPPage },
  { id: 'audit', label: 'Audit log', icon: ScrollText, group: 'Govern', comp: AuditPage },
  { id: 'access', label: 'Roles & access', icon: KeyRound, group: 'Govern', comp: AccessPage },
  { id: 'integrity', label: 'Integrity lab', icon: FlaskConical, group: 'Govern', comp: IntegrityPage },
];
export const STUDENT_PAGES: PageDef[] = [
  { id: 'dashboard', label: 'Home', icon: House, group: '', comp: Dashboard },
  { id: 'quests', label: 'Quest map', icon: MapIcon, group: '', comp: QuestsPage },
  { id: 'feedback', label: 'Feedback', icon: MessageSquareText, group: '', comp: FeedbackInbox, badge: 'feedback' },
  { id: 'peer', label: 'Peer review', icon: Users, group: '', comp: PeerPage },
  { id: 'xp', label: 'XP & skills', icon: Sparkles, group: 'Grow', comp: XPSkills },
  { id: 'portfolio', label: 'Portfolio & IP', icon: ShieldCheck, group: 'Grow', comp: Portfolio },
  { id: 'competitions', label: 'Competitions', icon: Trophy, group: 'Grow', comp: CompetitionsStudent },
  { id: 'notifications', label: 'Notifications', icon: BellRing, group: 'Grow', comp: Notifications, badge: 'notifs', hidden: true },
];
export const TOUR: PageDef = { id: 'map', label: 'Prototype tour', icon: Compass, group: '', comp: FeatureMap };
export const SHARED: Record<string, ComponentType> = { map: FeatureMap };
