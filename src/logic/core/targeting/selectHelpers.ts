/**
 * Pure helper functions for target selection.
 * Extracted from handleSelect for single responsibility.
 */
import { CardInstance, Effect } from "../../../core/types.js";
import { RNG } from "../../../core/rng.js";

// -----------------------------------------------------------------------------
// Configuration Parsing
// -----------------------------------------------------------------------------

export interface SelectConfig {
    count: number;
}

/**
 * Parse selection count from effect definition.
 * Handles both `select` and `select_count` properties.
 */
export function parseSelectConfig(eff: Effect): SelectConfig {
    const raw = eff.select ?? eff.select_count ?? 1;
    let count = parseInt(String(raw), 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    return { count };
}

// -----------------------------------------------------------------------------
// Position Filters
// -----------------------------------------------------------------------------

export type PositionFilter = "leftmost" | "rightmost" | undefined;

/**
 * Apply position-based filter to pool.
 * Returns only the leftmost or rightmost card if specified.
 */
export function applyPositionFilter(
    pool: CardInstance[],
    filter?: PositionFilter | string,
): CardInstance[] {
    if (!pool.length) return pool;

    if (filter === "leftmost") {
        const first = pool[0];
        return first ? [first] : [];
    }
    if (filter === "rightmost") {
        const last = pool[pool.length - 1];
        return last ? [last] : [];
    }
    return pool;
}

// -----------------------------------------------------------------------------
// Random Selection
// -----------------------------------------------------------------------------

/**
 * Pick random targets from pool using deterministic RNG.
 * Returns array of picked cards (removed from pool copy).
 */
export function pickRandomTargets(
    pool: CardInstance[],
    count: number,
    rng: RNG,
): CardInstance[] {
    const picks: CardInstance[] = [];
    const remaining = [...pool];

    while (picks.length < count && remaining.length) {
        const idx = rng.nextInt(remaining.length);
        const picked = remaining.splice(idx, 1)[0];
        if (picked) picks.push(picked);
    }

    return picks;
}

// -----------------------------------------------------------------------------
// Auto-Select Detection
// -----------------------------------------------------------------------------

/**
 * Determine if selection should be automatic (bot or random mode).
 */
export function shouldAutoSelect(mode?: string): boolean {
    if (mode === "random") return true;
    if (typeof window !== "undefined" && (window as any).__BOT_AUTO_TARGETING__) {
        return true;
    }
    return false;
}















