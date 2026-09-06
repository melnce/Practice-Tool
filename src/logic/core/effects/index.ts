/**
 * GUARDRAIL: This file is a ROUTER/ORCHESTRATOR.
 * It must remain a thin layer that delegates logic to specific modules.
 * DO NOT add complex rules, targeting logic, or keyword implementations here.
 * Import them from their respective cohesive modules.
 */
import { state } from "../../../core/gameState.js";
import { adapter } from "../../../core/adapter.js";
import { registerRunEffects } from "../triggers.js";
import type {
  CardInstance,
  Effect,
  Player,
  EffectOp,
  EffectByOp,
  EffectResult,
} from "../../../core/types/index.js";
import { guardLifecycle } from "../targeting/guards.js";
import {
  registerRunEffectsInCleanup,
  flushDeferredDeathBatch,
} from "../cleanup.js";
import { clearResolutionQueue } from "../triggers/queue.js";
import { flushDeferredDeckShuffle } from "../../effects/ops/returnHandToDeck.js";
import { recordEvent } from "../../../core/debugTimeline.js";
import { haltEffectsIfGameOver, isGameOver } from "../../../core/gameOver.js";
import { isEffectResolutionPaused } from "../resolutionPause.js";

// Registry
import type { EffectCtx } from "./registry.js";

import { getOp, sealRegistry } from "./registry.js";
import { getGlobalTrace } from "./trace.js";
import { registerCombatEffects } from "./domains/combat.js";
import { registerResourceEffects } from "./domains/resources.js";
import { registerBoardEffects } from "./domains/board.js";
import { registerBuffEffects } from "./domains/buffs.js";
import { registerMiscEffects } from "./domains/misc.js";
// Initialize Registry
registerCombatEffects();
registerResourceEffects();
registerBoardEffects();
registerBuffEffects();
registerMiscEffects();

// Bootstrap Integrity Check
import { ALL_OPS } from "./opTypes.js";
import { listOps } from "./registry.js";
const registered = new Set(listOps());
const expected = new Set(ALL_OPS);

const missing = ALL_OPS.filter((op) => !registered.has(op));
const extra = listOps().filter((op) => !expected.has(op));

if (missing.length > 0 || extra.length > 0) {
  const msg = [
    `Effect op registration mismatch.`,
    `Expected: ${expected.size}, Actual: ${registered.size}`,
    `Missing (${missing.length}):`,
    ...missing.map((op) => `- ${op}`),
    `Extra (${extra.length}):`,
    ...extra.map((op) => `- ${op}`),
  ].join("\n");
  throw new Error(msg);
}

sealRegistry();

// --- Core Wrappers (Unchanged) ---
/**
 * Triggers fanfare effects for a card.
 * @param {object} card - The card with potential fanfare effects.
 * @param {string} owner - "first" or "second" (semantic player slot).
 */
export function onFanfare(card: CardInstance, owner: Player) {
  const list = card.fanfare || [];
  if (Array.isArray(list) && list.length) {
    // Pass shared context for variable propagation between effects
    // (e.g., store_count_as from destroy -> amount_source in damage)
    const sharedContext = { variables: {} };
    runEffects([...list], owner, card, sharedContext);
  }
}

export function getEffectiveCost(card: CardInstance) {
  if (
    typeof card.effectiveCost === "number" &&
    Number.isFinite(card.effectiveCost)
  )
    return card.effectiveCost;
  const base = parseInt(card?.cost as string, 10) || 0;
  const mod = parseInt((card as any)?.cost_mod, 10) || 0;
  return base + mod;
}

// Notify (event-only) that a Loot spell was played.
// Keeps evolveEffects generic; cards listen via triggers (event: "loot_played").

// Helper: Dispatch effect with strict types
function dispatchEffect<K extends EffectOp>(
  op: K,
  eff: Effect,
  ctx: EffectCtx,
): EffectResult | void {
  if (eff.op !== op) return; // Should not happen if confirmed 'eff.op'
  const handler = getOp(op);
  if (!handler) {
    throw new Error(`UNKNOWN EFFECT OPERATION: ${op}`);
  }
  // We cast strictly to 'EffectByOp[K]' which is safe because we verified op === K
  return handler(eff as EffectByOp[K], ctx);
}

// --- The Master Effect Runner ---

/**
 * Main effect dispatcher. Processes a queue of effects sequentially.
 * @param {Array<object>} effects - Array of effect objects to process.
 * @param {string} owner - "first" or "second" (semantic player slot).
 * @param {object|null} sourceCard - The card initiating the effects.
 * @param {object} [context={}] - Shared context for targeting and chaining.
 */
