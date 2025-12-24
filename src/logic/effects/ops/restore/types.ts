// src/logic/effects/ops/restore/types.ts
// Unified restore types and normalization.

import { Effect, Player, CardInstance } from "../../../../core/types.js";

// ============================================================================
// TARGET & AMOUNT SOURCE TYPES
// ============================================================================

/**
 * Target specification for restore operations.
 *
 * - `leader`: Restore leader HP only
 * - `self`: Restore source card's defense
 * - `allies`: Restore all allied followers
 */
export type RestoreTarget = "leader" | "self" | "allies";

/**
 * Amount source for restore operations.
 *
 * - `fixed`: Use amount field directly
 * - `full`: Restore to full HP/defense
 * - `hand_size`: Amount = hand card count
 * - `context.*`: Read from context variable (e.g., "context.restore_amount")
 */
export type RestoreAmountSource = "fixed" | "full" | "hand_size" | string;

// ============================================================================
// UNIFIED SPEC
// ============================================================================

/**
 * Canonical unified restore effect spec.
 * All restore operations normalize to this format internally.
 *
 * ## Fields
 *
 * | Field          | Type    | Default   | Description                     |
 * |----------------|---------|-----------|----------------------------------|
 * | target         | string  | "leader"  | What to restore (leader/self/allies) |
 * | amount         | number  | 0         | Fixed amount to restore          |
 * | amount_source  | string  | "fixed"   | How to derive amount            |
 * | player         | string  | "self"    | Which player (self/opponent)    |
 */
export interface UnifiedRestoreSpec {
  /** Target to restore. Default: "leader" */
  target: RestoreTarget;

  /** Fixed amount to restore. Default: 0 */
  amount: number;

  /** Amount derivation. Default: "fixed" */
  amount_source: RestoreAmountSource;

  /** Which player. Default: "self" */
  player: "self" | "opponent";

  /** Store restored amount in context variable for chaining. */
  store_restored_as: string | null;
}

/**
 * Context for restore operations.
 */
export interface RestoreContext {
  owner: Player;
  sourceCard: CardInstance | null;
  effectsQueue?: Effect[];
  [key: string]: any;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalizes any restore/heal effect to a canonical UnifiedRestoreSpec.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedRestoreSpec {
  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  if (eff.target === undefined) {
    throw new Error(
      `[restore] Missing required field: "target". Must be "leader", "self", or "allies". Effect: ${JSON.stringify(eff)}`,
    );
  }
  if (eff.player === undefined) {
    throw new Error(
      `[restore] Missing required field: "player". Must be "self" or "opponent". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedRestoreSpec = {
    target: eff.target as RestoreTarget,
    amount: 0,
    amount_source: "fixed",
    player: eff.player as "self" | "opponent",
    store_restored_as: null,
  };

  // Parse amount
  if (eff.amount !== undefined) {
    const n = parseInt(String(eff.amount), 10);
    spec.amount = Number.isFinite(n) ? n : 0;
  }

  // Parse player
  if (eff.player === "opponent") {
    spec.player = "opponent";
  }

  // Parse explicit target
  if (eff.target) {
    spec.target = eff.target as RestoreTarget;
  }

  // Parse explicit amount_source
  if (eff.amount_source) {
    spec.amount_source = eff.amount_source as RestoreAmountSource;
  }

  // Parse explicit store_restored_as
  if (eff.store_restored_as) {
    spec.store_restored_as = eff.store_restored_as;
  }

  return spec;
}















