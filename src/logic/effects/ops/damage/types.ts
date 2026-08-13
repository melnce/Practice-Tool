// src/logic/effects/ops/damage/types.ts
// Shared types for the damage module.

import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";

// ============================================================================
// LEGACY TYPES (backwards compat)
// ============================================================================

export type DamageOp = Effect & {
  amount?: number | string;
  add_amount?: number | string;
  amount_overflow?: number | string;
  overflow_amount?: number | string;
  target?: string;
  select?: number | string;
  count?: number | string;
  can_target_leader?: boolean;
};

export interface DamageContext {
  owner: Player;
  sourceCard: CardInstance | null;
  effectsQueue?: Effect[];
  defender?: CardInstance;
  targets?: CardInstance[];
  selectedCard?: CardInstance;
  [key: string]: any;
}

// ============================================================================
// CANONICAL UNIFIED TYPES
// ============================================================================

/**
 * Distribution modes for damage application.
 *
 * - `direct`: Each target receives the full amount (default)
 * - `random_hits`: Random target selection, `count` times (with replacement)
 * - `split_sequential`: Damage dealt sequentially until depleted, optional leader spillover
 * - `by_stat`: Target(s) with highest value of specified `stat`
 */
export type DamageDistribution =
  | "direct"
  | "random" // Alias for random_hits (used in card definitions)
  | "random_hits"
  | "split_sequential"
  | "by_stat";

/**
 * Amount source derivation.
 *
 * - `fixed`: Use the `amount` field directly (default)
 * - `hand_size`: Owner's current hand size
 * - `selected_defense`: Defense value of the selected card (post-buff)
 * - `golem_count`: Count of allied Golem followers
 * - `crest_count`: Owner's crest count
 * - `other_allies`: Count of other allied followers (excluding source)
 * - `followers_on_field`: Count followers across both boards
 */
export type DamageAmountSource =
  | "fixed"
  | "hand_size"
  | "selected_defense"
  | "golem_count"
  | "crest_count"
  | "other_allies"
  | "followers_on_field"
  | "ally_matches" // Count allied board cards matching `filter` / condition fields
  | "unique_tribe_enters" // Distinct named allied tribe enters this match (`tribe` / filter.tribe)
  | "named_enter_count" // Count of named allied follower enters this match (`name`)
  | "amulets_in_hand"; // Count of amulets currently in owner's hand

/**
 * Canonical unified damage effect spec.
 * All damage operations normalize to this format internally.
 *
 * ## Field Compatibility Matrix
 *
 * | Field             | direct | random_hits | split_sequential | by_stat |
 * |-------------------|--------|-------------|------------------|---------|
 * | count             | ❌     | ✅ required | ❌               | ❌      |
 * | stat              | ❌     | ❌          | ❌               | ✅ req  |
 * | spill_to_leader   | ❌     | ❌          | ✅ optional      | ❌      |
 * | include_leader    | ❌     | ✅ optional | ❌               | ❌      |
 *
 * ## Selection Precedence
 *
 * If `ctx.targets` is provided in context, it takes precedence over inline
 * `select` field. This allows resumption after UI selection.
 */
export interface UnifiedDamageSpec {
  // Target specification
  target?: string;

  // Distribution mode
  distribution: DamageDistribution;

  // Amount configuration
  amount?: number | string; // Can be number or dynamic string like "{self.attack}"
  add_amount?: number | string; // Additional amount (e.g., spellboost count)
  amount_source: DamageAmountSource;

  // Distribution-specific options
  count?: number; // For random_hits only
  stat?: "attack" | "defense" | "hp"; // For by_stat only
  /** Extreme to use for by_stat; defaults to highest. */
  rank?: "highest" | "lowest";
  /** Randomly choose from tied extreme-stat targets instead of hitting all. */
  pick?: "random";
  spill_to_leader?: boolean; // For split_sequential only

  // Targeting modifiers
  select?: number; // Require N user selections
  include_leader?: boolean | "enemy" | "ally" | "both"; // Random hits can target leader(s)
  fallback_leader?: boolean; // If no followers, allow leader selection

  // Standard fields
  condition?: any;
  /** Card filter for amount_source: "ally_matches" (and similar count sources) */
  filter?: Record<string, unknown>;
}

// ============================================================================
// VALIDATION (dev-only warnings)
// ============================================================================

/**
 * Validates a UnifiedDamageSpec for field compatibility.
 * Logs warnings for invalid combinations in development.
 * Does NOT throw or reject - behavior is unchanged.
 */
export function validateUnifiedSpec(spec: UnifiedDamageSpec): string[] {
  const warnings: string[] = [];

  // count only valid for random_hits
  if (spec.count !== undefined && spec.distribution !== "random_hits") {
    warnings.push(
      `'count' field only applies to distribution='random_hits', not '${spec.distribution}'`,
    );
  }

  // stat required for by_stat
  if (spec.distribution === "by_stat" && !spec.stat) {
    warnings.push(`distribution='by_stat' requires 'stat' field`);
  }

  // stat only valid for by_stat
  if (spec.stat && spec.distribution !== "by_stat") {
    warnings.push(
      `'stat' field only applies to distribution='by_stat', not '${spec.distribution}'`,
    );
  }

  // spill_to_leader only valid for split_sequential
  if (
    spec.spill_to_leader !== undefined &&
    spec.distribution !== "split_sequential"
  ) {
    warnings.push(
      `'spill_to_leader' field only applies to distribution='split_sequential'`,
    );
  }

  // include_leader only valid for random_hits
  if (
    spec.include_leader !== undefined &&
    spec.distribution !== "random_hits"
  ) {
    warnings.push(
      `'include_leader' field only applies to distribution='random_hits'`,
    );
  }

  return warnings;
}

