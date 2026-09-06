// src/logic/effects/ops/destroy/unified.ts
// Unified destroy handler - single entry point for all destroy operations.

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
import { cleanupDead } from "../../../core/cleanup.js";

import type { UnifiedDestroySpec, DestroyContext } from "./types.js";

import { normalizeToUnifiedSpec } from "./types.js";
import { destroyTarget, getBoard } from "./primitives.js";
import { resolveContextCard } from "../../../core/triggers/resolve.js";
import type { TriggerContext } from "../../../core/triggers/types.js";
import { isDamaged } from "../../../core/combat/damageState.js";
import {
  resolveDynamicValue,
  resolveEffectAmount,
} from "../../../core/values.js";
// ============================================================================
// CONTEXT VARIABLE HELPERS
// ============================================================================

/**
 * Stores a value in context.variables for cross-effect communication.
 * Creates the variables object if it doesn't exist.
 */
function storeInContext(ctx: DestroyContext, key: string, value: number): void {
  if (!ctx.variables) {
    ctx.variables = {};
  }
  ctx.variables[key] = value;
}

// ============================================================================
// POOL CONDITION
// ============================================================================

/**
 * Merge object-valued `filter` into the condition passed to getPool.
 * Card JSON uses `filter:{not_self:true}` on destroy ops; previously only
 * `eff.condition` reached getPool and object filters were silently ignored.
 */
function destroyPoolCondition(
  eff: Effect & Record<string, any>,
  spec: UnifiedDestroySpec,
): any {
  const base =
    spec.condition && typeof spec.condition === "object" ? spec.condition : {};
  const filter = eff.filter;
  if (filter && typeof filter === "object" && !Array.isArray(filter)) {
    return { ...base, ...filter };
  }
  return Object.keys(base).length ? base : spec.condition;
}

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified destroy handler.
 * Routes all destroy operations through normalized spec.
 *
 * @returns "pending" if waiting for selection, count of destroyed otherwise
 */
export function handleDestroy(
  eff: Effect & Record<string, any>,
  owner: Player,
  effectsQueue: Effect[] = [],
  context: DestroyContext = { owner, sourceCard: null },
): "pending" | number {
  const spec = normalizeToUnifiedSpec(eff);
  const ctx: DestroyContext = { ...context, owner };

  if (spec.count_raw) {
    const resolved = resolveDynamicValue(spec.count_raw, {
      owner,
      sourceCard: ctx.sourceCard,
    });
    spec.count = Math.max(0, resolved | 0);
  } else if (eff.count_source) {
    spec.count = Math.max(
      0,
      resolveEffectAmount(
        eff as any,
        {
          owner,
          sourceCard: ctx.sourceCard,
          variables: context.variables,
        },
        1,
      ),
    );
  }

  // Handle special scopes first
  if (spec.scope) {
    return handleSpecialScope(spec, owner, ctx, effectsQueue);
  }

  const poolCondition = destroyPoolCondition(eff, spec);

  // Handle "selected" target (from previous selection)
  if (spec.target.toLowerCase().startsWith("selected")) {
    const targets = getPool(spec.target, owner, null, poolCondition, ctx);
    let count = 0;
    for (const target of targets) {
      if (destroyTarget(target, owner, "selected")) count++;
    }
    cleanupDead();
    runThenEffects(spec, count, owner, effectsQueue, ctx);
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
    poolCondition,
    { ...ctx, isTargetedEffect: isSelectBased },
  ).filter((c) => c && (c.type === "Follower" || c.type === "Amulet"));

  // Apply excludes
  const filtered = applyExcludes(pool, spec.exclude, ctx);

  // Dispatch by distribution and get result
  let result: "pending" | number;
  switch (spec.distribution) {
    case "all":
      result = handleDestroyAll(filtered, owner, spec, effectsQueue, ctx);
      break;

    case "random":
      result = handleDestroyRandom(filtered, owner, spec, effectsQueue, ctx);
      break;

    case "highest":
      result = handleDestroyHighest(filtered, owner, spec, effectsQueue, ctx);
      break;

    case "direct":
    default:
      result = handleDestroyDirect(filtered, owner, spec, effectsQueue, ctx);
      break;
  }

  // Store count in context.variables if requested
  // IMPORTANT: Store in the ORIGINAL context object, not the local ctx copy,
  // so variables propagate back to the caller for cross-effect communication
  if (result !== "pending" && spec.store_count_as) {
    if (!context.variables) {
      context.variables = {};
    }
    context.variables[spec.store_count_as] = result;
  }

  return result;
}

// ============================================================================
// DISTRIBUTION HANDLERS
// ============================================================================

function handleDestroyDirect(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedDestroySpec,
  effectsQueue: Effect[],
  ctx: DestroyContext,
): "pending" | number {
  if (!pool.length) {
    if (spec.select > 0) {
      reportSelectFizzled({
        eff: {
          op: "destroy",
          target: spec.target,
          select: spec.select,
        } as Effect,
        owner,
        sourceCard: ctx.sourceCard,
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
        eff: {
          op: "destroy",
          target: spec.target,
          select: selectCount,
          then: spec.then_effects.length ? spec.then_effects : undefined,
        } as any,
        owner,
        sourceCard: ctx.sourceCard,
        resumeEffects: effectsQueue,
        pool,
        targets: [],
        selectCount,
      }) === "fizzled"
    ) {
      return 0;
    }

    highlightSelectable(pool);
    logEvent("destroy_select", {
      owner,
      pool: pool.length,
      select: selectCount,
    });
    return "pending";
  }

  // Auto-select based on count
  const targets = pool.slice(0, spec.count);
  let destroyed = 0;
  for (const target of targets) {
    if (destroyTarget(target, owner, "direct")) destroyed++;
  }

  cleanupDead();
  runThenEffects(spec, destroyed, owner, effectsQueue, ctx);
  return destroyed;
}

