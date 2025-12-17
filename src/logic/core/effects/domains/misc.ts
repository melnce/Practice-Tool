
import { registerOp, EffectResult } from "../registry.js";
import { enqueueManyFront } from "../queue.js";
import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { handleSelect, getPool } from "../../targeting.js";
import { runEffects } from "../index.js"; // Needed for select runner context
import {
    handleSuperEvoGate, handleEvolvedSelfGate, amuletCountGate, hasNoDuplicatesInDeck,
    noAllyAttackedThisTurn, handleBoardNameGate, handleBothMaxPPGate, handleRallyGate,
    handleSelfCostGate, handleSuperEvolvedAlliedGate, handleMaxPPGate,
    handleSkyboundArtGate, handleEvolvedAlliedGate
} from "../../../effects/gates/gates.js";
import { handleComboAdd, handleComboGate } from "../../../effects/gates/combo.js";
import { handCountGate } from "../../../effects/gates/handCountGate.js";
import { handleChoose } from "../../../effects/ops/choose.js";
import { handleChooseBonusAdd } from "../../../effects/ops/misc.js";
import { handleRepeatEffect } from "../../../effects/repeat.js";
import { handleEvolveSelf, handleEvolveLastSummoned } from "../../../effects/ops/evolve.js";

const doLog = (event: string, payload: any) => logEvent(event, payload);

