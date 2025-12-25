// src/logic/effects/ops/banish/types.ts
// Unified banish types and normalization.

import { Effect, Player, CardInstance } from "../../../../core/types/index.js";

// ============================================================================
// DISTRIBUTION & SCOPE TYPES
// ============================================================================

/**
 * Distribution modes for banish operations.
 *
 * - `direct`: Banish specific targets (default)
 * - `random`: Randomly select targets to banish
 * - `all`: Banish all matching targets
 */
export type BanishDistribution = "direct" | "random" | "all";

/**
 * Special scopes for banish operations.
 *
 * - `self`: Banish the source card
 * - `all_enemy_copies`: Banish all enemy cards with same name as selected
 * - `deck_duplicates`: Banish duplicate cards from owner's deck
 */
export type BanishScope =
  | "self"
  | "all_enemy_copies"
  | "deck_duplicates"
  | null;

// ============================================================================
// UNIFIED SPEC
// ============================================================================

/**
 * Canonical unified banish effect spec.
 * All banish operations normalize to this format internally.
 *
 * ## Fields
 *
 * | Field        | Type    | Default   | Description                         |
 * |--------------|---------|-----------|-------------------------------------|
 * | target       | string  | ""        | Target pool specification           |
 * | distribution | string  | "direct"  | How to select targets               |
 * | count        | number  | 1         | Number of targets (for random)      |
 * | select       | number  | 0         | Require N user selections           |
 * | scope        | string  | null      | Special scope (self, deck_duplicates)|
 * | condition    | object  | null      | Filter condition                    |
 * | filters      | object  | null      | Additional filters (defense_lte, etc)|
 */
export interface UnifiedBanishSpec {
  /** Target pool specification */
  target: string;

  /** Distribution mode. Default: "direct" */
  distribution: BanishDistribution;

  /** Number of targets. Default: 1 */
  count: number;

  /** Number of targets to select (0 = auto-select). Default: 0 */
  select: number;

  /** Special scope. Default: null */
  scope: BanishScope;

  /** Optional filter condition */
  condition: any;

  /** Additional filters (e.g., defense_lte) */
  filters: Record<string, any> | null;
}

/**
 * Context for banish operations.
 */
export interface BanishContext {
  owner: Player;
  sourceCard: CardInstance | null;
  effectsQueue?: Effect[];
  selectedCard?: CardInstance;
  [key: string]: any;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalizes any banish-family effect to a canonical UnifiedBanishSpec.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedBanishSpec {
  const op = String(eff.op || "").toLowerCase();

  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  // Scope-specific ops don't need target (self, deck_duplicates, all_enemy_copies)
  const scopeSpecificOps = [
    "banish_self",
    "banish_duplicates_from_deck",
    "banish_all_enemy_copies",
  ];
  const hasScopeOverride = eff.scope || scopeSpecificOps.includes(op);

  if (!hasScopeOverride && eff.target === undefined) {
    throw new Error(
      `[banish] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedBanishSpec = {
    target: String(eff.target || "").trim(),
    distribution: "direct",
    count: 1,
    select: 0,
    scope: null,
    condition: eff.condition || null,
    filters: eff.filters || null,
  };

  // Parse count
  if (eff.count !== undefined) {
    const n = parseInt(String(eff.count), 10);
    spec.count = Number.isFinite(n) && n > 0 ? n : 1;
  }

  // Parse select
  if (eff.select !== undefined) {
    const s = parseInt(String(eff.select), 10);
    spec.select = Number.isFinite(s) ? s : eff.select === true ? 1 : 0;
  }
  if (eff.select_count !== undefined) {
    const s = parseInt(String(eff.select_count), 10);
    if (Number.isFinite(s)) spec.select = s;
  }

  // Parse explicit distribution
  if (eff.distribution) {
    spec.distribution = eff.distribution as BanishDistribution;
  }

  // Parse explicit scope
  if (eff.scope) {
    spec.scope = eff.scope as BanishScope;
  }

  // Derive from op name
  switch (op) {
    case "banish_random":
      spec.distribution = "random";
      if (!spec.target) spec.target = "enemy:follower";
      break;

    case "banish_self":
      spec.scope = "self";
      break;

    case "banish_all_enemy_copies":
      spec.scope = "all_enemy_copies";
      break;

    case "banish_duplicates_from_deck":
      spec.scope = "deck_duplicates";
      break;

    case "banish":
    default:
      // Standard banish - use parameters as-is
      break;
  }

  return spec;
}

/**
 * Validates a unified spec for consistency.
 */
export function validateUnifiedSpec(spec: UnifiedBanishSpec): string[] {
  const errors: string[] = [];

  if (spec.distribution === "random" && spec.count < 1) {
    errors.push("random distribution requires count >= 1");
  }

  if (spec.select < 0) {
    errors.push("select must be >= 0");
  }

  return errors;
}















