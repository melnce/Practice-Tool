
import { registerOp, EffectCtx } from "../registry.js";
import { handleSelect, TargetContext } from "../../targeting.js";
import { runEffects } from "../index.js";
import {
    handleSelfCostGate, handleSuperEvolvedAlliedGate, handleMaxPPGate,
    handleSkyboundArtGate, handleEvolvedAlliedGate,
    handleBoardNameGate, handleBothMaxPPGate, handleEvolvedSelfGate,
    handleSuperEvoGate, hasNoDuplicatesInDeck, noAllyAttackedThisTurn,
    handleRallyGate, amuletCountGate
} from "../../../effects/gates/gates.js";
import { handleComboAdd, handleComboGate } from "../../../effects/gates/combo.js";
import { handCountGate } from "../../../effects/gates/handCountGate.js";
import { handleChoose } from "../../../effects/ops/choose.js";
import { handleChooseBonusAdd } from "../../../effects/ops/misc.js";
import { handleRepeatEffect } from "../../../effects/repeat.js";
import { handleEvolveSelf, handleEvolveTarget, handleEvolveLastSummoned } from "../../../effects/ops/evolve.js";
import { Effect, CardInstance } from "../../../../core/types.js";
import { logEvent } from "../../../../core/logger.js";

const stub = (_op: string) => (_eff: Effect, _ctx: EffectCtx) => {
    // console.warn(`[Stub] Op '${op}' called but not implemented.`);
};

// Inline Helper for Super Evolved Self Gate (Missing in gates.js)
function handleSuperEvolvedSelfGate(eff: Effect, owner: string, sourceCard: CardInstance, effectsQueue: Effect[]) {
    const isSuper = !!(sourceCard && sourceCard.type === "Follower" && sourceCard.evoType === "super");
    const next = (isSuper ? eff.effects : eff.else_effects) || [];
    if (next.length && Array.isArray(effectsQueue)) {
        effectsQueue.unshift(...next);
    }
    logEvent("gateBranch", { gate: "super_evolved_self", branch: isSuper ? "effects" : "else_effects" });
    return "done";
}

export function registerMiscEffects() {
    registerOp("choose", handleChoose as any);
    console.log("[Registry] Registering choose_bonus_add. Handler:", handleChooseBonusAdd);
    registerOp("choose_bonus_add", handleChooseBonusAdd as any);

    // Generic Op: Nested Effects
    registerOp("nested_effects", (eff, ctx) => {
        const nested = (eff as any).effects;
        if (Array.isArray(nested) && nested.length > 0) {
            runEffects(nested, ctx.owner, ctx.sourceCard || null, ctx.context);
        }
    });

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

    // Stubs
    registerOp("target", stub("target")); // 'target' usually usually triggers checkTargeting?

    // Evolve Family
    registerOp("evolve", handleEvolveTarget as any);
    registerOp("evolve_self", (eff, ctx) => handleEvolveSelf(ctx.sourceCard!, ctx.owner));
    registerOp("super_evolve_self", (eff, ctx) => handleEvolveSelf(ctx.sourceCard!, ctx.owner, { mode: "super" }));
    registerOp("evolve_last_summoned", handleEvolveLastSummoned as any);
    registerOp("evolve_all_unevolved_allies", stub("evolve_all_unevolved_allies"));
    registerOp("evolve_all_allies_named", stub("evolve_all_allies_named"));
    registerOp("super_evolve_all_unevolved_allies", stub("super_evolve_all_unevolved_allies"));
    registerOp("super_evolve_ally", stub("super_evolve_ally"));
    registerOp("super_evolve", stub("super_evolve"));

    // Gates
    registerOp("amulet_count_gate", (eff, ctx) => {
        const ok = amuletCountGate(ctx.owner, eff);
        const next = ok ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) ctx.queue.unshift(...next);
    });


    registerOp("board_name_gate", (eff, ctx) => {
        if (handleBoardNameGate) {
            return handleBoardNameGate(ctx.owner, eff, ctx.queue);
        }
    });

    registerOp("both_max_pp_gate", (handleBothMaxPPGate || stub("both_max_pp_gate")) as any);
    registerOp("combo_gate", handleComboGate as any);
    registerOp("combo_add", handleComboAdd as any);
    registerOp("evolved_self_gate", (eff, ctx) => { (handleEvolvedSelfGate || stub("evolved_self_gate"))(eff, ctx.owner, ctx.sourceCard!, ctx.queue); });
    registerOp("super_evolve_gate", (eff, ctx) => {
        const ok = (handleSuperEvoGate || stub("super_evolve_gate"))(ctx.owner);
        // Wrapper for predicate-only gate
        const next = ok ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) ctx.queue.unshift(...next);
    });
    registerOp("super_evolved_self_gate", (eff, ctx) => { handleSuperEvolvedSelfGate(eff, ctx.owner, ctx.sourceCard!, ctx.queue); });
    registerOp("evolved_allied_gate", (eff, ctx) => handleEvolvedAlliedGate(ctx.owner, eff, ctx.queue));
    registerOp("super_evolved_allied_gate", (eff, ctx) => handleSuperEvolvedAlliedGate(ctx.owner, eff, ctx.queue));
    registerOp("hand_count_gate", handCountGate as any);
    registerOp("max_pp_gate", (eff, ctx) => handleMaxPPGate(ctx.owner, eff, ctx.queue));

    registerOp("no_ally_attacked_this_turn_gate", (noAllyAttackedThisTurn || stub("no_ally_attacked_this_turn_gate")) as any);
    registerOp("no_duplicates_in_deck_gate", (hasNoDuplicatesInDeck || stub("no_duplicates_in_deck_gate")) as any);
    registerOp("rally_gate", (eff, ctx) => { (handleRallyGate || stub("rally_gate"))(ctx.owner, eff, ctx.queue); });

    registerOp("repeat_effect", (eff, ctx) => handleRepeatEffect(eff, ctx.owner, ctx.sourceCard, ctx.queue));
    registerOp("skybound_art_gate", (eff, ctx) => { handleSkyboundArtGate(ctx.owner, eff, ctx.sourceCard); });
    registerOp("self_cost_gate", (eff, ctx) => { handleSelfCostGate(ctx.sourceCard!, eff, ctx.queue); });

    registerOp("set_deckout_victory", stub("set_deckout_victory"));
    registerOp("dragonsign", stub("dragonsign"));
}
