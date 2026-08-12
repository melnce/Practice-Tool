import type { Condition } from "./types.js";

/**
 * Evaluate a condition against a bag of drawn cards.
 * `keyCounts` maps card key → copies seen; `costCounts` maps cost → copies seen.
 */
export function evalCondition(
  condition: Condition,
  keyCounts: ReadonlyMap<string, number>,
  costCounts: ReadonlyMap<number, number>,
): boolean {
  switch (condition.kind) {
    case "cards": {
      let total = 0;
      for (const key of condition.keys) {
        total += keyCounts.get(key) ?? 0;
      }
      return total >= condition.atLeast;
    }
    case "costs": {
      let total = 0;
      for (const cost of condition.costs) {
        total += costCounts.get(cost) ?? 0;
      }
      return total >= condition.atLeast;
    }
    case "and":
      return condition.of.every((c) => evalCondition(c, keyCounts, costCounts));
    case "or":
      return condition.of.some((c) => evalCondition(c, keyCounts, costCounts));
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}

/** Increment maps for one drawn card (mutates). */
export function addCardToCounts(
  key: string,
  cost: number,
  keyCounts: Map<string, number>,
  costCounts: Map<number, number>,
): void {
  keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  costCounts.set(cost, (costCounts.get(cost) ?? 0) + 1);
}
