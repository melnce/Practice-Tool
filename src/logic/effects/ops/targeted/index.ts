// src/logic/effects/ops/targeted/index.ts
import { state } from "../../../../core/gameState.js";
// @ts-ignore
import { adapter } from "../../../../core/adapter.js";
import { runEffects } from "../../../core/effects/index.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { dealDamage } from "../../../core/barrier.js";
import { applyKeyword, handleRemoveKeyword } from "../../../core/keywords.js";
// @ts-ignore
import { transformTarget, transformHandTarget } from "../transform.js";
// @ts-ignore
import { resolveDestroy } from "../destroy.js";
// @ts-ignore
import { handleBanish } from "../banish.js";
// @ts-ignore
import { bounceToHand } from "../bounce.js";
// @ts-ignore
import { resolveReturnHandToDeck } from "../returnHandToDeck.js";
// clearSelectableFlags is NOT imported because handlers must not use it.
import { isOverflow } from "../../../../helpers/overflow.js";
// @ts-ignore
import { onEvolve } from "../../evolveUtils.js";
import { fireTrigger } from "../../../core/triggers.js";
// @ts-ignore
import { summonNamed, summonExactCopyFromHand } from "../summon.js";
// @ts-ignore
import { applyLeaderDamage } from "../../leader.js";
import { resolveAmountWithOverflow } from "../damage.js";
import {
    fuse_finalize_generic as opFinalizeFuseGeneric,
    fuse_finalize_fortifier as opFinalizeFortifierFuse,
    fuse_finalize_gear_multi as opFinalizeGearMulti,
    fuse_finalize_alpha as opFinalizeAlphaFuse,
    fuse_finalize_gardens_allure as opFinalizeGardensAllure,
    fuse_finalize_loot as opFinalizeLootFuse,
    // @ts-ignore
} from "../fuse/fuse.js";

// @ts-ignore
import { getCardDetails } from "../../../../data/cardDatabase.js";
// @ts-ignore
import { handleEvolveSelf } from "../evolve.js";
import { logEvent } from "../../../../core/logger.js";
import { doAction } from "../../../../core/history.js";
import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { injectDescAndBadge } from "../../../../ui/text.js";
import { TargetedOpContext, DispatchResult } from "../../../core/targeting/types.js";
import { startDispatch, endDispatch, runWithBypass } from "../../../core/targeting/guards.js";

type TargetedOpHandler = (ctx: TargetedOpContext) => DispatchResult;
const TARGETED_OP_HANDLERS: Map<string, TargetedOpHandler> = new Map();

// Accessors for testing
// Accessors for testing
export function __getRegisteredTargetedOps(): string[] { return Array.from(TARGETED_OP_HANDLERS.keys()); }
export function __registerMockHandler(op: string, handler: TargetedOpHandler) { TARGETED_OP_HANDLERS.set(op, handler); }

/**
 * Executes the handler for the given operation.
 * 
 * CONTRACT/SAFEGUARDS:
 * - Activates `guardLifecycle` tripwires during execution.
 * - Validates handler existence (throws detailed error if missing).
 * - Returns `DispatchResult` ("handled" or "paused") to guide Orchestrator cleanup.
 * - Handlers must be pure state mutators (no side effects on UI/Lifecycle).
 * - See docs/targeting-contract.md
 */
export function dispatchTargetedOp(opCtx: TargetedOpContext): DispatchResult {
    const handler = TARGETED_OP_HANDLERS.get(opCtx.eff.op);
    if (!handler) {
        // Step 2: Actionable Error
        const targetsSummary = opCtx.targets.map(t => `${t.name}(${t.uid})`).join(", ");
        const errorMsg = [
            `[dispatchTargetedOp] Unknown op: "${opCtx.eff.op}"`,
            `Source: ${opCtx.sourceCard?.name || "Unknown"} (${opCtx.sourceCard?.uid})`,
            `Owner: ${opCtx.owner}`,
            `Targets (${opCtx.targets.length}): ${targetsSummary}`
        ].join(" | ");
        throw new Error(errorMsg);
    }

    try {
        startDispatch(opCtx.eff.op);
        return handler(opCtx);
    } finally {
        endDispatch();
    }
}

