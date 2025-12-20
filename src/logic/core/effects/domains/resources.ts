
import { registerOp } from "../registry.js";
import { state } from "../../../../core/gameState.js";
import { addMaxPP } from "../../../pp.js";
import {
    handleDraw, handleDrawAllNamedWithKeyword, handleDrawFiltered,
    handleAddToHand, handleDrawComboFollower, handleDrawOpponent,
    handleDrawNamed
} from "../../../effects/ops/draw.js";
import {
    handleDiscardSelectHand, handleTransformInHand, handleDiscardAllExceptNamed
} from "../../../effects/hand.js";
import { handleRecoverPP, handleRecoverEP } from "../../../effects/leader.js";
import { handleReplaceDeck } from "../../../effects/deck.js";
import { handleGainMaxPP, handleSetCostLastDrawn } from "../../../effects/ops/misc.js";
import { consumeEarthSigils } from "../../../effects/ops/earth.js";
import { hasNecromancy, spendShadows } from "../../../../helpers/necromancy.js";
import { isOverflow } from "../../../../helpers/overflow.js";
import {
    opStartFuseFromCard, startFortifierFuse,
    fuse_finalize_generic, fuse_finalize_alpha,
    fuse_finalize_gear_multi, fuse_finalize_fortifier,
    fuse_finalize_gardens_allure, fuse_finalize_loot
} from "../../../effects/ops/fuse/fuse.js";
import { crestAddCounter, crestSpendCounter, handleGainCrest, removeCrest, crestAdvanceCountdown } from "../../../effects/crest.js";
import { logEvent } from "../../../../core/logger.js";
import { getAdapter, getTargetingContext } from "../context.js";
import { enqueueManyFront } from "../queue.js";

const doLog = (event: string, payload: any) => logEvent(event, payload);

