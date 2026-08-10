// src/logic/effects/ops/evolve/types.ts

import type { Effect } from "../../../../core/types/index.js";

/**
 * Target for an evolve operation.
 */
export type EvolveTarget =
  | "self" // Source card
  | "played_card" // Card being played (alias for self during fanfare/spell)
  | "selected" // Player-selected target (from context)
  | "last_summoned" // Cards in state.lastSummoned
  | "all_allies" // All allied unevolved followers
  | string; // Named card filter

/**
 * Mode for evolution.
 */
export type EvolveMode = "normal" | "super";

/**
 * Unified specification for all evolve operations.
 * Replaces 8 legacy evolve ops.
 */
export interface UnifiedEvolveSpec {
  op: "evolve";

  /** Target for evolution (defaults to "selected") */
  target?: EvolveTarget;

  /** Evolution mode: normal (+2/+2) or super (+3/+3) */
  mode?: EvolveMode;

  /** Named card filter for all_allies targeting */
  name?: string;

  /** Whether to spend evolution point (default: false for effect-triggered evolutions) */
  spend_point?: boolean;

  /** Number of targets to select (triggers selection UI) */
  select?: number;

  /** Filter conditions for selection pool */
  filter?: {
    unevolved?: boolean;
    not_self?: boolean;
    did_not_attack_this_turn?: boolean;
    type?: string;
    tribe?: string;
  };

  /** When set with select, pick targets randomly instead of opening selection UI */
  select_mode?: "random";
}

/**
 * Normalizes an evolve effect. STRICT MODE - legacy ops throw errors.
 */
export function normalizeToEvolveSpec(eff: Effect): UnifiedEvolveSpec {
  const op = eff.op as string;

  // ==========================================================================
  // STRICT: Only accept "evolve" op
  // ==========================================================================
  if (op !== "evolve") {
    throw new Error(
      `[evolve] Invalid op: "${op}". Legacy ops are removed. ` +
        `Use { "op": "evolve", "target": "...", "mode": "..." }. ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // ==========================================================================
  // REQUIRED: target field (no silent defaults)
  // ==========================================================================
  const effAny = eff as any;
  if (effAny.target === undefined) {
    throw new Error(
      `[evolve] Missing required field: "target". ` +
        `Use "self", "selected:follower", "last_summoned", "all_allies", or "ally:follower". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedEvolveSpec = {
    op: "evolve",
    target: effAny.target,
    mode: effAny.mode,
    name: effAny.name,
    spend_point: effAny.spend_point,
    select: effAny.select,
    select_mode: effAny.select_mode,
    filter: effAny.filter,
  };

  return spec;
}