export function registerMiscEffects() {

    // Select / Choose
    registerOp("select", (eff, ctx): EffectResult => {
        if (eff.target && eff.target.startsWith("hand:")) {
            const h = ctx.owner === "blue" ? state.blueHand : state.redHand;
            console.warn(`[index.ts select] StateID: ${(state as any).__debugId} HandSize: ${h.length}`);
        }

        if (eff.op === "select" || eff.op === "target") {
            // Pass runner: runEffects to context so handleSelect can re-enter
            const opCtx = { ...(ctx.context as any), runner: runEffects };
            const status = handleSelect(eff, ctx.owner, ctx.sourceCard, ctx.queue, opCtx);
            if (status === "pending") return "pending";
        }
    });

    registerOp("choose", (eff, ctx) => {
        if (handleChoose(eff, ctx.owner, ctx.sourceCard, ctx.queue) === "pending") return "pending";
    });
    registerOp("choose_bonus_add", (eff, ctx) => handleChooseBonusAdd(ctx.owner, eff));

    // Evolve
    registerOp("evolve", (eff, ctx) => {
        import("../../../effects/ops/evolve.js").then(({ handleEvolveTarget }) => handleEvolveTarget(eff, ctx.owner, ctx.context as any));
    });
    registerOp("evolve_self", (eff, ctx) => {
        if (ctx.sourceCard) {
            handleEvolveSelf(ctx.sourceCard, ctx.owner, { spendPoint: false });
            doLog("evolve", { owner: ctx.owner, card: ctx.sourceCard.name });
        }
    });
    registerOp("super_evolve_self", (eff, ctx) => {
        if (ctx.sourceCard) handleEvolveSelf(ctx.sourceCard, ctx.owner, { mode: "super", spendPoint: false });
    });
    registerOp("evolve_last_summoned", (eff, ctx) => {
        handleEvolveLastSummoned(ctx.owner);
        doLog("evolve", { owner: ctx.owner, card: "(last summoned)" });
    });
    registerOp("evolve_all_unevolved_allies", (eff, ctx) => {
        const board = ctx.owner === "blue" ? state.blueBoard : state.redBoard;
        for (const ally of board) {
            if (ally.type === "Follower" && !ally.hasEvolved) {
                handleEvolveSelf(ally, ctx.owner, { spendPoint: false });
            }
        }
        doLog("evolve", { owner: ctx.owner, card: "(multi)" });
    });
    registerOp("evolve_all_allies_named", (eff, ctx) => {
        const board = ctx.owner === "blue" ? state.blueBoard : state.redBoard;
        const name = eff.name;
        for (const c of board) {
            if ((c.name === name || c.base_name === name) && c.type === "Follower" && !c.hasEvolved) {
                handleEvolveSelf(c, ctx.owner, { spendPoint: false });
            }
        }
        doLog("evolve", { owner: ctx.owner, card: `(named ${name})` });
    });
    registerOp("super_evolve_all_unevolved_allies", (eff, ctx) => {
        const board = ctx.owner === "blue" ? state.blueBoard : state.redBoard;
        for (const ally of board) {
            if (ally.type === "Follower" && !ally.hasEvolved) {
                handleEvolveSelf(ally, ctx.owner, { mode: "super", spendPoint: false });
            }
        }
        doLog("evolve", { owner: ctx.owner, card: "(multi-super)" });
    });
    registerOp("super_evolve_ally", (eff, ctx) => {
        import("../../../evolveUtils.js").then(({ superEvolveAllyFromContext }) => {
            superEvolveAllyFromContext(ctx.owner, ctx.sourceCard, ctx.context);
        });
    });

    // Gates
    registerOp("amulet_count_gate", (eff, ctx) => {
        const next = amuletCountGate(ctx.owner, eff) ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) enqueueManyFront(ctx, next);
    });
    registerOp("board_name_gate", (eff, ctx) => {
        const board = ctx.owner === "blue" ? state.blueBoard : state.redBoard;
        const hasCard = board.some(c => c?.name === eff.name);
        const next = hasCard ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) enqueueManyFront(ctx, next);
    });
    registerOp("both_max_pp_gate", (eff, ctx) => handleBothMaxPPGate(eff, ctx.queue));
    registerOp("combo_gate", (eff, ctx) => {
        if (handleComboGate(ctx.owner, eff as any)) { enqueueManyFront(ctx, eff.effects || []); }
        else { enqueueManyFront(ctx, eff.else_effects || []); }
    });
    registerOp("combo_add", (eff, ctx) => handleComboAdd(ctx.owner, eff as any));

    registerOp("evolved_self_gate", (eff, ctx) => { handleEvolvedSelfGate(eff, ctx.owner, ctx.sourceCard!, ctx.queue); });
    registerOp("super_evolve_gate", (eff, ctx) => { if (handleSuperEvoGate(ctx.owner)) enqueueManyFront(ctx, eff.effects || []); });
    registerOp("super_evolved_self_gate", (eff, ctx) => {
        const isSuper = ctx.sourceCard && ctx.sourceCard.evoType === "super";
        const next = (isSuper ? eff.effects : eff.else_effects) || [];
        if (next.length) enqueueManyFront(ctx, next);
    });
    registerOp("evolved_allied_gate", (eff, ctx) => handleEvolvedAlliedGate(ctx.owner, eff, ctx.queue));
    registerOp("super_evolved_allied_gate", (eff, ctx) => handleSuperEvolvedAlliedGate(ctx.owner, eff, ctx.queue));

    registerOp("hand_count_gate", (eff, ctx) => {
        const pass = handCountGate(ctx.owner, eff);
        const next = pass ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) enqueueManyFront(ctx, next);
    });
    registerOp("max_pp_gate", (eff, ctx) => handleMaxPPGate(ctx.owner, eff, ctx.queue));
    registerOp("nested_effects", (eff, ctx) => { if (eff.effects?.length) enqueueManyFront(ctx, eff.effects); });
    registerOp("no_ally_attacked_this_turn_gate", (eff, ctx) => {
        const pass = noAllyAttackedThisTurn(ctx.owner);
        const next = pass ? (eff.effects || []) : (eff.else_effects || []);
        if (next.length) enqueueManyFront(ctx, next);
    });
    registerOp("no_duplicates_in_deck_gate", (eff, ctx) => {
        if (hasNoDuplicatesInDeck(ctx.owner)) { enqueueManyFront(ctx, eff.effects || []); }
    });
    registerOp("rally_gate", (eff, ctx) => handleRallyGate(ctx.owner, eff, ctx.queue));
    registerOp("repeat_effect", (eff, ctx) => handleRepeatEffect(eff, ctx.owner, ctx.sourceCard, ctx.queue));
    registerOp("skybound_art_gate", (eff, ctx) => {
        if (handleSkyboundArtGate(ctx.owner, eff, ctx.sourceCard)) { enqueueManyFront(ctx, eff.effects || []); }
        else { enqueueManyFront(ctx, eff.else_effects || []); }
    });
    registerOp("self_cost_gate", (eff, ctx) => handleSelfCostGate(ctx.sourceCard!, eff, ctx.queue));

    registerOp("set_deckout_victory", (eff, ctx) => {
        const enable = (eff as any).enabled !== false;
        if (ctx.owner === "blue") state.deckoutWinsBlue = enable; else state.deckoutWinsRed = enable;
    });

    registerOp("himeka_crest_effect", (eff, ctx) => console.warn("Legacy himeka op used"));
    registerOp("dragonsign", (eff, ctx) => { /* no-op in switch currently, likely removed/stubbed */ });
}

import { MISC_OPS } from "./miscOps.js";
export const OPS = MISC_OPS;
