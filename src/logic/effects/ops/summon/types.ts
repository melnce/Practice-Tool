// src/logic/effects/ops/summon/types.ts
// Unified summon types and normalization.

import type { Effect, Player, CardInstance } from "../../../../core/types/index.js";

// ============================================================================
// SOURCE & SCOPE TYPES
// ============================================================================

/**
 * Source of the card(s) to summon.
 *
 * - `named`: Summon by card name (token/named card)
 * - `copy`: Copy an existing card on board
 * - `deck`: Random follower from deck
 * - `graveyard`: Reanimate from graveyard (includes "destroyed this match")
 * - `hand`: Select from hand and summon copy
 */
export type SummonSource = "named" | "copy" | "deck" | "graveyard" | "hand";

/**
 * Target scope for copy source.
 *
 * - `self`: Copy the source card
 * - `target`: Copy a selected target
 */
export type CopyScope = "self" | "target";

// ============================================================================
// UNIFIED SPEC
// ============================================================================

/**
 * Canonical unified summon effect spec.
 * All summon operations normalize to this format internally.
 *
 * ## Examples
 *
 * `{ "op": "summon", "source": "named", "name": "Fairy" }`
 * `{ "op": "summon", "source": "copy", "copy_scope": "self" }`
 * `{ "op": "summon", "source": "deck", "filter": { "type": "Follower" } }`
 * `{ "op": "summon", "source": "graveyard", "cost": 5 }`
 */
export interface UnifiedSummonSpec {
  /** Source of summon. Default: "named" */
  source: SummonSource;

  /** Card name (for source: "named"). */
  name: string | null;

  /** Count of copies to summon. Default: 1 */
  count: number;

  /** Owner of summoned cards. "self" or "enemy". Default: "self" */
  owner: "self" | "enemy";

  /** Scope for copy source. Default: "self" */
  copy_scope: CopyScope;

  /** Filter criteria (for deck summon). */
  filter: SummonFilter | null;

  /** Max cost for reanimate. */
  cost: number | null;
}

/**
 * Filter for deck-based summon.
 */
export interface SummonFilter {
  type?: "Follower" | "Amulet" | "Spell";
  class?: string;
  tribe?: string;
  cost?: number;
  cost_max?: number;
  cost_min?: number;
}

/**
 * Context for summon operations.
 */
export interface SummonContext {
  owner: Player;
  sourceCard: CardInstance | null;
  targets?: CardInstance[];
  [key: string]: any;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalizes any summon effect to canonical UnifiedSummonSpec.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedSummonSpec {
  const op = String(eff.op || "").toLowerCase();

  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  if (eff.source === undefined) {
    throw new Error(
      `[summon] Missing required field: "source". Must be "named", "copy", "deck", "graveyard", or "hand". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const source = eff.source as SummonSource;

  // For named source, name is required
  if (source === "named" && !eff.name) {
    throw new Error(
      `[summon] source="named" requires "name" field. Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedSummonSpec = {
    source,
    name: null,
    count: 1,
    owner: "self",
    copy_scope: "self",
    filter: null,
    cost: null,
  };

  // Parse common fields
  if (eff.name) spec.name = eff.name;
  if (eff.count !== undefined)
    spec.count = Math.max(1, parseInt(String(eff.count), 10) || 1);
  if (eff.cost !== undefined) spec.cost = parseInt(String(eff.cost), 10);

  // Parse filter
  if (eff.filter) spec.filter = eff.filter as SummonFilter;
  if (eff.condition) spec.filter = eff.condition as SummonFilter;

  // Parse owner
  if (eff.owner === "enemy" || op === "summon_named_enemy") {
    spec.owner = "enemy";
  }

  // Derive source from legacy op names (only if not already set)
  // NOTE: spec.source is already set from eff.source on line 112
  // These cases handle legacy op names that imply a source
  switch (op) {
    case "summon_named":
    case "summon_named_enemy":
      spec.source = "named";
      break;

    case "summon_exact_copy":
      spec.source = "copy";
      if (eff.target === "self") {
        spec.copy_scope = "self";
      } else {
        spec.copy_scope = "target";
      }
      break;

    case "summon_random_from_deck":
      spec.source = "deck";
      break;

    case "reanimate":
      spec.source = "graveyard";
      break;

    // For op="summon", use the explicit source from the effect (already set)
    default:
      break;
  }

  return spec;
}












