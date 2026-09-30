import { useCallback } from 'react';
import type { CollectionKey } from '../../api';
import { can } from '../../api';
import { useCmd, useDb, useStore, useUser } from '../../store';
import type { Course } from '../../types';

export function useCourse(): Course {
  const db = useDb();
  const id = useStore((s) => s.courseId);
  return db.courses.find((c) => c.id === id) ?? db.courses[0];
}
export function useCan() {
  const u = useUser();
  return useCallback((action: string, sub: string) => can(u, action, sub), [u]);
}
/** Adapter: EditableGrid.onCommit → saveRows command (concurrent-edit + audit handled in the api layer). */
export function useGridCommit(collection: CollectionKey, scope: string) {
  const cmd = useCmd();
  return useCallback(
    <T extends { id: string }>(rows: T[], meta: { reason: never; label: string }) => cmd.saveRows(collection, scope, rows as never, meta as never),
    [cmd, collection, scope],
  );
}
