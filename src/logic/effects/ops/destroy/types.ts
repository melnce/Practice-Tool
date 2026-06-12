// src/logic/effects/ops/destroy/types.ts
// Unified types for destroy operations.

import type { Effect, Player, CardInstance } from "../../../../core/types/index.js";

// ============================================================================
// DISTRIBUTION MODES
// ============================================================================

/**
 * Distribution modes for destroy operations.
 *
 * - `direct`: Destroy specific target(s) (default, requires selection)
 * - `all`: Destroy all matching targets
 * - `random`: Random target selection
 * - `highest`: Destroy target(s) with highest stat value
 */
export type DestroyDistribution = "direct" | "all" | "random" | "highest";

/**
 * Special scope for destroy operations.
 *
 * - `self`: Destroy the source card
 * - `allied_amulets`: Destroy all allied amulets
 * - `defender`: Destroy the defender in combat context
 */
export type DestroyScope = "self" | "allied_amulets" | "defender" | null;

// ============================================================================
// UNIFIED SPEC
// ============================================================================

/**
 * Canonical unified destroy effect spec.
 * All destroy operations normalize to this format internally.
 *
 * ## Field Summary
 *
 * | Field         | Type    | Default   | Description                        |
 * |---------------|---------|-----------|-------------------------------------|
 * | target        | string  | required  | Target pool (e.g., "enemy:follower") |
 * | distribution  | string  | "direct"  | How targets are selected            |
 * | count         | number  | 1         | How many to destroy                 |
 * | stat          | string  | "attack"  | Stat for "highest" distribution     |
 * | select        | number  | 0         | Require N user selections           |
 * | scope         | string  | null      | Special scope (self, allied_amulets) |
 * | condition     | object  | null      | Filter condition                    |
 * | then_effects  | array   | []        | Effects to run after destroy        |
 * | exclude       | array   | []        | UIDs/contexts to exclude            |
 */
export interface UnifiedDestroySpec {
  /** Target pool specification */
  target: string;

  /** Distribution mode. Default: "direct" */
  distribution: DestroyDistribution;

  /** Number of targets. Default: 1 */
  count: number;

  /** Stat to check for "highest" distribution. Default: "attack" */
  stat: "attack" | "defense";

  /** Number of targets to select (0 = auto-select). Default: 0 */
  select: number;

  /** Special scope. Default: null */
  scope: DestroyScope;

  /** Optional filter condition */
  condition: any;

  /** Effects to run after successful destroy */
  then_effects: Effect[];

  /** Exclude UIDs or context references */
  exclude: string[];

  /** Conditional: only destroy if damaged */
  only_if_damaged: boolean;

  /** Store the destroy count in context.variables under this key */
  store_count_as: string | null;
}

/**
 * Context for destroy operations.
 */
export interface DestroyContext {
  owner: Player;
  sourceCard: CardInstance | null;
  effectsQueue?: Effect[];
  defender?: CardInstance;
  attacker?: CardInstance;
  targets?: CardInstance[];
  [key: string]: any;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalize an Effect to a UnifiedDestroySpec.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
): UnifiedDestroySpec {
  const op = String(eff.op || "").toLowerCase();

  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  // Scope-specific ops don't need target (self, defender, allied_amulets)
  const scopeSpecificOps = [
    "destroy_self",
    "destroy_defender_if_damaged",
    "follower_strike_destroy",
    "destroy_allied_amulets",
    "destroy_allied_amulets_then_damage",
  ];
  const hasScopeOverride = eff.scope || scopeSpecificOps.includes(op);

  if (!hasScopeOverride && eff.target === undefined) {
    throw new Error(
      `[destroy] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }

  const spec: UnifiedDestroySpec = {
    target: String(eff.target || "").trim(),
    distribution: "direct",
    count: 1,
    stat: "attack",
    select: 0,
    scope: eff.scope || null, // Parse explicit scope field
    condition: eff.condition || null,
    then_effects: [],
    exclude: [],
    only_if_damaged:
      eff.only_if_damaged === true || eff.only_if_damaged === "true" || eff.only_if_damaged === 1,
    store_count_as:
      typeof eff.store_count_as === "string" ? eff.store_count_as : null,
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

  // Parse stat
  if (eff.stat) {
    spec.stat = eff.stat === "defense" ? "defense" : "attack";
  }

  // Parse distribution from effect field (before op-name overrides)
  if (eff.distribution) {
    const dist = String(eff.distribution).toLowerCase();
    if (["direct", "all", "random", "highest"].includes(dist)) {
      spec.distribution = dist as DestroyDistribution;
    }
  }

  // Parse then_effects (then[] alias used on fanfare destroy+draw cards)
  if (eff.then && Array.isArray(eff.then)) {
    spec.then_effects = eff.then;
  } else if (eff.effects && Array.isArray(eff.effects)) {
    spec.then_effects = eff.effects;
  }

  // Parse exclude
  if (eff.exclude) {
    spec.exclude = Array.isArray(eff.exclude) ? eff.exclude : [eff.exclude];
  }

  // Derive from op name
  switch (op) {
    case "destroy_all":
      spec.distribution = "all";
      break;

    case "destroy_random":
      spec.distribution = "random";
      break;

    case "destroy_highest":
      spec.distribution = "highest";
      break;

    case "destroy_self":
      spec.scope = "self";
      break;

    case "destroy_allied_amulets":
    case "destroy_allied_amulets_then_damage":
      spec.scope = "allied_amulets";
      break;

    case "destroy_random_other_allies":
      spec.distribution = "random";
      spec.target = spec.target || "ally:follower";
      spec.exclude = ["context.sourceCard"];
      break;

    case "destroy_defender_if_damaged":
      spec.scope = "defender";
      spec.only_if_damaged = true;
      break;

    case "follower_strike_destroy":
      spec.scope = "defender";
      break;

    case "destroy_then":
      // then_effects already parsed from eff.effects
      break;
  }

  return spec;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates a UnifiedDestroySpec for logical consistency.
 * Returns warnings (does not throw).
 */
export function validateUnifiedSpec(spec: UnifiedDestroySpec): string[] {
  const warnings: string[] = [];

  if (spec.distribution === "highest" && !spec.target) {
    warnings.push("'highest' distribution requires a target pool");
  }

  if (spec.stat !== "attack" && spec.distribution !== "highest") {
    warnings.push("'stat' only applies to 'highest' distribution");
  }

  if (spec.then_effects.length > 0 && spec.count === 0) {
    warnings.push("'then_effects' may not trigger if count is 0");
  }

  return warnings;
}















