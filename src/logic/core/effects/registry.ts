import {
  CardInstance,
  Player,
  Effect,
  EffectOp,
  EffectByOp,
  EffectResult,
} from "../../../core/types.js";
import { EffectTraceSink } from "./trace.js";
export { EffectResult };

// Context passed to every effect handler
export interface EffectCtx {
  // ...
  state: unknown;
  owner: Player;
  sourceCard: CardInstance | null;
  queue: Effect[]; // The current execution queue
  context: unknown; // Shared targeting/chaining context
  adapter: unknown;
  trace?: EffectTraceSink;
}

// Typed handler mapping
export type HandlerByOp = {
  [K in EffectOp]: (eff: EffectByOp[K], ctx: EffectCtx) => EffectResult;
};

// Generic type-erased handler for internal map
export type AnyEffectHandler = (eff: Effect, ctx: EffectCtx) => EffectResult;

const registry = new Map<EffectOp, AnyEffectHandler>();
let isSealed = false;

// --------------------------------------------------------------------------
// Generic Registry API
// --------------------------------------------------------------------------
export function registerOp<K extends EffectOp>(op: K, handler: HandlerByOp[K]) {
  if (isSealed) {
    throw new Error(
      `[Registry] Cannot register op '${op}': Registry is sealed.`,
    );
  }
  if (registry.has(op)) {
    throw new Error(`[Registry] Duplicate registration for op: ${op}`);
  }
  // Store as generic handler internally
  registry.set(op, handler as AnyEffectHandler);
}

export function getOp<K extends EffectOp>(op: K): HandlerByOp[K] | undefined {
  return registry.get(op) as HandlerByOp[K] | undefined;
}

// For runtime use where op might be looser (e.g. string from JSON)
export function getOpRuntime(op: string): AnyEffectHandler | undefined {
  return registry.get(op as EffectOp);
}

export function sealRegistry() {
  isSealed = true;
}

export function isRegistrySealed(): boolean {
  return isSealed;
}

export function listOps(): EffectOp[] {
  return Array.from(registry.keys()).sort() as EffectOp[];
}

export function hasOp(op: EffectOp): boolean {
  return registry.has(op);
}