/**
 * Normalize an Effect to a UnifiedDamageSpec.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function normalizeToUnifiedSpec(
  eff: Effect & Record<string, any>,
  legacyOpHint?: string,
): UnifiedDamageSpec {
  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  if (eff.target === undefined) {
    throw new Error(
      `[damage] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }

  // amount is required unless amount_source is specified (derived amounts)
  const hasAmountSource =
    eff.amount_source !== undefined && eff.amount_source !== "fixed";
  if (eff.amount === undefined && !hasAmountSource) {
    throw new Error(
      `[damage] Missing required field: "amount" (or "amount_source"). Effect: ${JSON.stringify(eff)}`,
    );
  }

  // Preserve dynamic amount strings (e.g., "{self.attack}") for later resolution
  // Only parse as integer if it's a plain number
  const rawAmount = eff.amount ?? 0;
  const isDynamicAmount =
    typeof rawAmount === "string" && rawAmount.startsWith("{");

  const spec: UnifiedDamageSpec = {
    target: eff.target as string,
    distribution: "direct",
    amount: isDynamicAmount ? rawAmount : parseInt(String(rawAmount), 10) || 0,
    add_amount: eff.add_amount, // Preserve dynamic add_amount for spellboost etc.
    amount_source: "fixed",
    condition: eff.condition,
  };

  // Handle explicit new-style fields first
  if (eff.distribution) {
    spec.distribution = eff.distribution as DamageDistribution;
  }
  if (eff.amount_source) {
    spec.amount_source = eff.amount_source as DamageAmountSource;
  }
  if ((eff as any).filter && typeof (eff as any).filter === "object") {
    spec.filter = (eff as any).filter as Record<string, unknown>;
  }
  if (eff.count !== undefined) {
    spec.count = parseInt(String(eff.count), 10) || 1;
  }
  if (eff.stat) {
    spec.stat = eff.stat as "attack" | "defense" | "hp";
  }
  if (eff.rank === "lowest" || eff.rank === "highest") {
    spec.rank = eff.rank;
  }
  if (eff.pick === "random") {
    spec.pick = "random";
  }
  if (eff.spill_to_leader !== undefined) {
    spec.spill_to_leader = Boolean(eff.spill_to_leader);
  }
  if (eff.select !== undefined) {
    spec.select = parseInt(String(eff.select), 10) || 0;
  }
  if (eff.include_leader !== undefined) {
    const raw = eff.include_leader;
    if (raw === "both" || raw === "ally" || raw === "enemy") {
      spec.include_leader = raw;
    } else {
      spec.include_leader = Boolean(raw);
    }
  }
  if (
    eff.fallback_leader !== undefined ||
    eff.can_target_leader !== undefined
  ) {
    spec.fallback_leader = Boolean(
      eff.fallback_leader ?? eff.can_target_leader,
    );
  }

  // Derive from legacy op name if not already set
  const op = legacyOpHint || (eff.op as string) || "";

  switch (op) {
    case "damage_all":
      spec.distribution =
        spec.distribution === "direct" ? "direct" : spec.distribution;
      break;

    case "damage_random":
      spec.distribution = "random_hits";
      spec.count = spec.count ?? (parseInt(String(eff.count ?? 1), 10) || 1);
      spec.include_leader =
        spec.include_leader ??
        (spec.target === "enemy" ||
          spec.target === "enemy:all" ||
          spec.target === "all");
      break;

    case "damage_split_sequential":
      spec.distribution = "split_sequential";
      spec.amount_source = "hand_size";
      spec.spill_to_leader = false;
      break;

    case "damage_split_fixed":
      spec.distribution = "split_sequential";
      spec.spill_to_leader = false;
      break;

    case "damage_split_all_enemies":
      spec.distribution = "split_sequential";
      spec.spill_to_leader = true;
      // Handle count_source for crest-based amount
      if (String(eff.count_source || "").toLowerCase() === "crest_count") {
        spec.amount_source = "crest_count";
      }
      break;

    case "damage_follower_or_leader":
      spec.select = 1;
      spec.fallback_leader = true;
      break;

    case "damage_all_by_allied_golems":
      spec.distribution = "direct";
      spec.amount_source = "golem_count";
      spec.target = spec.target || "enemy:follower";
      break;

    case "damage_random_selected_defense":
      spec.distribution = "random_hits";
      spec.count = 1;
      spec.amount_source = "selected_defense";
      spec.target = spec.target || "enemy:follower";
      break;

    case "damage_highest_defense":
      spec.distribution = "by_stat";
      spec.stat = "defense";
      break;

    case "damage_self":
      spec.target = "self";
      break;
  }

  return spec;
}
