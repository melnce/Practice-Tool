// src/logic/effects/ops/fuse/fuse.ts
import { state } from "../../../../core/gameState.js";
import { render } from "../../../../ui/render.js";
import { highlightSelectable, clearSelectableFlags } from "../../../core/targeting.js";
import { fireTrigger } from "../../../core/triggers.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { makeUid } from "../../../../core/rng.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, GameState, Player } from "../../../../core/types.js";

// Class-specific modules
// @ts-ignore
import {
    startGearMultiSelect,
    startAlphaSelect,
    startFortifierFuse,
    fuse_finalize_alpha,
    fuse_finalize_gear_multi,
    fuse_finalize_fortifier,
} from "./fuse.artifact.js";

// @ts-ignore
import {
    fuse_finalize_gardens_allure,
} from "./fuse.forest.js";

// @ts-ignore
import {
    fuse_finalize_loot,
} from "./fuse.loot.js";

// Re-export finalize handlers so runEffects can find them by op string
export {
    fuse_finalize_alpha,
    fuse_finalize_gear_multi,
    fuse_finalize_fortifier,
    fuse_finalize_gardens_allure,
    fuse_finalize_loot,
    startFortifierFuse,
};

// -------------------- shared helpers --------------------
function handOf(owner: Player) {
    return owner === "blue" ? state.blueHand : state.redHand;
}

function alreadyFusedThisTurn(card: CardInstance | null) {
    return !!card && card.lastFuseRound === state.roundCount;
}

function filterByPartnerFilters(candidates: CardInstance[], filters: any[] = []) {
    if (!Array.isArray(filters) || filters.length === 0) return candidates;

    const pass = (card: CardInstance, f: any) => {
        if (f.zone && f.zone !== "hand") return false;

        // @ts-ignore
        const cType = String(card?.type || "").toLowerCase();
        // @ts-ignore
        const cClass = String(card?.class || "").toLowerCase();
        const wantType = String(f.type ?? f.type_eq ?? "").toLowerCase();
        const wantClass = String(f.class ?? f.class_eq ?? "").toLowerCase();

        if (wantType && cType !== wantType) return false;
        if (wantClass && cClass !== wantClass) return false;

        if (Array.isArray(f.name_in) && !f.name_in.includes(card.name)) return false;
        // @ts-ignore
        if (f.tribe && !(Array.isArray(card.tribes) && card.tribes.includes(f.tribe))) return false;

        if (Number.isFinite(f.cost_max)) {
            const effCost = (Number(card?.effectiveCost) ?? Number(card?.cost) ?? 0) + (Number(card?.cost_mod) || 0);
            if (effCost > f.cost_max) return false;
        }
        // @ts-ignore
        if (f.keyword && !Array.isArray(card?.keywords)?.some(k => (k?.name || k) === f.keyword)) return false;
        return true;
    };

    return candidates.filter(c => filters.some(f => pass(c, f)));
}

function buildPartnerPool(owner: Player, initiator: CardInstance) {
    const hand = handOf(owner);
    const recipes = initiator?.fuse_recipes;
    if (!Array.isArray(recipes) || recipes.length === 0) return null;

    for (let rIndex = 0; rIndex < recipes.length; rIndex++) {
        const r = recipes[rIndex];
        const pool = filterByPartnerFilters(
            hand.filter(c => c?.uid !== initiator.uid),
            r.partner_filters
        );
        if (pool.length) return { recipe: r, recipeIndex: rIndex, pool };
    }
    return null;
}

