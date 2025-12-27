// src/logic/effects/ops/restore/types.ts
// Unified restore types and normalization.

import type { Effect, Player, CardInstance } from "../../../../core/types/index.js";

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
export type RestoreTarget = "leader" | "self" | "allies" | "followers";

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
 * | target         | string  | "leader"  | What to restore (leader/self/allies/followers) |
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
 * SUPPORTS COMPOSITE TARGETS: ally:leader, enemy:leader, ally:follower
 * These are parsed and the player field is auto-derived.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedRestoreSpec {
  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  if (eff.target === undefined) {
    throw new Error(
      `[restore] Missing required field: "target". Must be "leader", "self", "allies", "ally:leader", "enemy:leader", or "ally:follower". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedRestoreSpec = {
    target: "leader" as RestoreTarget,
    amount: 0,
    amount_source: "fixed",
    player: "self" as "self" | "opponent",
    store_restored_as: null,
  };

  // ========================================================================
  // PARSE COMPOSITE TARGETS (ally:leader, enemy:leader, ally:follower, etc.)
  // ========================================================================
  const targetStr = String(eff.target);

  if (targetStr.startsWith("ally:") || targetStr.startsWith("enemy:")) {
    // Parse composite target
    const parts = targetStr.split(":");
    const ownership = parts[0]; // "ally" or "enemy"
    const zone = parts[1];      // "leader", "follower", etc.

    // Derive player from ownership
    spec.player = ownership === "ally" ? "self" : "opponent";

    // Map zone to RestoreTarget
    if (zone === "leader") {
      spec.target = "leader";
    } else if (zone === "follower" || zone === "board") {
      spec.target = "followers"; // Just followers, not leader
    } else {
      spec.target = zone as RestoreTarget;
    }
  } else {
    // Simple target (leader, self, allies)
    spec.target = targetStr as RestoreTarget;

    // Require player field for simple targets
    if (eff.player === undefined && targetStr !== "self") {
      throw new Error(
        `[restore] Missing required field: "player" for target "${targetStr}". ` +
        `Use composite targets like "ally:leader" or "enemy:leader" for cleaner schema. ` +
        `Effect: ${JSON.stringify(eff)}`,
      );
    }
    if (eff.player !== undefined) {
      spec.player = eff.player as "self" | "opponent";
    }
  }

  // Parse amount
  if (eff.amount !== undefined) {
    const n = parseInt(String(eff.amount), 10);
    spec.amount = Number.isFinite(n) ? n : 0;
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















