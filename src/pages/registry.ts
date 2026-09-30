import type { ComponentType } from 'react';
import FeatureMap from './FeatureMap';
import CoursePage from './admin/CoursePage';
import TasksPage from './admin/TasksPage';
import PlanPage from './admin/PlanPage';
import ResourcesPage from './admin/ResourcesPage';

export interface PageDef { id: string; label: string; icon: string; group: string; comp: ComponentType; badge?: 'alerts' | 'notifs' | 'feedback' }
// Hick's Law: ≤ 4 groups, ≤ 6 items per group. Dense configuration hides behind tabs (progressive disclosure).
export const ADMIN_PAGES: PageDef[] = [
  { id: 'course', label: 'Course & outcomes', icon: '📘', group: 'Teach', comp: CoursePage },
  { id: 'tasks', label: 'CA & tasks', icon: '🗂', group: 'Teach', comp: TasksPage },
  { id: 'plan', label: 'Gantt & plan', icon: '📅', group: 'Teach', comp: PlanPage },
  { id: 'resources', label: 'Resources', icon: '📚', group: 'Teach', comp: ResourcesPage },
];
export const STUDENT_PAGES: PageDef[] = [];
export const SHARED: Record<string, ComponentType> = { map: FeatureMap };