// -------------------- central starter --------------------
export function opStartFuseFromCard(eff: any, owner: Player) {
    const hand = handOf(owner);
    const initiatorUid = eff?.initiator_uid;
    if (!initiatorUid) return;

    const initiator = hand.find(c => c?.uid === initiatorUid);
    if (!initiator) return;

    if (alreadyFusedThisTurn(initiator)) {
        console.warn("[Fuse] This copy already fused this turn.");
        logEvent("fuseBlocked", { owner, reason: "already_fused_this_turn", initiator: initiator?.name });
        clearSelectableFlags();
        render();
        return "done";
    }

    // --- Portalcraft special cases ---
    if (initiator?.name === "Gear of Ambition" || initiator?.name === "Gear of Remembrance") {
        return startGearMultiSelect(owner, initiator);
    }
    if (initiator?.name === "Ominous Artifact α") {
        return startAlphaSelect(owner, initiator);
    }

    // --- Generic single/multi partner path (honors recipe.finalize_op) ---
    const info = buildPartnerPool(owner, initiator);
    if (!info) return;

    // If recipe provides a custom finalize op, use a confirmable multi-select
    if (info.recipe?.finalize_op) {
        state.pendingTargetEffect = {
            eff: { op: info.recipe.finalize_op, initiator_uid: initiator.uid },
            owner,
            sourceCard: initiator,
            pool: info.pool,
            selectCount: info.pool.length,
            targets: [],
            resumeEffects: [],
            requiresConfirmation: true,
            confirmationText: "Fuse Selected Cards",
        };
        logEvent("fuseOpen", {
            owner,
            initiator: initiator.name,
            initiatorUid: initiator.uid,
            recipe: info?.recipe?.id || null,
            pool: info?.pool?.length || 0,
            finalize: info?.recipe?.finalize_op || "fuse_finalize_generic"
        });
        highlightSelectable(info.pool);
        render();
        return "pending";
    }

    // Otherwise fall back to generic transform/waste (kept for backward compatibility)
    state.pendingTargetEffect = {
        eff: {
            op: "fuse_finalize_generic",
            initiator_uid: initiator.uid,
            // @ts-ignore
            recipe_id: info.recipe?.id || null,
            recipe_index: info.recipeIndex,
            // @ts-ignore
            result: info.recipe?.result || null
        },
        owner,
        sourceCard: initiator,
        pool: info.pool,
        selectCount: 1,
        targets: [],
        resumeEffects: [],
    };

    logEvent("fuseOpen", {
        owner,
        initiator: initiator.name,
        initiatorUid: initiator.uid,
        recipe: info?.recipe?.id || null,
        pool: info?.pool?.length || 0,
        finalize: info?.recipe?.finalize_op || "fuse_finalize_generic"
    });
    highlightSelectable(info.pool);
    render();
    return "pending";
}

// -------------------- generic finalize (unchanged behavior) --------------------
export function fuse_finalize_generic(owner: Player, initiatorUid: string, partnerCard: CardInstance, resultSpec: any) {
    const hand = handOf(owner);

    const iIdx = hand.findIndex(c => c?.uid === initiatorUid);
    const pIdx = hand.findIndex(c => c?.uid === partnerCard?.uid);
    if (iIdx === -1 || pIdx === -1) { clearSelectableFlags(); render(); return; }

    const iCard = hand[iIdx];
    const pCard = hand[pIdx];

    if (resultSpec?.type === "waste") {
        if (resultSpec.consume === "partner") {
            hand.splice(pIdx, 1);
        } else if (resultSpec.consume === "initiator") {
            hand.splice(iIdx, 1);
        }
        state.lastFuse = {
            owner,
            time: Date.now(),
            initiator_name: iCard?.name,
            partner_name: pCard?.name,
            result_name: "wasted"
        };
        clearSelectableFlags(); render(); return;
    }

    if (!resultSpec || resultSpec.type !== "transform") {
        clearSelectableFlags(); render(); return;
    }

    const tmpl = getCardDetails(resultSpec.result_card_name);
    if (!tmpl) { clearSelectableFlags(); render(); return; }

    const mk = () => {
        const c = JSON.parse(JSON.stringify(tmpl));
        c.uid = makeUid();
        return c;
    };

    const targets = String(resultSpec.targets || "merge").toLowerCase();

    if (targets === "merge") {
        const min = Math.min(iIdx, pIdx);
        const max = Math.max(iIdx, pIdx);
        hand[min] = mk();
        hand.splice(max, 1);
    } else if (targets === "initiator") {
        hand[iIdx] = mk();
    } else if (targets === "partner") {
        hand[pIdx] = mk();
    } else {
        const min = Math.min(iIdx, pIdx);
        const max = Math.max(iIdx, pIdx);
        hand[min] = mk();
        hand.splice(max, 1);
    }

    // collapse accidental duplicates of same name next to each other
    const name = resultSpec.result_card_name;
    for (let k = hand.length - 2; k >= 0; k--) {
        if (hand[k]?.name === name && hand[k + 1]?.name === name) {
            hand.splice(k + 1, 1);
            break;
        }
    }

    state.lastFuse = {
        owner,
        time: Date.now(),
        initiator_name: iCard?.name,
        partner_name: pCard?.name,
        result_name: resultSpec.result_card_name,
        targets: "merge"
    };

    try { fireTrigger?.("on_fuse", owner, { initiator: iCard, partner: pCard, result: resultSpec }); } catch { }

    logEvent("fuseFinalize", {
        owner,
        kind: "generic",
        initiator: iCard?.name,
        partner: pCard?.name,
        result: resultSpec?.result_card_name || state?.lastFuse?.result_name || "wasted",
        targets
    });
    clearSelectableFlags(); render();
}
