// src/logic/effects/ops/banish/unified.ts
// Unified banish handler - single entry point for all banish operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import {
  trySetPendingTarget,
  reportSelectFizzled,
} from "../../../core/pendingTarget/index.js";
import { resolveUids } from "../../../../core/uidResolver.js";

import type { UnifiedBanishSpec, BanishContext } from "./types.js";
import { normalizeToUnifiedSpec } from "./types.js";
import {
  banishCard,
  banishSelf,
  banishDeckDuplicates,
  banishAllEnemyCopies,
  banishFilteredFromDeck,
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

  const targetStr = String(spec.target || "").toLowerCase();
  if (targetStr.startsWith("selected") && context.targetUids?.length) {
    const targets = resolveUids(context.targetUids).filter(
      (c) => c && (c.type === "Follower" || c.type === "Amulet"),
    );
    let count = 0;
    for (const t of targets) {
      if (banishCard(t, "direct")) count++;
    }
    storeBanishCount(spec, ctx, count);
    return count;
  }

  // Handle special scopes before zone routes (deck_duplicates uses ally:deck target)
  if (spec.scope) {
    const count = handleSpecialScope(spec, owner, ctx);
    if (count !== "pending") storeBanishCount(spec, ctx, count);
    return count;
  }

  // Filtered deck banish (e.g. all odd-cost cards) — requires filters
  if (targetStr.includes(":deck")) {
    const count = banishFilteredFromDeck(owner, spec.filters);
    storeBanishCount(spec, ctx, count);
    return count;
  }

  // Get target pool
  // isTargetedEffect should only be true when player selects targets (spec.select > 0)
  // AoE/random effects should bypass Ambush protection
  const isSelectBased = spec.select != null && spec.select > 0;
  const pool = getPool(
    spec.target || "",
    owner,
    ctx.sourceCard,
    spec.condition,
    { ...ctx, isTargetedEffect: isSelectBased },
  ).filter((c) => c && (c.type === "Follower" || c.type === "Amulet"));

  // Apply filters
  const filtered = applyFilters(pool, spec.filters);

  if (!filtered.length) {
    storeBanishCount(spec, ctx, 0);
    return 0;
  }

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

  if (result !== "pending") storeBanishCount(spec, ctx, result);
  return result;
}

function storeBanishCount(
  spec: UnifiedBanishSpec,
  context: BanishContext,
  count: number,
): void {
  if (!spec.store_count_as) return;
  if (!context.variables) context.variables = {};
  context.variables[spec.store_count_as] = count;
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
      // "Copies of it" — uses evolve selection (context or last targeted banish)
      const selected = ctx.selectedCard ?? state.__lastSelected ?? null;
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
  if (!pool.length) {
    if (spec.select > 0) {
      reportSelectFizzled({
        eff: { op: "banish", target: spec.target } as Effect,
        owner,
        sourceCard: ctx.sourceCard || null,
        target: spec.target,
      });
    }
    return 0;
  }

  // If selection required
  if (spec.select > 0) {
    const selectCount = Math.min(spec.select, pool.length);

    if (
      trySetPendingTarget({
        eff: { op: "banish", target: spec.target } as Effect,
        owner,
        sourceCard: ctx.sourceCard || null,
        resumeEffects: effectsQueue,
        pool,
        targets: [],
        selectCount,
      }) === "fizzled"
    ) {
      return 0;
    }

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
