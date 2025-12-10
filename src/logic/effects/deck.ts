// src/logic/effects/deck.ts
import { state } from "@core/gameState.js";
import { getCardDetails } from "@data/cardDatabase.js";
import { shuffleInPlace } from "@core/utils.js";
import { makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { Effect, Player } from "@core/types.js";

export function handleReplaceDeck(owner: Player, eff: Effect & { cards?: { name: string, count?: number }[] }) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    deck.length = 0; // clear current deck

    if (Array.isArray(eff.cards)) {
        for (const { name, count } of eff.cards) {
            const cardData = getCardDetails(name);
            if (cardData) {
                for (let i = 0; i < (count || 1); i++) {
                    const copy = JSON.parse(JSON.stringify(cardData));
                    copy.uid = makeUid();
                    deck.push(copy);
                }
            }
        }
    }
    shuffleInPlace(deck);
    logEvent("deckReplace", { owner, count: deck.length });
}

export async function replaceDeckWithSetMinus(owner: Player, eff: Effect & { set_file?: string, exclude?: string[] }) {
    // eff.set_file (e.g., "/cards/card_sets/10003_heirs_of_the_omen_card_details.json")
    // eff.exclude   (array of names)
    const file = String(eff.set_file);
    const exclude = new Set((eff.exclude || []).map((s) => String(s)));

    const res = await fetch(file, { cache: "no-cache" });
    if (!res.ok) {
        console.warn("Set file not found:", file);
        return;
    }
    const cards = await res.json();

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    deck.length = 0;

    for (const base of Array.isArray(cards) ? cards : []) {
        if (!base?.name) continue;
        if (exclude.has(String(base.name))) continue;
        // @ts-ignore
        const copy = JSON.parse(JSON.stringify(base));
        copy.uid = makeUid();
        deck.push(copy);
    }
    shuffleInPlace(deck);
    logEvent("deckReplaceSetMinus", {
        owner,
        count: deck.length,
        excluded: exclude.size,
    });
}
