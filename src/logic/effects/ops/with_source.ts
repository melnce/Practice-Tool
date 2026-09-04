// src/logic/effects/ops/with_source.ts
// Run nested effects with a different source card (runtime wrapper, not card JSON).

import { state } from "../../../core/gameState.js";
import { resolveUid } from "../../../core/uidResolver.js";
import { logEvent } from "../../../core/logger.js";
import { runEffects } from "../../core/effects/index.js";
import type { Effect } from "../../../core/types/index.js";
import type { EffectCtx } from "../../core/effects/registry.js";

export type WithSourceEffect = {
  op: "with_source";
  source_uid: string;
  effects: Effect[];
};

export function handleWithSource(
  eff: WithSourceEffect,
  ctx: EffectCtx,
): "pending" | void {
  const uid = String(eff.source_uid ?? "").trim();
  const effects = Array.isArray(eff.effects) ? eff.effects : [];
  if (!uid || !effects.length) return;

  const card = resolveUid(uid);
  if (!card) {
    logEvent("with_source_miss", { uid });
    return;
  }

  const innerContext: Record<string, unknown> = {
    ...(typeof ctx.context === "object" && ctx.context ? ctx.context : {}),
  };

  runEffects(effects, ctx.owner, card, innerContext);

  if (state.pendingTargetEffect) {
    const pending = state.pendingTargetEffect;
    const outerResume = Array.isArray(ctx.queue) ? [...ctx.queue] : [];
    const innerResume = Array.isArray(pending.resumeEffects)
      ? [...pending.resumeEffects]
      : [];
    pending.resumeEffects = [...innerResume, ...outerResume];
    return "pending";
  }
}
