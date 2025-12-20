// src/logic/effects/cost.ts
import { state } from "../../core/gameState.js";
import { getPool } from "../core/targeting.js";
import { logEvent } from "../../core/logger.js";
import { CardInstance, Effect, Player } from "../../core/types.js";

/**
 * Reduces the cost of the card that owns the effect.
 * @param {object} sourceCard The card to be affected.
 * @param {object} eff The effect object, containing an amount.
 */
export function handleReduceCostSelf(sourceCard: CardInstance | null, eff: Effect) {
    if (!sourceCard) return;

    const amount = parseInt(eff.amount as any ?? 1);

    // If this is the first time cost is reduced, save the original cost
    if (sourceCard.base_cost === undefined) {
        sourceCard.base_cost = parseInt(sourceCard.cost as any);
    }

    // Reduce the current cost, ensuring it doesn't go below 0
    const oldCost = parseInt(sourceCard.cost as any);
    sourceCard.cost = Math.max(0, oldCost - amount);

    if (oldCost !== sourceCard.cost) {
        logEvent("costChange", {
            card: sourceCard.name,
            uid: sourceCard.uid,
            newCost: sourceCard.cost,
        });
    }
}

export function handleReduceCost(targetCard: CardInstance, eff: Effect) {
    if (!targetCard) return;

    const amount = parseInt(eff.amount as any ?? 1);
    const minCost = Number.isFinite(parseInt(eff.minCost as any))
        ? parseInt(eff.minCost as any)
        : 0;

    if (targetCard.base_cost === undefined) {
        targetCard.base_cost = parseInt(targetCard.cost as any);
    }

    const oldCost = parseInt(targetCard.cost as any);
    targetCard.cost = Math.max(minCost, oldCost - amount);

    if (oldCost !== targetCard.cost) {
        logEvent("costChange", {
            card: targetCard.name,
            uid: targetCard.uid,
            newCost: targetCard.cost,
        });
    }
}

export function handleSetCostSelf(sourceCard: CardInstance | null, eff: Effect) {
    if (!sourceCard) return;
    const newCost = parseInt(eff.amount as any);
    if (Number.isFinite(newCost)) {
        if (sourceCard.base_cost === undefined) {
            sourceCard.base_cost = parseInt(sourceCard.cost as any);
        }
        const oldCost = sourceCard.cost;
        sourceCard.cost = Math.max(0, newCost);
        if (oldCost !== sourceCard.cost) {
            logEvent("costChange", {
                card: sourceCard.name,
                uid: sourceCard.uid,
                newCost: sourceCard.cost,
            });
        }
    }
}

export function applyTempOpponentHandCostMod(owner: Player, amount: number) {
    const opponent = owner === "blue" ? "red" : "blue";
    const hand = opponent === "blue" ? state.blueHand : state.redHand;

    for (const card of hand) {
        // track base cost for safety
        if (card.base_cost === undefined) {
            card.base_cost = parseInt(card.cost as any);
        }
        // apply a reversible modifier
        card.cost_mod = (parseInt(card.cost_mod as any) || 0) + amount;
        card.temp_cost_mod_until_eot =
            (parseInt(card.temp_cost_mod_until_eot as any) || 0) + amount;
    }
    if (hand.length > 0) {
        logEvent("costChangeBulk", {
            owner: opponent,
            type: "opponentHandMod",
            amount,
        });
    }
}

export function handleHalveDeckCost(owner: Player) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    let changed = false;

    for (const card of deck) {
        if (!card) continue;

        const current = parseInt(card.cost as any, 10) || 0;

        // Do not change 0 or 1 cost cards
        if (current <= 1) continue;

        // Keep original printed cost once
        if (card.base_cost === undefined) {
            card.base_cost = current;
        }

        // Halve and round up (ceil)
        const halvedUp = Math.ceil(current / 2);
        card.cost = Math.max(0, halvedUp);
        changed = true;
    }
    if (changed) {
        logEvent("costChangeBulk", { owner, type: "halveDeck" });
    }
}

/**
 * Generic cost modifier for selected target(s).
 * Uses cost_mod so "cost_changed" triggers fire on enter.
 * Expects the selected card(s) in context.targets / context.selectedCard.
 * Positive amount increases cost; negative decreases.
 */
import { resolveDynamicValue } from "../core/values.js";

// ... (existing imports, but add resolveDynamicValue)

/**
 * Generic cost modifier for selected target(s).
 * Uses cost_mod so "cost_changed" triggers fire on enter.
 * Expects the selected card(s) in context.targets / context.selectedCard.
 * Positive amount increases cost; negative decreases.
 */
export function handleModifyCost(eff: Effect, owner: Player, sourceCard: CardInstance | null, context: any = {}) {
    // RESOLVE DYNAMIC AMOUNT
    const amount = resolveDynamicValue(eff.amount, { owner, sourceCard, ...context });
    if (!amount) return;

    const targets =
        Array.isArray(context?.targets) && context.targets.length
            ? context.targets
            : context?.selectedCard
                ? [context.selectedCard]
                : [];

    if (!targets || !targets.length) return;

    for (const t of targets) {
        // Ensure base_cost is recorded once
        if (t.base_cost === undefined) {
            t.base_cost = parseInt(t.cost, 10) || 0;
        }
        // Only adjust modifier; don't touch t.cost directly
        t.cost_mod = (parseInt(t.cost_mod, 10) || 0) + amount;
        logEvent("costChange", {
            card: t.name,
            uid: t.uid,
            newCost: (parseInt(t.cost, 10) || 0) + t.cost_mod,
            type: "mod",
        });

        // TEMP support
        if (eff.until_eot) {
            t.temp_cost_mod_until_eot = (parseInt(t.temp_cost_mod_until_eot, 10) || 0) + amount;
        }
    }
}

// NEW: pool-based cost modifier (no manual selection needed)
export function handleModifyCostPool(eff: Effect, owner: Player, sourceCard: CardInstance | null) {
    // RESOLVE DYNAMIC AMOUNT
    const amount = resolveDynamicValue(eff.amount, { owner, sourceCard });
    if (!amount) return;
    const targetSpec = String((eff as any).target || "").trim() || "ally:hand";
    const condition = eff.condition || {};
    const pool =
        getPool(targetSpec, owner, sourceCard, condition, {
            isTargetedEffect: false,
        }) || [];
    if (!pool.length) return;
    for (const t of pool) {
        if (!t) continue;
        if (t.base_cost === undefined) t.base_cost = parseInt(t.cost as any, 10) || 0;
        t.cost_mod = (parseInt(t.cost_mod as any, 10) || 0) + amount;
        logEvent("costChange", {
            card: t.name,
            uid: t.uid,
            newCost: (parseInt(t.cost as any, 10) || 0) + t.cost_mod!,
            type: "mod",
        });

        // TEMP support
        if (eff.until_eot) {
            t.temp_cost_mod_until_eot = (parseInt(t.temp_cost_mod_until_eot, 10) || 0) + amount;
        }
    }
}

export function reduceDeckFollowersCost(owner: Player, amount = 1) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    let changed = false;

    for (const card of deck) {
        if (!card || card.type !== "Follower") continue;

        // Track original cost once
        if (card.base_cost === undefined) {
            card.base_cost = parseInt(card.cost as any) || 0;
        }

        const current = parseInt(card.cost as any) || 0;
        if (current > 0) {
            card.cost = Math.max(0, current - amount);
            changed = true;
        }
    }
    if (changed) {
        logEvent("costChangeBulk", { owner, type: "reduceDeckFollowers", amount });
    }
}
