import { CardInstance } from "../../../../core/types.js";
import { applyKeywordsFromList } from "../../../core/keywords.js";
import { isEarthSigil } from "./earth.js";

// Pull starting counters/destroyOnEmpty from the JSON keywords
export function seedCountersFromKeywords(card: CardInstance) {
    card.counters = card.counters || {};
    const kws = Array.isArray(card.keywords) ? card.keywords : [];
    for (const k of kws) {
        // @ts-ignore
        if (typeof k !== "string" && k?.name === "Counter") {
            const key = String(k.key);
            const count = Number(k.count || 0);
            if (key) {
                // SET the counter value instead of ADDING to it
                // This ensures we don't double-count if called multiple times
                if (card.counters[key] === undefined) {
                    card.counters[key] = count;
                }
            }
            if (k.destroyOnEmpty) card.destroyOnEmpty = true;
        }
    }
}

// =============== Initialization ===============

export function initFollower(card: CardInstance) {
    // normalize numbers
    // @ts-ignore
    card.attack = parseInt(card.attack as any) || 0;
    // @ts-ignore
    card.defense = parseInt(card.defense as any) || 0;

    // remember raw stats
    if (card.base_attack == null) card.base_attack = card.attack;
    if (card.base_defense == null) card.base_defense = card.defense;
    if (card.peak_defense == null) card.peak_defense = card.defense;

    // apply keyword booleans/params
    applyKeywordsFromList(card);

    // turn-state
    card.justPlayed = true;
    card.hasAttacked = false;
    card.attacks_per_turn = Number.isFinite(card.attacks_per_turn) ? card.attacks_per_turn! : 1;
    card.attacks_left = card.attacks_per_turn;
    card.can_attack = !!(card.hasStorm || card.hasRush);
    card.isRush = !!(card.hasRush && !card.hasStorm);
}

export function initAmulet(card: CardInstance) {
    // bring in keyword flags and keyword-defined params (e.g., countdown)
    applyKeywordsFromList(card);

    // counters + destroyOnEmpty from keywords
    seedCountersFromKeywords(card);

    // Earth Sigils: auto-initialize earth counter to 1 if not set
    // This ensures played earth sigils (Witch's New Brew, Magic Sediment) have a counter
    if (isEarthSigil(card)) {
        card.counters = card.counters || {};
        if (card.counters.earth === undefined || card.counters.earth === 0) {
            card.counters.earth = 1;
        }
    }

    // normalize countdown if present
    if (card.hasCountdown) {
        card.countdown = Number(card.countdown || 0);
    }
}
