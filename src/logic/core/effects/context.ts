import { GameState } from "../../../core/types/index.js";
import { EffectCtx } from "./registry.js";
import { TargetContext } from "../targeting.js";
import { adapter } from "../../../core/adapter.js";

type Adapter = typeof adapter;

// Helper to assert shape/existence without using 'as any' blindly in handlers

export function getGameState(ctx: EffectCtx): GameState {
  if (!ctx.state || typeof ctx.state !== "object") {
    throw new Error("[EffectCtx] Invalid State: Expected GameState object.");
  }
  // We trust index.ts injected the real state. Runtime check is minimal.
  return ctx.state as GameState;
}

export function getAdapter(ctx: EffectCtx): Adapter {
  if (
    !ctx.adapter ||
    typeof ctx.adapter !== "object" ||
    !("render" in (ctx.adapter as object))
  ) {
    throw new Error(
      "[EffectCtx] Invalid Adapter: Expected Adapter object with render method.",
    );
  }
  return ctx.adapter as Adapter;
}

export function getTargetingContext(ctx: EffectCtx): TargetContext {
  // Context is optional in runEffects, so it might be undefined or empty.
  // If undefined, return empty object to match previous default behavior in many places,
  // OR enforce it exists if the handler requires it.
  // Use case: many handlers do `ctx.context?.targets`.
  // So we return `ctx.context as TargetContext` if it exists, or {} casted if not?
  // Safer to return it as TargetContext (possibly empty).
  if (ctx.context && typeof ctx.context === "object") {
    return ctx.context as TargetContext;
  }
  return {};
}