function handleDestroyAll(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedDestroySpec,
  effectsQueue: Effect[],
  ctx: DestroyContext,
): number {
  let destroyed = 0;

  for (const target of pool) {
    if (destroyTarget(target, owner, "destroy_all")) destroyed++;
  }

  cleanupDead();
  runThenEffects(spec, destroyed, owner, effectsQueue, ctx);
  return destroyed;
}

function handleDestroyRandom(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedDestroySpec,
  effectsQueue: Effect[],
  ctx: DestroyContext,
): number {
  const candidates = [...pool];
  let destroyed = 0;
  let remaining = spec.count;

  while (remaining > 0 && candidates.length > 0) {
    const idx = state.rng.nextInt(candidates.length);
    const target = candidates.splice(idx, 1)[0];

    if (target && destroyTarget(target, owner, "random")) {
      destroyed++;
    }
    remaining--;
  }

  cleanupDead();
  runThenEffects(spec, destroyed, owner, effectsQueue, ctx);
  return destroyed;
}

function handleDestroyHighest(
  pool: CardInstance[],
  owner: Player,
  spec: UnifiedDestroySpec,
  effectsQueue: Effect[],
  ctx: DestroyContext,
): number {
  if (!pool.length) return 0;

  // Filter to valid followers only
  const followers = pool.filter(
    (c) => c.type === "Follower" && (parseInt(String(c.defense), 10) || 0) > 0,
  );
  if (!followers.length) return 0;

  // Find highest stat value
  const getValue = (c: CardInstance) =>
    parseInt(String(spec.stat === "defense" ? c.defense : c.attack), 10) || 0;

  const highest = Math.max(...followers.map(getValue));
  const candidates = followers.filter((c) => getValue(c) === highest);

  // Destroy up to count, randomly from ties
  let destroyed = 0;
  let remaining = spec.count;

  while (remaining > 0 && candidates.length > 0) {
    const idx = state.rng.nextInt(candidates.length);
    const target = candidates.splice(idx, 1)[0];

    if (target && destroyTarget(target, owner, "highest")) {
      destroyed++;
    }
    remaining--;
  }

  cleanupDead();
  runThenEffects(spec, destroyed, owner, effectsQueue, ctx);
  return destroyed;
}

// ============================================================================
// SPECIAL SCOPES
// ============================================================================

function handleSpecialScope(
  spec: UnifiedDestroySpec,
  owner: Player,
  ctx: DestroyContext,
  effectsQueue: Effect[],
): number {
  let destroyed = 0;

  switch (spec.scope) {
    case "self":
      if (ctx.sourceCard) {
        if (destroyTarget(ctx.sourceCard, owner, "self")) destroyed++;
        cleanupDead();
      }
      break;

    case "allied_amulets":
      destroyed = destroyAlliedAmulets(owner);
      break;

    case "defender": {
      const triggerCtx = ctx as DestroyContext & TriggerContext;
      const defender =
        ctx.defender ?? resolveContextCard(triggerCtx, "defender") ?? null;

      if (defender) {
        if (spec.only_if_damaged && !isDamaged(defender)) {
          break;
        }
        if (destroyTarget(defender, owner, "defender")) destroyed++;
        cleanupDead();
      }
      break;
    }
  }

  runThenEffects(spec, destroyed, owner, effectsQueue, ctx);
  return destroyed;
}

function destroyAlliedAmulets(owner: Player): number {
  const board = getBoard(owner);
  let destroyed = 0;

  for (let i = board.length - 1; i >= 0; i--) {
    const card = board[i];
    if (!card || card.type !== "Amulet") continue;
    if (destroyTarget(card, owner, "allied_amulets")) destroyed++;
  }

  cleanupDead();
  return destroyed;
}

// ============================================================================
// HELPERS
// ============================================================================

function applyExcludes(
  pool: CardInstance[],
  excludes: string[],
  ctx: DestroyContext,
): CardInstance[] {
  if (!excludes.length) return pool;

  const excludeUids = new Set<string>();

  for (const token of excludes) {
    const t = String(token).trim().toLowerCase();
    if (t === "context.defender" && ctx.defender?.uid) {
      excludeUids.add(ctx.defender.uid);
    } else if (t === "context.attacker" && ctx.attacker?.uid) {
      excludeUids.add(ctx.attacker.uid);
    } else if (t === "context.sourcecard" && ctx.sourceCard?.uid) {
      excludeUids.add(ctx.sourceCard.uid);
    } else if (t.startsWith("uid:")) {
      excludeUids.add(token.slice(4));
    }
  }

  return pool.filter((c) => !excludeUids.has(c.uid));
}

function runThenEffects(
  spec: UnifiedDestroySpec,
  destroyed: number,
  _owner: Player,
  effectsQueue: Effect[],
  _ctx: DestroyContext,
): void {
  if (destroyed > 0 && spec.then_effects.length > 0) {
    for (let i = spec.then_effects.length - 1; i >= 0; i--) {
      effectsQueue.unshift(spec.then_effects[i]!);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { normalizeToUnifiedSpec, UnifiedDestroySpec } from "./types.js";
