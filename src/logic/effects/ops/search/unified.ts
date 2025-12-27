// src/logic/effects/ops/search/unified.ts
// Unified search handler - search deck for matching cards and add to hand.
//
// SEMANTIC DIFFERENCE FROM DRAW:
// - draw: Random card acquisition (no choice)
// - search: Filtered card acquisition (implies player chose from options)
//
// For AI training, this distinction is important:
// - search signals intentional deck manipulation
// - draw signals random card acquisition

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { Effect, Player, CardInstance } from "../../../../core/types/index.js";
import {
    normalizeCardFilter,
    buildCardPredicate,
} from "../../../core/cardFilter/index.js";
import { applyKeyword } from "../../../core/keywords.js";
import { MAX_HAND, pushToHand } from "../../../../core/utils.js";
import { getDeck, getHand, getGraveyard, opponentOf } from "../../../../core/playerHelpers.js";
import { resolveDynamicValue } from "../../../core/values.js";

import type { SearchSpec } from "./types.js";
import { normalizeSearchSpec } from "./types.js";

// ============================================================================
// UNIFIED HANDLER
// ============================================================================

/**
 * Unified search handler.
 * Searches deck for cards matching filters and adds them to hand.
 *
 * @param eff - The search effect from card JSON
 * @param owner - The player who triggered the effect
 */
export function handleSearch(
    eff: Effect & Record<string, any>,
    owner: Player,
): void {
    const spec = normalizeSearchSpec(eff);

    // Determine who searches
    const searchingPlayer: Player =
        spec.player === "opponent" ? opponentOf(owner) : owner;

    const deck = getDeck(state, searchingPlayer);
    const hand = getHand(state, searchingPlayer);

    if (spec.count <= 0) return;
    if (Object.keys(spec.filters).length === 0) {
        logEvent("search_noFilter", { owner: searchingPlayer });
        return; // Search requires filters
    }



    // Build predicate from filters
    const resolvedFilters = { ...spec.filters };
    for (const key in resolvedFilters) {
        if (typeof resolvedFilters[key] === "string" && (resolvedFilters[key] as string).startsWith("{")) {
            resolvedFilters[key] = resolveDynamicValue(resolvedFilters[key], { owner: searchingPlayer });
        }
    }
    const normalizedFilter = normalizeCardFilter(resolvedFilters);
    const matches = buildCardPredicate(normalizedFilter);

    // Find all matching cards
    const matchingIndices: number[] = [];
    for (let i = 0; i < deck.length; i++) {
        const card = deck[i];
        if (card && matches(card)) {
            matchingIndices.push(i);
        }
    }

    if (matchingIndices.length === 0) {
        logEvent("search_noMatch", { owner: searchingPlayer, filters: spec.filters });
        return;
    }

    // Determine how many to take (up to count or all matches)
    const want = Math.min(spec.count, matchingIndices.length);

    // Take topmost matches (highest indices = top of deck)
    // Sort descending so we remove highest first (preserves lower indices)
    const selectedIndices = matchingIndices
        .sort((a, b) => b - a)
        .slice(0, want);

    // Move selected cards from deck to hand (or graveyard if hand full)
    const searched: CardInstance[] = [];
    const discarded: CardInstance[] = [];
    const grave = getGraveyard(state, searchingPlayer);

    for (const idx of selectedIndices) {
        const card = deck[idx];
        if (!card) continue;

        // Remove from deck
        deck.splice(idx, 1);

        // Apply keywords if specified
        if (spec.keywords.length > 0) {
            for (const kw of spec.keywords) {
                applyKeyword(card, kw);
            }
        }

        // Try to add to hand, otherwise discard to graveyard
        if (hand.length < MAX_HAND) {
            card.zone = "hand";
            if (pushToHand(hand, card)) {
                searched.push(card);
                (state as any).lastAddedToHand = card;
            }
        } else {
            // Hand full - card goes to graveyard (overdraw/search overflow)
            card.zone = "graveyard";
            grave.push(card);
            discarded.push(card);
        }
    }

    // Track for AI observation
    if (!state.lastSearchedCards) {
        (state as any).lastSearchedCards = [];
    }
    (state as any).lastSearchedCards = searched;

    logEvent("search", {
        owner: searchingPlayer,
        count: searched.length,
        filters: spec.filters,
        cards: searched.map((c) => ({ name: c.name, uid: c.uid })),
    });

    // Shuffle deck after search (standard behavior)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = state.rng.nextInt(i + 1);
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { SearchSpec } from "./types.js";
export { normalizeSearchSpec } from "./types.js";
