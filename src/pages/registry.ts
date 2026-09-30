import type { ComponentType } from 'react';
import FeatureMap from './FeatureMap';

export interface PageDef { id: string; label: string; icon: string; group: string; comp: ComponentType; badge?: 'alerts' | 'notifs' | 'feedback' }
// Hick's Law: ≤ 4 groups, ≤ 6 items per group. Dense configuration hides behind tabs (progressive disclosure).
export const ADMIN_PAGES: PageDef[] = [];
export const STUDENT_PAGES: PageDef[] = [];
export const SHARED: Record<string, ComponentType> = { map: FeatureMap };
