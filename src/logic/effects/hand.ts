// src/logic/effects/hand.ts
import { state } from "@core/gameState.js";
import { getCardDetails } from "@data/cardDatabase.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { highlightSelectable } from "@logic/core/targeting.js";
import { rand, makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { CardInstance, Player, Effect } from "@core/types.js";

export function handleDiscardAllExceptNamed(eff: Effect, owner: Player) {
    const names = (eff.names || eff.name || []).map(String);
    const keepSet = new Set(names);
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

    let discarded = 0;

    for (let i = hand.length - 1; i >= 0; i--) {
        const c = hand[i];
        if (c && keepSet.has(String(c.name))) continue; // keep
        grave.push(hand.splice(i, 1)[0]); // discard
        discarded++;
    }

    if (discarded > 0) {
        logEvent("discard", { owner, count: discarded });
        if (owner === "blue") state.blueShadows += discarded;
        else state.redShadows += discarded;
    }
}

/**
 * Start a "select N cards from hand to discard" interaction.
 * Returns "pending" when it needs user input so runEffects pauses.
 */
export function handleDiscardSelectHand(eff: Effect, owner: Player, resumeEffects: Effect[] = []) {
    const n = Math.max(0, parseInt(eff.count as any ?? 1, 10));
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    if (n <= 0 || hand.length === 0) return;

    const selectCount = Math.min(n, hand.length);
    const pool = [...hand];

    state.pendingTargetEffect = {
        op: "discard_select_hand",
        eff: { ...eff, select_count: selectCount },
        owner,
        sourceCard: null,
        pool,
        selectCount,
        targets: [],
        resumeEffects,
    } as any;

    // mark with the correct flag and render
    highlightSelectable(pool); // sets __uiSelectable + render()
    return "pending";
}

/**
 * NEW: Handles transforming cards in hand based on a filter.
 * This is for Opulent Rose Queen's Fanfare.
 * @param {object} eff - The effect object from the card's JSON.
 * @param {string} owner - "blue" or "red".
 */
export function handleTransformInHand(eff: Effect, owner: Player) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const filter = eff.filter || {};
    const targetCardName = eff.target_card_name;

    if (!targetCardName) {
        console.error("transform_in_hand effect requires a 'target_card_name'");
        return;
    }

    // Get the template for the card we're transforming into
    const cardTemplate = getCardDetails(targetCardName);
    if (!cardTemplate) {
        console.error(`Card template not found for: ${targetCardName}`);
        return;
    }

    // Iterate backwards through the hand to safely replace items
    for (let i = hand.length - 1; i >= 0; i--) {
        const card = hand[i];
        let matches = true;

        // Check class filter
        if (filter.class && (card as any).class !== filter.class) {
            matches = false;
        }

        // Check cost filter - now with proper operator handling
        if (filter.cost && matches) {
            const cardCost = parseInt(card.cost as any, 10) || 0;
            const filterValue = parseInt(filter.cost.value, 10) || 0;

            switch (filter.cost.op) {
                case "<":
                    if (cardCost >= filterValue) matches = false;
                    break;
                case "<=":
                    if (cardCost > filterValue) matches = false;
                    break;
                case ">":
                    if (cardCost <= filterValue) matches = false;
                    break;
                case ">=":
                    if (cardCost < filterValue) matches = false;
                    break;
                case "==":
                    if (cardCost !== filterValue) matches = false;
                    break;
                default:
                    console.warn(`Unknown cost operator: ${filter.cost.op}`);
                    matches = false;
            }
        }

        // If the card matches all criteria, transform it
        if (matches) {
            // Create a fresh copy of the card from the database template
            const newCard = {
                ...JSON.parse(JSON.stringify(cardTemplate)), // Deep clone
                uid: makeUid("card_"),
            };
            logEvent("transformInHand", { owner, from: card.name, to: newCard.name });
            // Replace the old card with the new one
            hand[i] = newCard as CardInstance;
        }
    }
}