export function registerResourceEffects() {

    // PP
    registerOp("add_max_pp", (eff, ctx) => addMaxPP(ctx.owner, (eff.amount as number) || 1));
    registerOp("gain_max_pp", (eff, ctx) => handleGainMaxPP(ctx.owner, eff));
    registerOp("recover_pp", (eff, ctx) => handleRecoverPP(ctx.owner, eff));
    registerOp("recover_ep", (eff, ctx) => handleRecoverEP(ctx.owner, eff));

    // Shadows / Necromancy
    registerOp("add_shadows", (eff, ctx) => {
        const amt = (eff.amount || 1) as number;
        if (ctx.owner === "blue") state.blueShadows = (state.blueShadows || 0) + amt;
        else state.redShadows = (state.redShadows || 0) + amt;
    });
    registerOp("necromancy_gate", (eff, ctx) => {
        const cost = eff.cost || 1;
        if (hasNecromancy(ctx.owner, cost)) {
            spendShadows(ctx.owner, cost);
            doLog("necromancySpend", { owner: ctx.owner, cost });
            if (eff.effects) enqueueManyFront(ctx, eff.effects);
        }
    });

    // Overflow
    registerOp("overflow_gate", (eff, ctx) => {
        if (isOverflow(ctx.owner) && eff.effects) enqueueManyFront(ctx, eff.effects);
    });

    // Earth Rite
    registerOp("earth_rite", (eff, ctx) => {
        if (consumeEarthSigils(ctx.owner, (eff.amount as number) || 1)) {
            if (eff.effects) enqueueManyFront(ctx, eff.effects);
        }
    });

    // Draw / Hand
    registerOp("draw", (eff, ctx) => handleDraw(eff, ctx.owner));
    registerOp("draw_all_named_with_keyword", (eff, ctx) => handleDrawAllNamedWithKeyword(eff, ctx.owner));
    registerOp("draw_combo_follower", (eff, ctx) => handleDrawComboFollower(eff, ctx.owner));
    registerOp("draw_filtered", (eff, ctx) => handleDrawFiltered(eff, ctx.owner));
    registerOp("draw_named", (eff, ctx) => handleDrawNamed(eff, ctx.owner));
    registerOp("draw_opponent", (eff, ctx) => handleDrawOpponent(eff, ctx.owner));
    registerOp("add_to_hand", (eff, ctx) => handleAddToHand(eff, ctx.owner));

    registerOp("add_selected_copy_to_hand", (eff, ctx) => {
        const tCtx = getTargetingContext(ctx);
        const t = (tCtx as any).selectedCard || (tCtx.targets?.[0] || null);
        if (t && t.name) {
            handleAddToHand({ count: eff.count ?? 1, name: t.name } as any, ctx.owner);
        }
    });

    registerOp("discard_select_hand", (eff, ctx) => {
        if (handleDiscardSelectHand(eff, ctx.owner, ctx.queue) === "pending") return "pending";
    });
    registerOp("discard_all_except_named", (eff, ctx) => handleDiscardAllExceptNamed(eff, ctx.owner));

    registerOp("transform_in_hand", (eff, ctx) => handleTransformInHand(eff, ctx.owner));
    registerOp("transform_random_spell_in_hand", (eff, ctx) => {
        void import("../../../effects/ops/transform.js").then(({ transformRandomSpellInHand }) => {
            transformRandomSpellInHand(ctx.owner, (eff as any).into || "Ersatz Elimination");
        });
    });

    // Gate / Deck
    registerOp("replace_deck", (eff, ctx) => handleReplaceDeck(ctx.owner, eff));
    registerOp("replace_deck_with_set_minus", (eff, ctx) => {
        void import("../../../effects/deck.js").then(({ replaceDeckWithSetMinus }) => {
            void replaceDeckWithSetMinus(ctx.owner, eff).then(() => getAdapter(ctx).render());
        });
    });
    registerOp("set_cost_last_drawn", (eff) => handleSetCostLastDrawn(eff));
    registerOp("halve_deck_cost", (eff, ctx) => {
        void import("../../../effects/cost.js").then(({ handleHalveDeckCost }) => handleHalveDeckCost(ctx.owner));
    });
    registerOp("reduce_deck_followers_cost", (eff, ctx) => {
        void import("../../../effects/cost.js").then(({ reduceDeckFollowersCost }) => {
            const amt = parseInt(String(eff.amount ?? 1)) || 1;
            void reduceDeckFollowersCost(ctx.owner, amt);
        });
    });

    // Crest / Fuse
    registerOp("gain_crest", (eff, ctx) => {
        // Construct strictly typed payload if necessary, or just pass eff if handleGainCrest accepts it.
        // handleGainCrest signature in crest.ts likely expects { op, name }.
        // We use eff directly as strict CrestEffect.
        // If handleGainCrest signature is loose, we call it safely.
        handleGainCrest(eff, ctx.owner);
        doLog("gainCrest", { owner: ctx.owner, crest: eff.name || eff.crest });
    });
    registerOp("crest_add_counter", (eff, ctx) => {
        crestAddCounter(ctx.owner, eff.crest || eff.name || "Main", eff.counter || "faith", eff.amount ?? 1);
    });
    registerOp("crest_pay_counter", (eff, ctx) => {
        const ok = crestSpendCounter(ctx.owner, eff.crest || eff.name || "Main", eff.counter || "faith", eff.amount ?? 1);
        const chain = ok ? (eff.on_success_effects || eff.effects || []) : (eff.else_effects || []);
        if (chain.length) enqueueManyFront(ctx, chain);
    });

    registerOp("destroy_crest", (eff, ctx) => {
        const anyEff = eff as any;
        const targetOwner = (anyEff.player === "opponent" && ctx.owner) ? (ctx.owner === "blue" ? "red" : "blue") : ctx.owner;
        const name = anyEff.name || anyEff.crest;
        if (name) removeCrest(targetOwner, name);
    });

    registerOp("crest_advance_countdown", (eff, ctx) => {
        const anyEff = eff as any;
        const name = anyEff.name || anyEff.crest;
        if (name) crestAdvanceCountdown(ctx.owner, name, (anyEff.amount as number) || 1);
    });

    registerOp("fuse_start", (eff, ctx) => {
        if (opStartFuseFromCard(eff, ctx.owner) === "pending") return "pending";
        doLog("fuse", { owner: ctx.owner, op: eff.op, source: ctx.sourceCard?.name });
    });

    registerOp("start_fortifier_fuse", (eff, ctx) => {
        const res = ctx.sourceCard ? startFortifierFuse(ctx.owner, ctx.sourceCard) : null;
        if (res === "pending") return "pending";
        doLog("fuse", { owner: ctx.owner, op: eff.op, source: ctx.sourceCard?.name });
    });
    registerOp("start_fuse_from_card", (eff, ctx) => {
        if (opStartFuseFromCard(eff, ctx.owner) === "pending") return "pending";
        doLog("fuse", { owner: ctx.owner, op: eff.op, source: ctx.sourceCard?.name });
    });

    registerOp("fuse_finalize_generic", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        // generic takes single partner
        const p = partners[0];
        if (eff.initiator_uid && p) {
            fuse_finalize_generic(ctx.owner, eff.initiator_uid, p, eff.result);
        }
    });

    registerOp("fuse_finalize_alpha", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        if (eff.initiator_uid) {
            fuse_finalize_alpha(ctx.owner, eff.initiator_uid, partners);
        }
    });

    registerOp("fuse_finalize_gear_multi", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        if (eff.initiator_uid) {
            fuse_finalize_gear_multi(ctx.owner, eff.initiator_uid, partners, eff.result);
        }
    });

    registerOp("fuse_finalize_fortifier", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        if (eff.initiator_uid) {
            fuse_finalize_fortifier(ctx.owner, eff.initiator_uid, partners);
            doLog("fuse", { owner: ctx.owner, op: eff.op, source: ctx.sourceCard?.name });
        }
    });

    registerOp("fuse_finalize_gardens_allure", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        if (eff.initiator_uid) {
            fuse_finalize_gardens_allure(ctx.owner, eff.initiator_uid, partners);
        }
    });

    registerOp("fuse_finalize_loot", (eff, ctx) => {
        const partners = (ctx.context as any)?.targets || [];
        if (eff.initiator_uid) {
            fuse_finalize_loot(ctx.owner, eff.initiator_uid, partners);
        }
    });
}

import { RESOURCE_OPS } from "./resourcesOps.js";
export const OPS = RESOURCE_OPS;
