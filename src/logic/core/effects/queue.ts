import { Effect } from "../../../core/types.js";
import { EffectCtx } from "./registry.js";

function validateOp(eff: Effect) {
  if (!eff || typeof eff.op !== "string") {
    throw new Error(`[Queue] Invalid effect op: ${JSON.stringify(eff)}`);
  }
}

function validateQueue(ctx: EffectCtx) {
  if (!Array.isArray(ctx.queue)) {
    throw new Error("[Queue] Context queue is missing or validation failed.");
  }
}

/**
 * Appends an effect to the END of the queue.
 * (Less common in depth-first resolution, but standard for 'next' triggers).
 */
export function enqueue(ctx: EffectCtx, eff: Effect) {
  validateQueue(ctx);
  validateOp(eff);
  ctx.queue.push(eff);
}

/**
 * Prepends an effect to the FRONT of the queue.
 * (Standard for resolving nested / child effects immediately).
 */
export function enqueueFront(ctx: EffectCtx, eff: Effect) {
  validateQueue(ctx);
  validateOp(eff);
  ctx.queue.unshift(eff);
}

/**
 * Prepends multiple effects to the FRONT of the queue.
 * They are added such that they execute in order [0, 1, 2...]
 * i.e. unshift(...effects)
 */
export function enqueueManyFront(ctx: EffectCtx, effects: Effect[]) {
  validateQueue(ctx);
  if (!effects || effects.length === 0) return;
  effects.forEach(validateOp);
  ctx.queue.unshift(...effects);
}
