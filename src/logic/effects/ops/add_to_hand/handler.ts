// src/logic/effects/ops/add_to_hand/handler.ts
// Handler for ADD_TO_HAND operation - adds cards to hand.
// Source determines where the card comes from:
// - "named": Create from card database by name (token generation)
// - "copy": Duplicate from an existing target card

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { pushToHand, MAX_HAND } from "../../../../core/utils.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { Effect, Player, CardInstance } from "../../../../core/types/index.js";
import { normalizeToAddToHandSpec } from "./types.js";

/**
 * Handle the add_to_hand operation.
 * 
 * Semantics:
 * - source="named": Create token from database, does NOT thin deck
 * - source="copy": Duplicate existing card, does NOT thin deck
 * 
 * @param eff - The add_to_hand effect
 * @param owner - The player who triggered the effect
 * @param sourceCard - The card that triggered this effect (for target: "self")
 * @param context - Additional context (selected cards, last drawn, etc.)
 */
export function handleAddToHand(
    eff: Effect & Record<string, any>,
    owner: Player,
    sourceCard: CardInstance | null = null,
    context: { selected?: CardInstance[]; lastDrawn?: CardInstance; triggerCard?: CardInstance } = {},
): void {
    const spec = normalizeToAddToHandSpec(eff);

    if (spec.count <= 0) return; // No-op

    // Determine who receives the cards
    const receivingPlayer: Player =
        spec.player === "enemy" ? (owner === "first" ? "second" : "first") : owner;

    const hand = state.players[receivingPlayer].hand;

    // Route based on source
    if (spec.source === "named") {
        addNamedCards(spec, receivingPlayer, hand);
    } else if (spec.source === "copy") {
        addCopiedCards(spec, owner, receivingPlayer, hand, sourceCard, context);
    }
}

/**
 * Add named cards (token generation).
 */
function addNamedCards(
    spec: ReturnType<typeof normalizeToAddToHandSpec>,
    receivingPlayer: Player,
    hand: CardInstance[],
): void {
    if (!spec.name) return;

    // Look up the card template
    const base = getCardDetails(spec.name);
    if (!base) {
        logEvent("add_to_hand_notFound", { name: spec.name, player: receivingPlayer });
        return;
    }

    // Create and add cards
    for (let i = 0; i < spec.count; i++) {
        if (hand.length >= MAX_HAND) break;

        const copy: CardInstance = structuredClone(base);
        copy.uid = state.rng.makeUid();
        copy.owner = receivingPlayer;
        copy.zone = "hand";

        // Apply keywords if specified
        if (spec.keywords.length > 0) {
            applyKeywords(copy, spec.keywords);
        }

        if (pushToHand(hand, copy)) {
            (state as any).lastAddedToHand = copy;
            logEvent("add_to_hand", { owner: receivingPlayer, name: copy.name, uid: copy.uid, source: "named" });
        } else {
            break;
        }
    }
}

/**
 * Add copied cards (duplication).
 */
function addCopiedCards(
    spec: ReturnType<typeof normalizeToAddToHandSpec>,
    owner: Player,
    receivingPlayer: Player,
    hand: CardInstance[],
    sourceCard: CardInstance | null,
    context: { selected?: CardInstance[]; lastDrawn?: CardInstance; triggerCard?: CardInstance },
): void {
    // Determine the source card to copy
    let cardToCopy: CardInstance | null = null;

    switch (spec.target) {
        case "self":
            cardToCopy = sourceCard;
            break;
        case "selected":
            // Try context first, then fall back to state.lastSelected (array)
            cardToCopy = context.selected?.[0] ?? (state as any).lastSelected?.[0] ?? null;
            break;
        case "last_drawn":
            // Try context first, then fall back to state.lastDrawnCards (array)
            cardToCopy = context.lastDrawn ?? (state as any).lastDrawnCards?.[0] ?? (state as any).lastDrawnCard ?? null;
            break;
        case "trigger":
            cardToCopy = context.triggerCard ?? null;
            break;
    }

    if (!cardToCopy) {
        logEvent("add_to_hand_noTarget", { target: spec.target, player: owner });
        return;
    }

    // Create copies
    for (let i = 0; i < spec.count; i++) {
        if (hand.length >= MAX_HAND) break;

        const copy: CardInstance = structuredClone(cardToCopy);
        copy.uid = state.rng.makeUid();
        copy.owner = receivingPlayer;
        copy.zone = "hand";

        // Apply keywords if specified
        if (spec.keywords.length > 0) {
            applyKeywords(copy, spec.keywords);
        }

        if (pushToHand(hand, copy)) {
            (state as any).lastAddedToHand = copy;
            logEvent("add_to_hand", {
                owner: receivingPlayer,
                name: copy.name,
                uid: copy.uid,
                source: "copy",
                from: cardToCopy.uid
            });
        } else {
            break;
        }
    }
}

/**
 * Apply keywords to a card.
 */
function applyKeywords(card: CardInstance, keywords: string[]): void {
    if (!card.keywords) {
        card.keywords = [];
    }
    for (const kw of keywords) {
        if (!card.keywords.includes(kw)) {
            card.keywords.push(kw);
        }
    }
}
