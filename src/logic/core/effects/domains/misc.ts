import { registerOp, EffectCtx } from "../registry.js";
import { handleSelect, TargetContext } from "../../targeting.js";
import { runEffects } from "../index.js";
import { handleMode } from "../../../effects/ops/mode.js";
import { handleModeBonus } from "../../../effects/ops/misc.js";
import { handleRepeatEffect } from "../../../effects/repeat.js";
import { handleEvolve } from "../../../effects/ops/evolve/unified.js";
import { handleGate } from "../../../effects/gates/unified.js";
import { Effect } from "../../../../core/types.js";

const stub = (_op: string) => (_eff: Effect, _ctx: EffectCtx) => {
  // console.warn(`[Stub] Op '${op}' called but not implemented.`);
};

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
    handleEvolve(eff as any, ctx.owner, ctx.sourceCard, ctx.context);
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

  registerOp("set_deckout_victory", stub("set_deckout_victory"));

  // Skybound
  registerOp("boost_skybound_art_hand", (eff, ctx) => {
    const amt = Number(eff.amount ?? 1);
    // Dynamic import to avoid cycles if any (though skybound.ts is leaf)
    import("../../../effects/skybound.js")
      .then(({ incrementSkyboundArt }) => {
        incrementSkyboundArt(ctx.owner, amt);
      })
      .catch((e) => console.error("Failed to load skybound module:", e));
  });
}















