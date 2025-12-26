// src/logic/effects/ops/draw/types.ts
// Types for the DRAW operation - deck only, thins deck.
// For token generation, use "add" op
// For card duplication, use "copy" op

import { Effect } from "../../../../core/types/index.js";

// ============================================================================
// CANONICAL UNIFIED TYPES
// ============================================================================

/**
 * Draw mode determines selection order when filtering.
 *
 * - `topmost`: Draw from top of deck (highest indices first) - default
 * - `random`: Shuffle matching cards, then draw
 */
export type DrawMode = "topmost" | "random";

/**
 * Who performs the draw.
 *
 * - `self`: The effect owner draws (default)
 * - `opponent`: The opponent draws
 */
export type DrawPlayer = "self" | "opponent";

/**
 * Count specification for draw operations.
 *
 * - number: Draw exactly N cards
 * - `"all"`: Draw all matching cards
 * - `"combo"`: Draw equal to combo count
 */
export type DrawCount = number | "all" | "combo";

/**
 * CANONICAL FORMAT for draw op:
 * {
 *   "op": "draw",
 *   "source": "deck",           // REQUIRED - must be "deck" (only valid source)
 *   "count": 1,                 // REQUIRED - how many to draw
 *   "player": "self" | "opponent"  // optional - who draws, default: self
 * }
 */

export interface UnifiedDrawSpec {
  /** Must be "deck" - draw only operates on deck */
  source: "deck";

  /** How many cards to draw. REQUIRED */
  count: DrawCount;

  /** Who draws - owner or opponent. Default: "self" */
  player: DrawPlayer;
}

// ============================================================================
// NORMALIZATION - STRICT MODE
// ============================================================================

/**
 * Normalize an Effect to a UnifiedDrawSpec.
 *
 * STRICT MODE: Throws errors on invalid format.
 * Draw is now deck-only. For token generation, use "add" op.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedDrawSpec {
  // ========================================================================
  // REQUIRED: source must be "deck"
  // ========================================================================
  if (eff.source === undefined) {
    throw new Error(
      `[draw] Missing required field: "source". Must be "deck". ` +
      `For token generation, use "add" op. For duplication, use "copy" op. ` +
      `Effect: ${JSON.stringify(eff)}`,
    );
  }

  const sourceRaw = String(eff.source).toLowerCase().trim();
  if (sourceRaw !== "deck") {
    throw new Error(
      `[draw] Invalid source: "${eff.source}". Must be "deck". ` +
      `For token generation (source: "named"), use { "op": "add", "name": "...", "count": N }. ` +
      `For duplication (source: "copy"), use { "op": "copy", "target": "...", "count": N }. ` +
      `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // ========================================================================
  // REQUIRED: count
  // ========================================================================
  if (eff.count === undefined) {
    throw new Error(
      `[draw] Missing required field: "count". Effect: ${JSON.stringify(eff)}`,
    );
  }
  let count: DrawCount;
  if (eff.count === "all" || eff.count === "combo") {
    count = eff.count;
  } else {
    const n = parseInt(String(eff.count), 10);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(
        `[draw] Invalid count: "${eff.count}". Must be non-negative number, "all", or "combo".`,
      );
    }
    count = n;
  }

  // ========================================================================
  // OPTIONAL: player (default: "self")
  // ========================================================================
  const playerRaw = String(eff.player || "self").toLowerCase().trim();
  const player: DrawPlayer = playerRaw === "opponent" ? "opponent" : "self";

  return {
    source: "deck",
    count,
    player,
  };
}

// ============================================================================
// VALIDATION (dev-only)
// ============================================================================

/**
 * Validates a UnifiedDrawSpec for logical consistency.
 * Returns warnings (does not throw).
 */
export function validateUnifiedSpec(spec: UnifiedDrawSpec): string[] {
  const warnings: string[] = [];
  // Draw is now simple - no validation needed beyond normalization
  return warnings;
}
