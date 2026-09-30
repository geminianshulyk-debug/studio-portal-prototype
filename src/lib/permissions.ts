import { AbilityBuilder, createMongoAbility, subject, type MongoAbility } from '@casl/ability';
import type { User } from '../types';

// CASL permission model. Roles are data → a fourth role means one new `case`, not a rewrite of every check.
export type AppAbility = MongoAbility<[string, string | object]>;

export function abilityFor(user: User): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  switch (user.role) {
    case 'instructor':
      can('manage', 'all');
      break;
    case 'coinstructor': // team-taught: full content control, cannot delete a course
      can('manage', 'all');
      cannot('delete', 'Course');
      break;
    case 'ta': // can grade and give feedback; cannot change XP rules or the IP gate
      can('read', ['Course', 'Task', 'Submission', 'Feedback', 'Analytics', 'Competition', 'Project', 'Plan', 'Resource', 'PeerEval', 'XPRule', 'Audit', 'Rubric']);
      can('grade', 'Submission');
      can('create', 'Feedback');
      can('read', 'Alerts');
      cannot('update', ['Rubric', 'XPRule', 'Rank', 'IPGate']);
      break;
    case 'hod': // read-only oversight
      can('read', ['Course', 'Task', 'Analytics', 'Plan', 'Resource', 'Competition', 'Project', 'Audit', 'XPRule', 'Rank', 'Rubric', 'Alerts']);
      break;
    case 'student':
      can('read', ['Course', 'Task', 'Competition', 'Plan', 'Resource']);
      can('create', ['Submission', 'PeerEval']);
      can('read', 'Feedback', { studentId: user.id });
      can('read', 'Project', { ownerIds: user.id });
      can('update', 'Project', { ownerIds: user.id });
      can('update', 'CompEntry', { studentId: user.id });
      can('create', ['EffortLog', 'ContributionLog']);
      break;
  }
  return build();
}

export const PERM_SUBJECTS = ['Course', 'Task', 'Rubric', 'Submission', 'Feedback', 'PeerEval', 'XPRule', 'Rank', 'IPGate', 'Competition', 'Analytics', 'Audit'];
export const PERM_ACTIONS = ['read', 'update', 'grade', 'delete'];
export { subject };
