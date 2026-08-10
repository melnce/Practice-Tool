// src/logic/effects/ops/search/types.ts
// Type definitions for search operation

import type { Effect } from "../../../../core/types/index.js";

export interface SearchSpec {
  /** Filters to match cards in deck */
  filters: Record<string, any>;
  /** Number of cards to add to hand */
  count: number;
  /** Keywords to apply to searched cards */
  keywords: string[];
  /** Target player ("self" or "opponent") */
  player: "self" | "opponent";
}

/**
 * Normalize a search effect to a unified spec.
 * STRICT MODE - requires filter and count.
 */
export function normalizeSearchSpec(
  eff: Effect & Record<string, any>,
): SearchSpec {
  // ==========================================================================
  // STRICT: op must be "search"
  // ==========================================================================
  if (eff.op !== "search") {
    throw new Error(
      `[search] Invalid op: "${eff.op}". Must be "search". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // ==========================================================================
  // REQUIRED: count
  // ==========================================================================
  if (eff.count === undefined) {
    throw new Error(
      `[search] Missing required field: "count". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // Parse count - support "all" string for drawing all matching cards
  let count: number;
  const rawCount = eff.count as string | number;
  if (rawCount === "all") {
    count = Infinity; // Will be clamped to actual matches in handler
  } else if (typeof rawCount === "number") {
    count = rawCount;
  } else {
    count = 1;
  }

  return {
    filters: eff.filter || eff.filters || {},
    count,
    keywords: Array.isArray(eff.keywords) ? eff.keywords : [],
    player: eff.player === "opponent" ? "opponent" : "self",
  };
}