export function runEffects(
  effects: Effect[],
  owner: Player,
  sourceCard: CardInstance | null,
  context?: any,
): "pending" | void {
  guardLifecycle("runEffects");

  // Runtime Assertion: Registry must be sealed
  void import("./registry.js").then(({ isRegistrySealed }) => {
    if (!isRegistrySealed()) {
      throw new Error(
        "[Dispatcher] CRITICAL: Attempted to run effects before registry was sealed.",
      );
    }
  });

  if (!effects) return;

  // Runtime Assertion: Queue must be an array
  if (!Array.isArray(effects)) {
    throw new Error("[Dispatcher] Invalid effects queue: expected array.");
  }

  if (effects.length === 0) return;

  // Durable shared context so store_count_as / amount_source survive across ops
  // even when the caller omitted a context object (e.g. whenRunEffects).
  if (!context || typeof context !== "object") {
    context = { variables: {} };
  } else if (!context.variables || typeof context.variables !== "object") {
    context.variables = {};
  }

  const queue = [...effects]; // Shallow copy to process

  const runDepth = ((state as any)._runEffectsDepth ?? 0) as number;
  (state as any)._runEffectsDepth = runDepth + 1;
  const combatDepth = ((state as any).combatResolutionDepth ?? 0) as number;
  const batchTurnBoundary = !!(context?.batchTurnBoundary && runDepth === 0);
  const enableDeathDefer =
    runDepth === 0 &&
    combatDepth === 0 &&
    context?.deferDeathTriggers !== false &&
    !batchTurnBoundary;

  if (enableDeathDefer || batchTurnBoundary) {
    (state as any).deferDeathTriggers = true;
  }

  // Trace: dispatch_start
  const trace = context?.trace ?? getGlobalTrace();
  if (trace) trace.emit({ kind: "dispatch_start", queueSize: queue.length });

  let processedCount = 0;
  let paused = false;

  try {
    while (queue.length > 0) {
      if (processedCount > 0 && haltEffectsIfGameOver(queue)) return;

      const eff = queue.shift()!;

      // P2-3 FIX: Increment game tick for deterministic ordering
      state.gameTick = (state.gameTick || 0) + 1;

      // Runtime Assertion: Op must be valid string
      if (!eff.op || typeof eff.op !== "string") {
        throw new Error(
          `[Dispatcher] Invalid operation: ${JSON.stringify(eff)} in card ${sourceCard?.name || "unknown"}`,
        );
      }

      recordEvent({
        type: "run_effect",
        payload: { op: eff.op, owner, source: sourceCard?.name },
      });

      // Trace: effect_start
      if (trace) trace.emit({ kind: "effect_start", op: eff.op, depth: 0 }); // Depth not tracked yet

      // Build context for the handler
      const ctx: EffectCtx = {
        state,
        owner,
        sourceCard,
        queue,
        context,
        adapter: { ...adapter, render: () => {} } as any, // Prevent render loops
        trace, // Pass it down
      };

      try {
        const result = dispatchEffect(eff.op, eff, ctx);

        // Protocol: "pending" stops the queue. Anything else continues.
        // We do not wait for Promises (fire-and-forget for animations/async side effects),
        // UNLESS the handler explicitly paused by returning "pending".
        if (result === "pending") {
          // Trace: effect_pending
          if (trace) trace.emit({ kind: "effect_pending", op: eff.op });

          // Paused execution (e.g. targeting waiting for input)
          // The queue state is preserved in the closure references if passed to targeting,
          // otherwise it is lost here (which is correct for "pause").
          paused = true;
          return "pending";
        }

        // Trace: effect_end
        if (trace) trace.emit({ kind: "effect_end", op: eff.op });
        processedCount++;

        if (haltEffectsIfGameOver(queue)) return;
      } catch (e) {
        // Contextualize error
        const err = e instanceof Error ? e : new Error(String(e));
        err.message = `[Dispatcher] Error in op '${eff.op}': ${err.message}`;
        throw err;
      }
    }
  } finally {
    (state as any)._runEffectsDepth = runDepth;
    if (
      runDepth === 0 &&
      !paused &&
      !isEffectResolutionPaused() &&
      !isGameOver()
    ) {
      flushDeferredDeckShuffle();
    }
    if (enableDeathDefer || batchTurnBoundary) {
      (state as any).deferDeathTriggers = false;
    }
    // Drain reactive queue at end of top-level runEffects even during combat
    // (death deferral stays gated by enableDeathDefer above).
    if (
      runDepth === 0 &&
      !paused &&
      !isEffectResolutionPaused() &&
      !(state as any)._drainingResolutionQueue &&
      !batchTurnBoundary
    ) {
      flushDeferredDeathBatch();
      clearResolutionQueue();
    }
  }

  if (trace)
    trace.emit({
      kind: "dispatch_end",
      processed: processedCount,
      remaining: queue.length,
    });
}

// --- Dependency Injection Registration ---
// Register runEffects with cleanup.ts so Last Words can trigger
registerRunEffectsInCleanup(runEffects);
// Register runEffects with triggers/process.ts so board/hand triggers can execute effects
registerRunEffects(runEffects);
