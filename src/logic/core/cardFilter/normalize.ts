// src/logic/core/cardFilter/normalize.ts
// Normalizes raw filter specs into a canonical format.

import { CardFilterSpec, NormalizedCardFilter } from "./types.js";

function toLowerSafe(s: any): string {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function toNumOrNull(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalizes a raw CardFilterSpec into a NormalizedCardFilter.
 * Handles all known aliases for filter fields.
 */
export function normalizeCardFilter(
  spec: CardFilterSpec | any,
): NormalizedCardFilter {
  const f = spec || {};

  // Name (exact match)
  const name = toLowerSafe(f.name) || null;

  // Type and Class
  const type = toLowerSafe(f.type) || null;
  const cls = toLowerSafe(f.class) || null;

  // Cost
  const costEq = toNumOrNull(f.cost_eq);
  const costLte = toNumOrNull(f.cost_lte);
  const costGte = toNumOrNull(f.cost_gte);

  // Attack
  const atkEq = toNumOrNull(f.attack_eq);
  const atkLte = toNumOrNull(f.attack_lte);
  const atkGte = toNumOrNull(f.attack_gte);

  // Defense
  const defEq = toNumOrNull(f.defense_eq);
  const defLte = toNumOrNull(f.defense_lte);
  const defGte = toNumOrNull(f.defense_gte);

  // Tribe (multiple alias support)
  // LEGACY: Supports tribe, tribes, tribe_in, tribes_in as aliases
  const tribeRaw = f.tribe_in ?? f.tribe ?? f.tribes ?? f.tribes_in ?? null;
  const tribeList = Array.isArray(tribeRaw)
    ? tribeRaw.map(toLowerSafe).filter(Boolean)
    : tribeRaw
      ? [toLowerSafe(tribeRaw)]
      : [];

  return {
    name,
    type,
    class: cls,
    costEq,
    costLte,
    costGte,
    atkEq,
    atkLte,
    atkGte,
    defEq,
    defLte,
    defGte,
    tribeList,
  };
}
