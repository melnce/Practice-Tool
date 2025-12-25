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
 */
export function normalizeSearchSpec(eff: Effect & Record<string, any>): SearchSpec {
    return {
        filters: eff.filter || eff.filters || {},
        count: typeof eff.count === "number" ? eff.count : 1,
        keywords: Array.isArray(eff.keywords) ? eff.keywords : [],
        player: eff.player === "opponent" ? "opponent" : "self",
    };
}
