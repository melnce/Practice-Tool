// src/data/deckLoader.ts
import { state } from "@core/gameState.js";
import { drawCard, shuffleInPlace } from "@core/utils.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { getCardDetails } from "@data/cardDatabase.js";
import { makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { Player } from "@core/types.js";

function normalizeDeck(raw: any) {
    // Accept:
    // 1) [ {name, count?}, ... ]
    // 2) { cards: [ {name, count}, ... ] }
    // 3) { cards: { "Card A": 2, "Card B": 1, ... } }
    let list = null;
    if (Array.isArray(raw)) {
        list = raw;
    } else if (raw && Array.isArray(raw.cards)) {
        list = raw.cards;
    } else if (raw && raw.cards && typeof raw.cards === 'object') {
        list = Object.entries(raw.cards).map(([name, count]) => ({ name, count }));
    }
    if (!list) throw new Error("Deck JSON must be an array or { cards: [...] }");

    const expanded = [];
    for (const c of list) {
        const copies = Math.max(1, Number(c.count) || 1);
        for (let i = 0; i < copies; i++) expanded.push({ name: c.name });
    }

    // Determine if this deck should be loaded in listed order (no shuffle)
    const file = String(raw.__deckFile || '');
    const isOrdered =
        raw.ordered === true ||                  // optional flag in JSON
        raw.shuffle === false ||                 // optional flag in JSON
        /^0_.*\.json$/i.test(file) ||            // any deck starting with "0_"
        /testing/i.test(file) ||                 // filenames containing "testing"
        file === '0_testing_deck.json';          // your current test deck

    if (isOrdered) {
        // We draw with deck.pop(), so reverse to make JSON[0] the first drawn.
        return expanded.reverse();
    }

    // Default: shuffle normal decks
    shuffleInPlace(expanded);
    return expanded;
}

function enrichDeck(rawDeck: any) {
    const deck = normalizeDeck(rawDeck);
    return deck.map(card => {
        const fullData = getCardDetails(card.name);
        const enriched = fullData ? { ...fullData, ...card } : { ...card };
        enriched.uid = makeUid();
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
    const enriched = enrichDeck(loaded);

    state.blueDeck.length = 0;
    state.blueDeck.push(...enriched);
    state.blueHand.length = 0;
    state.blueBoard.length = 0;
    state.blueGraveyard.length = 0;

    state.blueHP = 20; state.bluePP = 1; state.blueMaxPP = 1;
    for (let i = 0; i < 4; i++) drawCard(state.blueHand, state.blueDeck);

    // Log the blue deck load
    logEvent("deckLoad", { owner: "blue", file: state.blueDeckFile, count: state.blueDeck.length });

    render();
}

export async function loadRedDeck(deckName: string) {
    const loaded = await fetchDeck(deckName);
    state.redDeckFile = loaded.__deckFile;
    const enriched = enrichDeck(loaded);

    state.redDeck.length = 0;
    state.redDeck.push(...enriched);
    state.redHand.length = 0;
    state.redBoard.length = 0;
    state.redGraveyard.length = 0;

    state.redHP = 20; state.redPP = 1; state.redMaxPP = 1;
    for (let i = 0; i < 4; i++) drawCard(state.redHand, state.redDeck);

    // Log the red deck load
    logEvent("deckLoad", { owner: "red", file: state.redDeckFile, count: state.redDeck.length });

    render();
}
