// src/logic/effects/cards/dragoncraft/dragonsign.ts
import { state } from "@core/gameState.js";
import { drawCard } from "@core/utils.js";
import { logEvent } from "@core/logger.js";
/**
 * Handles the effects of the Dragonsign card.
 * This function now permanently increases the player's PP by 1.
 *
 * @param {string} owner - The owner of the card ('blue' or 'red').
 */
export function handleDragonsign(owner) {
    const permPPKey = owner === "blue" ? "bluePermPP" : "redPermPP";
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    // Permanently increase PP by 1, capped at 10.
    // The 'permPP' variable will be used in the turn end logic to calculate max PP.
    // @ts-ignore
    state[permPPKey] = Math.min(10, (state[permPPKey] || 0) + 1);
    // Also update the current turn's max PP to reflect the change immediately.
    const maxPPKey = owner === "blue" ? "blueMaxPP" : "redMaxPP";
    // @ts-ignore
    state[maxPPKey] = Math.min(10, state.roundCount + (state[permPPKey] || 0));
    // Log the dragonsign effect
    // @ts-ignore
    logEvent("dragonsign", { owner, newPermPP: state[permPPKey], newMaxPP: state[maxPPKey] });
    // The card's effect also draws a card if the player hits 10 PP.
    // @ts-ignore
    if (state[maxPPKey] === 10) {
        drawCard(hand, deck, owner);
    }
}
