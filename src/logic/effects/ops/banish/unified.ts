// src/logic/effects/ops/banish/unified.ts
// Unified banish handler - single entry point for all banish operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { Effect, Player, CardInstance } from "../../../../core/types.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";

import {
  UnifiedBanishSpec,
  BanishContext,
  normalizeToUnifiedSpec,
} from "./types.js";
import {
  banishCard,
  banishSelf,
  banishDeckDuplicates,
  banishAllEnemyCopies,
} from "./primitives.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified banish handler.
 * Routes all banish operations through normalized spec.
 *
 * @returns "pending" if waiting for selection, count of banished otherwise
 */
export function handleBanish(
  eff: Effect & Record<string, any>,
  owner: Player,
  effectsQueue: Effect[] = [],
  context: BanishContext = { owner, sourceCard: null },
): "pending" | number {
  const spec = normalizeToUnifiedSpec(eff);
  const ctx: BanishContext = { ...context, owner };

  // Handle special scopes first
  if (spec.scope) {
    return handleSpecialScope(spec, owner, ctx);
  }

  // Get target pool
  const pool = getPool(
    spec.target || "",
    owner,
    ctx.sourceCard,
    spec.condition,
    { ...ctx, isTargetedEffect: true },
  ).filter((c) => c && (c.type === "Follower" || c.type === "Amulet"));

  // Apply filters
  const filtered = applyFilters(pool, spec.filters);

  if (!filtered.length) return 0;

  // Dispatch by distribution
  let result: "pending" | number;
  switch (spec.distribution) {
    case "random":
      result = handleBanishRandom(filtered, owner, spec, ctx);
      break;

    case "all":
      result = handleBanishAll(filtered, owner, ctx);
      break;

    case "direct":
    default:
      result = handleBanishDirect(filtered, owner, spec, effectsQueue, ctx);
      break;
  }

  return result;
}

// ============================================================================
// SCOPE HANDLERS
// ============================================================================

function handleSpecialScope(
  spec: UnifiedBanishSpec,
  owner: Player,
  ctx: BanishContext,
): "pending" | number {
  switch (spec.scope) {
    case "self":
      return banishSelf(ctx.sourceCard) ? 1 : 0;

    case "deck_duplicates":
      return banishDeckDuplicates(owner);

    case "all_enemy_copies": {
      // Requires selected card from context
      const selected = ctx.selectedCard;
      if (!selected) {
        logEvent("banish_all_copies_no_selected", { owner });
        return 0;
      }
      return banishAllEnemyCopies(owner, selected);
    }

    default:
      return 0;
  }
}

// ============================================================================
// DISTRIBUTION HANDLERS
// ============================================================================

function handleBanishDirect(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedBanishSpec,
  effectsQueue: Effect[],
  ctx: BanishContext,
): "pending" | number {
  if (!pool.length) return 0;

  // If selection required
  if (spec.select > 0) {
    const selectCount = Math.min(spec.select, pool.length);

    setPendingTarget({
      eff: { op: "banish", target: spec.target } as Effect,
      owner,
      sourceCard: ctx.sourceCard || null,
      resumeEffects: effectsQueue,
      pool,
      targets: [],
      selectCount,
    });

    logEvent("banish_select", {
      owner,
      pool: pool.length,
      select: selectCount,
    });
    highlightSelectable(pool);
    return "pending";
  }

  // No selection → banish all in pool
  let count = 0;
  for (const target of pool) {
    if (banishCard(target, "direct")) {
      count++;
    }
  }

  return count;
}

function handleBanishRandom(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedBanishSpec,
  _ctx: BanishContext,
): number {
  if (!pool.length) return 0;

  const n = Math.min(spec.count, pool.length);
  let count = 0;

  for (let i = 0; i < n; i++) {
    const idx = state.rng.nextInt(pool.length);
    const target = pool.splice(idx, 1)[0];
    if (!target) continue;

    if (banishCard(target, "random")) {
      count++;
    }
  }

  return count;
}

function handleBanishAll(
  pool: CardInstance[],
  _owner: Player,
  _ctx: BanishContext,
): number {
  let count = 0;
  for (const target of pool) {
    if (banishCard(target, "all")) {
      count++;
    }
  }
  return count;
}

// ============================================================================
// HELPERS
// ============================================================================

function applyFilters(
  pool: CardInstance[],
  filters: Record<string, any> | null,
): CardInstance[] {
  if (!filters) return pool;

  let result = pool;

  if (filters.defense_lte !== undefined) {
    const cap = parseInt(String(filters.defense_lte), 10);
    if (Number.isFinite(cap)) {
      result = result.filter((c) => (parseInt(String(c.defense)) || 0) <= cap);
    }
  }

  if (filters.cost_lte !== undefined) {
    const cap = parseInt(String(filters.cost_lte), 10);
    if (Number.isFinite(cap)) {
      result = result.filter((c) => (parseInt(String(c.cost)) || 0) <= cap);
    }
  }

  return result;
}
