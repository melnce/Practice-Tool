// src/logic/effects/ops/draw/types.ts
// Unified types for draw operations.

import { Effect, Player, CardInstance } from "../../../../core/types.js";
import { CardFilterSpec } from "../../../core/cardFilter/types.js";

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
 * Draw source determines where cards come from.
 *
 * - `deck`: Draw from deck (default, traditional draw)
 * - `named`: Generate card by name (token generation)
 * - `copy`: Copy selected/target card
 */
export type DrawSource = "deck" | "named" | "copy";

/**
 * Canonical unified draw effect spec.
 * All draw operations normalize to this format internally.
 *
 * ## Field Summary
 *
 * | Field    | Type          | Default   | Description                      |
 * |----------|---------------|-----------|----------------------------------|
 * | source   | string        | "deck"    | Where cards come from            |
 * | name     | string        | null      | Card name (for source: "named")  |
 * | count    | number/string | 1         | How many cards to draw           |
 * | player   | string        | "self"    | Who draws the cards              |
 * | filters  | object        | null      | Card filter criteria             |
 * | mode     | string        | "topmost" | Selection order for filters      |
 * | keywords | string[]      | []        | Keywords to apply to drawn cards |
 */
export interface UnifiedDrawSpec {
  /** Where cards come from. Default: "deck" */
  source: DrawSource;

  /** Card name for source: "named". Null otherwise */
  name: string | null;

  /** How many cards to draw. Default: 1 */
  count: DrawCount;

  /** Who draws - owner or opponent. Default: "self" */
  player: DrawPlayer;

  /** Optional filters for deck search. Null = draw from top (no filter) */
  filters: CardFilterSpec | null;

  /** Selection mode when filtering. Default: "topmost" */
  mode: DrawMode;

  /** Keywords to apply to drawn cards. Default: [] */
  keywords: string[];
}

/**
 * Context for draw operations.
 */
export interface DrawContext {
  owner: Player;
  sourceCard: CardInstance | null;
}

// ============================================================================
// NORMALIZATION - STRICT MODE
// ============================================================================

/**
 * Normalize an Effect to a UnifiedDrawSpec.
 *
 * STRICT MODE: Throws errors on missing required fields.
 * This is intentional - we want bugs to surface immediately, not silently.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedDrawSpec {
  // ========================================================================
  // REQUIRED: source
  // ========================================================================
  if (eff.source === undefined) {
    throw new Error(
      `[draw] Missing required field: "source". Must be: "deck", "named", or "copy". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const sourceRaw = String(eff.source).toLowerCase().trim();
  if (sourceRaw !== "deck" && sourceRaw !== "named" && sourceRaw !== "copy") {
    throw new Error(
      `[draw] Invalid source: "${eff.source}". Must be: "deck", "named", or "copy".`,
    );
  }
  const source: DrawSource = sourceRaw as DrawSource;

  // ========================================================================
  // REQUIRED when source=named: name
  // ========================================================================
  let name: string | null = null;
  if (source === "named") {
    if (!eff.name || typeof eff.name !== "string" || !eff.name.trim()) {
      throw new Error(
        `[draw] source="named" requires "name" field. Effect: ${JSON.stringify(eff)}`,
      );
    }
    name = eff.name.trim();
  }

  // ========================================================================
  // REQUIRED: count (for deck/copy sources)
  // ========================================================================
  let count: DrawCount;
  if (source === "deck" || source === "copy") {
    if (eff.count === undefined) {
      throw new Error(
        `[draw] Missing required field: "count". Effect: ${JSON.stringify(eff)}`,
      );
    }
    if (eff.count === "all" || eff.count === "combo") {
      count = eff.count;
    } else {
      const n = parseInt(String(eff.count), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(
          `[draw] Invalid count: "${eff.count}". Must be positive number, "all", or "combo".`,
        );
      }
      count = n;
    }
  } else {
    // For named, count is optional (defaults to 1 for token gen)
    if (eff.count !== undefined) {
      if (eff.count === "all" || eff.count === "combo") {
        count = eff.count;
      } else {
        const n = parseInt(String(eff.count), 10);
        count = Number.isFinite(n) && n > 0 ? n : 1;
      }
    } else {
      count = 1;
    }
  }

  // ========================================================================
  // OPTIONAL: player (default: "self" is acceptable here)
  // ========================================================================
  const playerRaw = String(eff.player || "self")
    .toLowerCase()
    .trim();
  const player: DrawPlayer = playerRaw === "opponent" ? "opponent" : "self";

  // ========================================================================
  // OPTIONAL: filters (only for source: deck)
  // ========================================================================
  let filters: CardFilterSpec | null = null;
  if (
    source === "deck" &&
    eff.filters &&
    typeof eff.filters === "object" &&
    Object.keys(eff.filters).length > 0
  ) {
    filters = eff.filters as CardFilterSpec;
  }

  // ========================================================================
  // OPTIONAL: mode (only meaningful with filters)
  // ========================================================================
  const modeRaw = String(eff.mode || "topmost")
    .toLowerCase()
    .trim();
  const mode: DrawMode = modeRaw === "random" ? "random" : "topmost";

  // ========================================================================
  // OPTIONAL: keywords
  // ========================================================================
  let keywords: string[] = [];
  if (Array.isArray(eff.keywords)) {
    keywords = eff.keywords
      .map((kw: any) => {
        if (typeof kw === "string") return kw;
        if (typeof kw === "object" && kw?.name) return kw.name;
        return "";
      })
      .filter((k: string) => k.length > 0);
  }

  return {
    source,
    name,
    count,
    player,
    filters,
    mode,
    keywords,
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

  // mode only meaningful with filters
  if (spec.mode === "random" && !spec.filters) {
    warnings.push("'mode: random' has no effect without 'filters'");
  }

  // keywords only meaningful for filtered draws (usually)
  if (spec.keywords.length > 0 && !spec.filters) {
    // This is actually valid (apply keywords to any drawn card)
    // but worth noting if unexpected
  }

  return warnings;
}















