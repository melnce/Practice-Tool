import type { EffectCtx as _EffectCtx } from "../registry.js";
import { registerOp } from "../registry.js";
import type { TargetContext } from "../../targeting.js";

import { handleSelect } from "../../targeting.js";
import { runEffects } from "../index.js";
import { handleMode } from "../../../effects/ops/mode.js";
import { handleModeBonus } from "../../../effects/ops/misc.js";
import { handleRepeatEffect } from "../../../effects/repeat.js";
import { handleEvolve } from "../../../effects/ops/evolve/unified.js";
import { handleGate } from "../../../effects/gates/unified.js";
import { handleReplicate } from "../../../effects/ops/replicate.js";
import { handleSequence } from "../../../effects/ops/sequence.js";
import { handleWithSource } from "../../../effects/ops/with_source.js";
import { state } from "../../../../core/gameState.js";
import { getHand } from "../../../../core/playerHelpers.js";
import type { Effect as _Effect } from "../../../../core/types/index.js";

export function registerMiscEffects() {
  registerOp("mode", handleMode as any);
  registerOp("mode_bonus", handleModeBonus as any);

  // Generic Op: Select (Delegates to targeting.ts implementation)
  registerOp("select", (eff, ctx) => {
    // Ensure ctx.context has a runner if missing (targeting expects one for auto-resolve)
    const tCtx: TargetContext = ctx.context || {};
    if (!tCtx.runner) {
      tCtx.runner = runEffects;
    }

    const res = handleSelect(eff, ctx.owner, ctx.sourceCard, ctx.queue, tCtx);
    if (res === "pending") return "pending";
  });

  // ==========================================================================
  // UNIFIED EVOLVE - replaces 8 legacy evolve_* ops
  // ==========================================================================
  registerOp("evolve", (eff, ctx) => {
    const evolveCtx = { ...(ctx.context || {}), queue: ctx.queue };
    const result = handleEvolve(
      eff as any,
      ctx.owner,
      ctx.sourceCard,
      evolveCtx,
    );
    if (result === "pending") return "pending";
  });

  // Legacy shims — delegate to unified evolve (effect-triggered: no EP spend, no turn gate)
  registerOp("evolve_self", (eff, ctx) => {
    const evolveCtx = { ...(ctx.context || {}), queue: ctx.queue };
    handleEvolve(
      {
        ...(eff as any),
        op: "evolve",
        target: "self",
        mode: "normal",
        spend_point: false,
      },
      ctx.owner,
      ctx.sourceCard,
      evolveCtx,
    );
  });

  registerOp("super_evolve_self", (eff, ctx) => {
    const evolveCtx = { ...(ctx.context || {}), queue: ctx.queue };
    handleEvolve(
      {
        ...(eff as any),
        op: "evolve",
        target: "self",
        mode: "super",
        spend_point: false,
      },
      ctx.owner,
      ctx.sourceCard,
      evolveCtx,
    );
  });

  // ==========================================================================
  // UNIFIED GATE - replaces 17 legacy *_gate ops
  // ==========================================================================
  registerOp("gate", (eff, ctx) => {
    handleGate(eff as any, ctx.owner, ctx.sourceCard, ctx.queue);
  });

  // combo_add is now handled by counter op with key: "combo"

  registerOp("repeat_effect", (eff, ctx) =>
    handleRepeatEffect(eff, ctx.owner, ctx.sourceCard, ctx.queue),
  );

  registerOp("sequence", (eff, ctx) => {
    handleSequence(eff as any, ctx.owner, ctx.sourceCard);
  });

  registerOp("replicate", (eff, ctx) => {
    const result = handleReplicate(eff as any, ctx);
    if (result === "pending") return "pending";
  });

  registerOp("with_source", (eff, ctx) => {
    const result = handleWithSource(eff as any, ctx);
    if (result === "pending") return "pending";
  });

  // set_deckout_victory - enables alternate win condition when opponent decks out
  registerOp("set_deckout_victory", (_eff, ctx) => {
    state.players[ctx.owner].deckoutWins = true;
  });

  // Skybound
  // NOTE: Synchronous import ensures deterministic effect execution order
  registerOp("boost_skybound_art_hand", (eff, ctx) => {
    const amt = Number(eff.amount ?? 1);
    const hand = getHand(state, ctx.owner);
    for (const card of hand) {
      card.skyboundArtEvolvesWitnessed =
        (card.skyboundArtEvolvesWitnessed || 0) + amt;
    }
  });
}
