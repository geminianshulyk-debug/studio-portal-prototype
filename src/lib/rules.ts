import { Engine } from 'json-rules-engine';
import type { XPRule } from '../types';

export interface XpAward { ruleId: string; points: number; label: string }

/**
 * XP economy as data: every XPRule carries json-rules-engine conditions + a points value.
 * Editing a rule in the XP table changes behaviour with no code change.
 */
export async function evaluateXp(rules: XPRule[], facts: Record<string, unknown>): Promise<XpAward[]> {
  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const r of rules.filter((x) => x.enabled)) {
    try {
      engine.addRule({
        name: r.id,
        conditions: JSON.parse(JSON.stringify(r.conditions)),
        event: { type: 'xp', params: { ruleId: r.id, points: r.points, label: r.name } },
      });
    } catch {
      /* invalid condition JSON → rule inert; the XP table validates on edit */
    }
  }
  const { events } = await engine.run(facts);
  return events.map((e) => e.params as XpAward);
}

export function validateConditions(json: string): string | null {
  try {
    const c = JSON.parse(json);
    const e = new Engine();
    e.addRule({ conditions: c, event: { type: 'x' } });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
