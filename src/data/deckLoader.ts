// src/data/deckLoader.ts
import { state } from "../core/gameState.js";
import { drawCard, shuffleInPlace } from "../core/utils.js";
import { adapter } from "../core/adapter.js";
import { getCardDetails } from "./cardDatabase.js";
import { logEvent } from "../core/logger.js";



function normalizeDeck(raw: any, deckFile?: string) {
    const expanded: any[] = [];
    const isOrdered = !!raw.ordered;

    // Testing decks: skip shuffle to preserve deterministic order
    const isTestDeck = deckFile?.toLowerCase().includes("0_testing");

    if (Array.isArray(raw)) {
        // Simple array of card objects or names
        for (const item of raw) {
            expanded.push(typeof item === "string" ? { name: item } : item);
        }
    } else if (raw && Array.isArray(raw.cards)) {
        // Object with { cards: [...], ordered: boolean }
        for (const entry of raw.cards) {
            const count = entry.count || 1;
            for (let i = 0; i < count; i++) {
                expanded.push({ ...entry, count: undefined }); // Remove count from individual instance
            }
        }
    }
    if (isOrdered || isTestDeck) {
        // We draw with deck.pop(), so reverse to make JSON[0] the first drawn.
        return expanded.reverse();
    }

    // Default: shuffle normal decks
    shuffleInPlace(expanded);
    return expanded;
}

function enrichDeck(rawDeck: any, deckFile?: string) {
    const deck = normalizeDeck(rawDeck, deckFile);
    return deck.map(card => {
        // Prefer ID lookup if available, otherwise name
        const fullData = (card.id && getCardDetails(String(card.id)))
            || getCardDetails(card.name);

        const enriched = fullData ? { ...fullData, ...card } : { ...card };
        enriched.uid = state.rng.makeUid();
        return enriched;
    });
}

async function fetchDeck(deckId: string) {
    const root = ((window as any).APP_ROOT || '/');
    // deckId may be "name", "name.json", "decks/name.json", or "/decks/name.json"
    let file = String(deckId)
        .replace(/^\/?decks\//i, '')  // strip "decks/" or "/decks/"
        .replace(/^\/+/, '');         // strip any remaining leading slash
    if (!/\.json$/i.test(file)) file += '.json';
    const url = `${root}decks/${file}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Deck not found at ${url}`);
    const obj = await res.json();
    obj.__deckFile = file;   // keep filename for later checks
    return obj;
}

export async function loadBlueDeck(deckName: string) {
    const loaded = await fetchDeck(deckName);
    state.blueDeckFile = loaded.__deckFile;
    const enriched = enrichDeck(loaded, loaded.__deckFile);

    state.blueDeck.length = 0;
    state.blueDeck.push(...enriched);
    state.blueHand.length = 0;
    state.blueBoard.length = 0;
    state.blueGraveyard.length = 0;

    state.blueHP = 20; state.bluePP = 1; state.blueMaxPP = 1;
    for (let i = 0; i < 4; i++) drawCard(state.blueHand, state.blueDeck);

    // Log the blue deck load
    logEvent("deckLoad", { owner: "blue", file: state.blueDeckFile, count: state.blueDeck.length });

    adapter.render();
}

export async function loadRedDeck(deckName: string) {
    const loaded = await fetchDeck(deckName);
    state.redDeckFile = loaded.__deckFile;
    const enriched = enrichDeck(loaded, loaded.__deckFile);

    state.redDeck.length = 0;
    state.redDeck.push(...enriched);
    state.redHand.length = 0;
    state.redBoard.length = 0;
    state.redGraveyard.length = 0;

    state.redHP = 20; state.redPP = 1; state.redMaxPP = 1;
    for (let i = 0; i < 4; i++) drawCard(state.redHand, state.redDeck);

    // Log the red deck load
    logEvent("deckLoad", { owner: "red", file: state.redDeckFile, count: state.redDeck.length });

    adapter.render();
}