// Handler Definitions
// Contract: Handlers mutate state only. No cleanup, no resumeEffects, no render.

TARGETED_OP_HANDLERS.set("damage", (ctx) => {
    const { eff, owner, sourceCard, targets } = ctx;
    const amt = resolveAmountWithOverflow(eff, owner, { sourceCard });
    if (amt) {
        for (const target of targets) {
            if (target.type === "Follower") dealDamage(target, amt);
        }
        cleanupDead();
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("transform", (ctx) => {
    const { eff, owner, targets } = ctx;
    const intoName = String(eff.into ?? (eff as any).name ?? "").trim();
    const target = targets?.[0];
    if (!target || !intoName) return { kind: "handled" }; // Failure to resolve is still "handled" (no-op)
    if (state.blueHand.includes(target) || state.redHand.includes(target)) transformHandTarget(target, intoName);
    else transformTarget(target, intoName);
    logEvent("transform", { owner, target: target.name, into: intoName });
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("keyword", (ctx) => {
    const { eff, sourceCard, targets } = ctx;
    for (const target of targets) {
        for (const k of ((eff as any).keywords || [])) {
            const name = (typeof k === "string" ? k : k?.name) || "";
            applyKeyword(target, name, typeof k === "object" ? k : undefined);
        }
        // Logic specific injections
        if (sourceCard?.name?.toLowerCase() === "flight of icarus") injectDescAndBadge(target, `<span style="color: orange;">Rush<br>Last Words: Draw a card</span>`, ["Rush", "Last Words: Draw a card"]);
        if (sourceCard?.name?.toLowerCase() === "carnelia, ember of darkness") injectDescAndBadge(target, `<span style="color: orange;">Ward<br>Can't be destroyed by abilities</span>`, ["Ward", "Can't be destroyed by abilities"]);
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("discard_select_hand", (ctx) => {
    const { owner, targets } = ctx;
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
    const discarded: CardInstance[] = [];
    for (const t of targets) {
        const idx = hand.findIndex(c => c.uid === t.uid);
        if (idx !== -1) {
            const [d] = hand.splice(idx, 1);
            if (d) {
                grave.push(d);
                discarded.push(d);
            }
        }
    }
    if (targets.length > 0) {
        if (owner === "blue") state.blueShadows += targets.length;
        else state.redShadows += targets.length;
    }
    if (discarded.length) {
        state.lastDiscardedCosts = discarded.map(c => parseInt(c.cost as any, 10) || 0);
        state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
    }
    for (const dc of discarded) {
        if (Array.isArray((dc as any).on_discard)) runEffects([...(dc as any).on_discard], owner, dc);
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("buff", (ctx) => {
    const { eff, owner, targets } = ctx;
    const a = parseInt((eff as any).attack || 0) || 0;
    const d = parseInt((eff as any).defense || 0) || 0;
    const rawTribes = (eff as any).tribes ? (Array.isArray((eff as any).tribes) ? (eff as any).tribes : [(eff as any).tribes]) : (eff as any).tribe ? [(eff as any).tribe] : null;
    const tribeOk = (card: CardInstance) => {
        if (!rawTribes) return true;
        const want = rawTribes.map((t: any) => String(t).toLowerCase());
        return Array.isArray(card.tribes) && card.tribes.some(tr => want.includes(String(tr).toLowerCase()));
    };
    for (const target of targets.filter(tribeOk)) {
        if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
        target.buffs.attack = (target.buffs.attack ?? 0) + a;
        target.buffs.defense = (target.buffs.defense ?? 0) + d;
        target.attack = Math.max(0, (parseInt(target.attack as any) || 0) + a);
        target.defense = (parseInt(target.defense as any) || 0) + d;
        target.peak_defense = Math.max(target.peak_defense ?? (target.defense as number), target.defense as number);
        if (!target.potential_attack) target.potential_attack = target.base_attack || target.attack;
        if (!target.potential_defense) target.potential_defense = (target.base_defense || target.defense) as number;
        (target as any).potential_attack += a;
        (target as any).potential_defense += d;
        if (d < 0 && target.type === "Follower") {
            const targetOwner = state.blueBoard.includes(target) ? "blue" : state.redBoard.includes(target) ? "red" : null;
            if (targetOwner) fireTrigger("enemy_follower_defense_down", owner as any, { target });
        }
    }
    cleanupDead();
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("banish", (ctx) => {
    const { owner, targets } = ctx;
    for (const target of targets) {
        fireTrigger("allied_follower_leaves_field", owner as any);
        handleBanish(target);
        logEvent("banish", { owner, target: target.name });
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("return_to_hand", (ctx) => {
    const { owner, targets } = ctx;
    for (const target of targets) {
        bounceToHand(target);
        logEvent("bounce", { owner, target: target.name });
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("bounce", (ctx) => {
    const { owner, targets } = ctx;
    for (const target of targets) {
        bounceToHand(target);
        logEvent("bounce", { owner, target: target.name });
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("return_hand_to_deck", (ctx) => {
    const { owner, targets } = ctx;
    for (const target of targets) {
        resolveReturnHandToDeck(target, owner);
        logEvent("returnToDeck", { owner, target: target.name });
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("remove_keyword", (ctx) => {
    const { eff, owner, targets } = ctx;
    handleRemoveKeyword({ ...eff, select: false }, owner, targets);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy", (ctx) => {
    const { owner, targets } = ctx;
    for (const target of targets) {
        const targetOwner = state.blueBoard.includes(target) ? "blue" : state.redBoard.includes(target) ? "red" : owner;
        if (resolveDestroy(target, targetOwner)) logEvent("destroy", { owner, target: target.name });
    }
    cleanupDead();
    // State cleanup moved to Orchestrator
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy_then", (ctx) => {
    const { eff, owner, sourceCard, targets } = ctx;
    let destroyedCount = 0;
    for (const target of targets) {
        const targetOwner = state.blueBoard.includes(target) ? "blue" : state.redBoard.includes(target) ? "red" : owner;
        if (resolveDestroy(target, targetOwner)) {
            destroyedCount++;
            logEvent("destroy", { owner, target: target.name });
        }
    }
    cleanupDead();
    if (destroyedCount > 0 && Array.isArray((eff as any).effects)) {
        // Run nested effects (immediate mutation)
        runEffects([...((eff as any).effects)], owner, sourceCard, { selectedCard: targets?.[0] || null, targets });
    }
    // State cleanup moved to Orchestrator
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("damage_follower_or_leader", (ctx) => {
    const { eff, owner, targets } = ctx;
    const target = targets[0];
    const amt = (eff as any).amount as number;
    if (!target) {
        if (owner === "blue") state.redHP = Math.max(0, state.redHP - amt);
        else state.blueHP = Math.max(0, state.blueHP - amt);
    } else if (target.type === "Follower") {
        dealDamage(target, amt);
        cleanupDead();
    } else if (target.type === "Leader") {
        if (owner === "blue") state.redHP = Math.max(0, state.redHP - amt);
        else state.blueHP = Math.max(0, state.blueHP - amt);
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("super_evolve_ally", (ctx) => {
    const { owner, sourceCard, targets } = ctx;
    const target = targets?.[0];
    if (!target) return { kind: "handled" };
    if (sourceCard && target.uid === sourceCard.uid) return { kind: "handled" };
    if (target.hasEvolved) return { kind: "handled" };
    handleEvolveSelf(target, owner, { mode: "super", spendPoint: false });
    logEvent("evolve", { owner, target: target.name, mode: "super" });
    // adapter.render() moved to Orchestrator
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("super_evolve_self", (ctx) => {
    const { owner, sourceCard } = ctx;
    if (!sourceCard) return { kind: "handled" };
    handleEvolveSelf(sourceCard, owner, { mode: "super", spendPoint: false });
    logEvent("evolve", { owner, target: sourceCard.name, mode: "super" });
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("evolve_and_buff", (ctx) => {
    const { eff, targets } = ctx;
    const target = targets[0];
    if (!target) return { kind: "handled" };
    if (!target.base_attack) target.base_attack = parseInt(target.attack as any) || 0;
    if (!target.base_defense) target.base_defense = parseInt(target.defense as any) || 0;
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
    (target as any).base_attack += 2;
    (target as any).base_defense += 2;
    target.attack = (target as any).base_attack;
    target.defense = (target as any).base_defense;
    const a = parseInt((eff as any).attack || 0) || 0;
    const d = parseInt((eff as any).defense || 0) || 0;
    target.buffs.attack = (target.buffs.attack ?? 0) + a;
    target.buffs.defense = (target.buffs.defense ?? 0) + d;
    (target as any).attack += a;
    (target as any).defense += d;
    target.potential_attack = (target as any).base_attack + (target.buffs.attack ?? 0);
    target.potential_defense = (target as any).base_defense + (target.buffs.defense ?? 0);
    target.peak_defense = Math.max(target.peak_defense ?? (target.defense as number), target.defense as number);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_generic", (ctx) => {
    const { eff, owner, targets } = ctx;
    if (targets[0]) opFinalizeFuseGeneric(owner, (eff as any).initiator_uid, targets[0], (eff as any).result);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_fortifier", (ctx) => {
    const { eff, owner, targets } = ctx;
    if (targets?.length) opFinalizeFortifierFuse(owner, (eff as any).initiator_uid, targets);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_alpha", (ctx) => {
    const { eff, owner, targets } = ctx;
    opFinalizeAlphaFuse(owner, (eff as any).initiator_uid, targets || []);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_gear_multi", (ctx) => {
    const { eff, owner, targets } = ctx;
    opFinalizeGearMulti(owner, (eff as any).initiator_uid, targets, (eff as any).result_name);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_gardens_allure", (ctx) => {
    const { eff, owner, targets } = ctx;
    if (targets?.length) opFinalizeGardensAllure(owner, (eff as any).initiator_uid, targets);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse_finalize_loot", (ctx) => {
    const { eff, owner, targets } = ctx;
    opFinalizeLootFuse(owner, (eff as any).initiator_uid, targets || []);
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("select_hand_summon_artifact_copies_eot_destroy", (ctx) => {
    const { owner, targets } = ctx;
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    for (const handCard of targets) {
        if ((board?.length || 0) >= 5) break;
        const copy = summonExactCopyFromHand(handCard, owner);
        if (!copy) continue;
        copy.triggers = Array.isArray(copy.triggers) ? copy.triggers : [];
        copy.triggers.push({ event: "end_of_turn", source: "board", condition: { whose_turn: "opponent" }, effects: [{ op: "destroy_self" }] });
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("select_hand_summon_artifact_copy", (ctx) => {
    const { owner, targets } = ctx;
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    for (const handCard of targets) {
        if ((board?.length || 0) >= 5) break;
        summonExactCopyFromHand(handCard, owner);
    }
    return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("nested_effects", (ctx) => {
    const { eff, owner, sourceCard, targets } = ctx;
    doAction("Resolve Targets", () => {
        for (const target of targets) {
            for (const nestedEff of ((eff as any).effects || [])) {
                if (nestedEff.op === "set_stats") {
                    if (nestedEff.attack !== undefined) {
                        target.attack = parseInt(nestedEff.attack);
                        target.potential_attack = target.attack as number;
                        target.base_attack = target.attack as number;
                    }
                    if (nestedEff.defense !== undefined) {
                        target.defense = parseInt(nestedEff.defense);
                        target.potential_defense = target.defense as number;
                        target.base_defense = target.defense as number;
                        target.peak_defense = target.defense as number;
                    }
                } else {
                    runWithBypass(() => {
                        runEffects([nestedEff], owner, target);
                    });
                }
            }
        }


        // State cleanup moved to Orchestrator
    }, { op: eff?.op, owner, source: sourceCard?.name }, { autoRender: false });
    return { kind: "handled" };
});
