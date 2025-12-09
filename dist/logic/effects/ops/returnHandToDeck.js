import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { shuffleInPlace } from "@core/utils.js";
import { logEvent } from "@core/logger.js";
function putBack(card, owner) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const idx = hand.indexOf(card);
    if (idx < 0)
        return false;
    const [removed] = hand.splice(idx, 1);
    deck.push(removed);
    shuffleInPlace(deck);
    return true;
}
/**
 * status: "blocked" | "pending" | "done"
 * effectsQueue is optional; when present we stash & clear it while waiting.
 */
export function handleReturnHandToDeck(eff, owner, effectsQueue = null) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    // Support returning the entire hand (e.g., Dimension Climb)
    const wantAll = (typeof eff.select === "string" && eff.select.toLowerCase() === "all") ||
        eff.all === true;
    if (wantAll) {
        const returnedCount = hand.length;
        // Return everything currently in hand
        while (hand.length) {
            // putBack shuffles each time; that's fine, or replace with a single shuffle if you prefer
            putBack(hand[0], owner);
        }
        logEvent("returnHandToDeckAll", { owner, count: returnedCount });
        render();
        return "done";
    }
    // If empty hand:
    if (hand.length === 0) {
        if (eff.optional) {
            // optional bounce: do nothing and keep resolving
            return "done";
        }
        console.warn("[return_hand_to_deck] no card to return — blocking chain");
        return "blocked";
    }
    if (eff.select) {
        logEvent("returnHandToDeck_select", { owner, pool: hand.length, select: parseInt(eff.select_count || 1) });
        const resume = effectsQueue ? Array.from(effectsQueue) : [];
        if (effectsQueue)
            effectsQueue.length = 0;
        state.pendingTargetEffect = {
            eff,
            owner,
            sourceCard: null,
            resumeEffects: resume,
            pool: hand, // <-- Add this (the pool is the hand)
            targets: [], // <-- Add this
            selectCount: parseInt(eff.select_count || 1), // <-- Add this
        };
        hand.forEach(c => (c.__uiSelectable = true)); // This is effectively highlightSelectable(pool)
        render();
        return "pending";
    }
    // no-select fallback
    putBack(hand[0], owner);
    render();
    return "done";
}
export function resolveReturnHandToDeck(target, owner) {
    logEvent("returnHandToDeck", { owner, card: target.name, uid: target.uid });
    putBack(target, owner);
}
