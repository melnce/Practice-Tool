// src/logic/effects/ops/spellboost.ts
import { state } from "../../../core/gameState.js";
// @ts-ignore
// @ts-ignore
import { adapter } from "../../../core/adapter.js";
import { runEffects } from "../../core/effects/index.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { rand, randInt, makeUid } from "../../../core/rng.js";
import { logEvent } from "../../../core/logger.js";
// @ts-ignore

// @ts-ignore
import { Player, CardInstance } from "../../../core/types.js";


/* ------------------------ helpers ------------------------ */

function incSB(card: CardInstance) {
    if (!card) return;
    card.spellboostCount = (card.spellboostCount ?? 0) + 1;
}

function getSpellboostKeyword(card: CardInstance) {
    if (!Array.isArray(card?.keywords)) return null;
    for (const k of card.keywords) {
        if (typeof k === "string" && k.toLowerCase() === "spellboost") return { name: "Spellboost" };
        if (typeof k === "object" && k?.name?.toLowerCase() === "spellboost") return k;
    }
    return null;
}

function normTimes(x: any) {
    if (typeof x === "number" && Number.isFinite(x) && x > 0) return x;
    if (x && typeof x === "object") {
        const n = parseInt(x.times ?? x.count ?? 1, 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }
    return 1;
}

function transformSelfInHand(owner: Player, c: CardInstance, targetName: string) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const idx = hand.findIndex(x => x.uid === c.uid);
    if (idx === -1) return;

    const tpl = getCardDetails(targetName);
    if (!tpl) return;

    hand[idx] = {
        ...JSON.parse(JSON.stringify(tpl)),
        uid: makeUid("card_"),
        owner,
    };
}

/**
 * Handle all Spellboost keyword effects for ONE in-hand card.
 * IMPORTANT: Custom ops that are *only* meaningful here must NOT fall through to runEffects,
 * or you'll get UNKNOWN EFFECT logs elsewhere.
 */
function handleSpellboostKeywordEffects(owner: Player, c: CardInstance) {
    const kws = Array.isArray(c.keywords) ? c.keywords : [];
    for (const kw of kws) {
        if ((kw as any)?.name !== "Spellboost" || !Array.isArray((kw as any).effects)) continue;

        for (const effect of (kw as any).effects) {
            // --- Custom: Homework Time! -> transform into Looking Smart! at threshold ---
            if (effect.op === "transform_self_if_spellboost_at_least") {
                const need = Number(effect.threshold ?? 0);
                const have = Number(c.spellboostCount ?? 0); // AFTER increment
                if (have >= need && effect.target_card_name) {
                    logEvent("spellboostTransform", { owner, from: c.name, to: effect.target_card_name });
                    transformSelfInHand(owner, c, effect.target_card_name);
                }
                continue; // DO NOT pass this op to runEffects
            }







            // Everything else: generic path
            runEffects([effect], owner, c);
        }
    }
}

export function handleSetSpellboostCount(eff: any, sourceCard: CardInstance) {
    if (!sourceCard) return;
    const val = parseInt(eff.amount ?? 0, 10) || 0;
    sourceCard.spellboostCount = val;

    // If setting to 0, visually clear it (UI might check for >0 or existing property)
    // Re-rendering happens periodically
}

/* ------------------------ main ------------------------ */

/**
 * spellboostHand
 * Supports both signatures:
 * - spellboostHand(owner, times = 1, targetCard = null)
 * - spellboostHand(owner, targetCard, times = 1)
 */
export function spellboostHand(owner: Player, times: any = 1, targetCard: any = null) {
    if (owner !== "blue" && owner !== "red") return;

    // Signature normalization
    // If the second argument looks like a card (has uid), treat it as targetCard
    if (targetCard === null && times && typeof times === "object" && "uid" in times) {
        targetCard = times;
        times = 1;
    }
    // If third arg is actually a number, accept it as times
    if (typeof targetCard === "number" && Number.isFinite(targetCard)) {
        times = targetCard;
        targetCard = null;
    }

    const t = normTimes(times);
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const board = owner === "blue" ? state.blueBoard : state.redBoard;

    for (let i = 0; i < t; i++) {
        // --- Single-card spellboost path ---
        if (targetCard) {
            const kw = getSpellboostKeyword(targetCard);
            if (kw) {
                // increment counter first
                incSB(targetCard);

                // optional cost reduction (only if keyword specifies)
                if (Object.prototype.hasOwnProperty.call(kw, "reduceCostBy")) {
                    const reduceBy = Number.isFinite(kw.reduceCostBy) ? kw.reduceCostBy : 0;
                    const minCost = Number.isFinite(kw.minCost) ? kw.minCost : 0;

                    // @ts-ignore
                    targetCard.base_cost = targetCard.base_cost ?? (parseInt(targetCard.cost, 10) || 0);
                    const prev = targetCard.spellboostCostCount || 0;
                    const next = prev + reduceBy;
                    targetCard.spellboostCostCount = next;

                    const newCost = Math.max(minCost, targetCard.base_cost - next);
                    // @ts-ignore
                    if (Number.isFinite(newCost)) targetCard.cost = newCost;
                }
                logEvent("spellboost", { owner, card: targetCard.name, uid: targetCard.uid, count: targetCard.spellboostCount, newCost: targetCard.cost });

                // run in-hand effects for THIS card
                handleSpellboostKeywordEffects(owner, targetCard);
            }
        } else {
            // --- Whole-hand spellboost path ---
            for (const c of hand) {
                const kw = getSpellboostKeyword(c);
                if (!kw) continue;

                // increment counter first
                incSB(c);

                // optional cost reduction (opt-in per keyword)
                if (Object.prototype.hasOwnProperty.call(kw, "reduceCostBy")) {
                    const reduceBy = Number.isFinite(kw.reduceCostBy) ? kw.reduceCostBy : 0;
                    const minCost = Number.isFinite(kw.minCost) ? kw.minCost : 0;

                    // @ts-ignore
                    c.base_cost = c.base_cost ?? (parseInt(c.cost, 10) || 0);
                    const prev = c.spellboostCostCount || 0;
                    const next = prev + reduceBy;
                    c.spellboostCostCount = next;

                    const newCost = Math.max(minCost, (c.base_cost as number) - next);
                    // @ts-ignore
                    if (Number.isFinite(newCost)) c.cost = newCost;
                }
                logEvent("spellboost", { owner, card: c.name, uid: c.uid, count: c.spellboostCount, newCost: c.cost });

                // run in-hand effects for this card
                handleSpellboostKeywordEffects(owner, c);
            }
        }

        // --- Board-wide reactions to spellboost (e.g., Runeblade-style buffs) ---
        for (const c of board) {
            const kw = getSpellboostKeyword(c);
            if (!kw || !Array.isArray(kw.effects) || kw.effects.length === 0 as any) continue;

            for (const effect of kw.effects) {
                // pass the board card as source so buff_self hits itself
                runEffects([effect], owner, c);
            }
        }
    }

    adapter.render();
}


