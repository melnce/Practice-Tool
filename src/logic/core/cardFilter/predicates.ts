// src/logic/core/cardFilter/predicates.ts
// Builds card filter predicates from normalized filters.

import { CardInstance } from "../../../core/types/index.js";
import { NormalizedCardFilter, CardPredicate } from "./types.js";

function toLowerSafe(s: any): string {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/**
 * Builds a pure predicate function from a normalized filter.
 * The predicate returns true if the card matches ALL filter criteria.
 *
 * LEGACY: Uses current card values (cost, attack, defense), not base values.
 * This matches the original handleDrawFiltered behavior.
 */
export function buildCardPredicate(
  filter: NormalizedCardFilter,
): CardPredicate {
  return (c: CardInstance): boolean => {
    const cName = toLowerSafe(c.name);
    const cType = toLowerSafe(c.type);
    const cClass = toLowerSafe(c.class);
    const cCost = Number(c.cost);
    const cAtk = Number(c.attack);
    const cDef = Number(c.defense);

    // Name filter (exact match)
    if (filter.name && cName !== filter.name) return false;

    // Type filter
    if (filter.type && cType !== filter.type) return false;

    // Class filter
    if (filter.class && cClass !== filter.class) return false;

    // Cost filters
    if (filter.costEq != null && cCost !== filter.costEq) return false;
    if (filter.costLte != null && !(cCost <= filter.costLte)) return false;
    if (filter.costGte != null && !(cCost >= filter.costGte)) return false;

    // Attack filters
    if (filter.atkEq != null && cAtk !== filter.atkEq) return false;
    if (filter.atkLte != null && !(cAtk <= filter.atkLte)) return false;
    if (filter.atkGte != null && !(cAtk >= filter.atkGte)) return false;

    // Defense filters
    if (filter.defEq != null && cDef !== filter.defEq) return false;
    if (filter.defLte != null && !(cDef <= filter.defLte)) return false;
    if (filter.defGte != null && !(cDef >= filter.defGte)) return false;

    // Tribe filter
    if (filter.tribeList.length) {
      const cardTribes = Array.isArray(c.tribes)
        ? c.tribes.map(toLowerSafe)
        : [];
      const hasOne = filter.tribeList.some((t: string) =>
        cardTribes.includes(t),
      );
      if (!hasOne) return false;
    }

    return true;
  };
}















