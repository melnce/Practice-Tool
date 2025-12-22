// src/logic/effects/ops/draw.ts — standardized draw handling

import { state } from "../../../core/gameState.js";
import { drawCard, pushToHand, MAX_HAND } from "../../../core/utils.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { applyKeyword } from "../../core/keywords.js";

import { logEvent } from "../../../core/logger.js";
import { Effect, Player, CardInstance } from "../../../core/types.js";

// Refactored: Import CardFilter module
import { normalizeCardFilter, buildCardPredicate } from "../../core/cardFilter/index.js";

/** -----------------------------
 * Helpers
 * -----------------------------
 */
function removeAt(deck: CardInstance[], index: number) {
    return deck.splice(index, 1)[0];
}
function clampInt(x: any, fallback = 0) {
    const n = Number.parseInt(x);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function toLowerSafe(s: any) {
    return String(s || "").trim().toLowerCase();
}
function isFiniteNum(x: any) {
    const n = Number(x);
    return Number.isFinite(n);
}

/** Track last-drawn cards for UI/debug (most recent first) */
function trackLastDrawn(card: CardInstance) {
    // state.lastDrawnCards is guaranteed by ARRAY_KEYS
    if (state.lastDrawnCards) {
        state.lastDrawnCards.unshift(card);
        if (state.lastDrawnCards.length > 5) state.lastDrawnCards.length = 5;
    }
}

/** -----------------------------
 * UNIFIED DRAW OPERATION
 * -----------------------------
 * Single entry point for all draw operations.
 * 
 * Parameters:
 * - player: "self" (default) | "opponent" - who draws the cards
 * - count: number | "all" | "combo" - how many to draw (default 1)
 * - filters: { name?, type?, class?, cost_eq?, ... } - optional filtering
 * - mode: "topmost" (default) | "random" - selection order when filtering
 * - keywords: string[] - keywords to apply to drawn cards
 */
export function handleDraw(eff: Effect, owner: Player) {
    // Determine who draws
    const playerParam = toLowerSafe((eff as any).player);
    const drawingPlayer: Player = playerParam === "opponent"
        ? (owner === "blue" ? "red" : "blue")
        : owner;

    const deck = drawingPlayer === "blue" ? state.blueDeck : state.redDeck;
    const hand = drawingPlayer === "blue" ? state.blueHand : state.redHand;

    // Check if we have filters - if so, use filtered draw logic
    const hasFilters = (eff as any).filters && Object.keys((eff as any).filters).length > 0;

    if (hasFilters) {
        // Filtered draw path
        const filterSpec = (eff as any).filters || {};
        const normalizedFilter = normalizeCardFilter(filterSpec);
        const matches = buildCardPredicate(normalizedFilter);

        const idxs: number[] = [];
        for (let i = 0; i < deck.length; i++) {
            const card = deck[i];
            if (card && matches(card)) idxs.push(i);
        }
        if (!idxs.length) return;

        // Resolve count
        const countRaw = (eff.count as any);
        let want: number;
        if (countRaw === "all") {
            want = idxs.length;
        } else if (countRaw === "combo") {
            const combo = drawingPlayer === "blue"
                ? (state.bluePlaysThisTurn || 0)
                : (state.redPlaysThisTurn || 0);
            want = combo;
        } else {
            want = clampInt(countRaw, 1);
        }
        if (!want) return;

        const mode = toLowerSafe((eff as any).mode) || "topmost";
        let chosenIdxs: number[];

        if (mode === "random") {
            for (let i = idxs.length - 1; i > 0; i--) {
                const j = state.rng.nextInt(i + 1);
                const temp = idxs[i]!;
                idxs[i] = idxs[j]!;
                idxs[j] = temp;
            }
            chosenIdxs = idxs.slice(0, want).sort((a, b) => b - a);
        } else {
            chosenIdxs = idxs.sort((a, b) => b - a).slice(0, want);
        }

        // Keywords to apply
        const keywordsToApply = Array.isArray((eff as any).keywords) ? (eff as any).keywords : [];

        for (const ix of chosenIdxs) {
            if (hand.length >= MAX_HAND) break;
            const picked = removeAt(deck, ix);
            if (!picked) continue;

            for (const kw of keywordsToApply) {
                const kwName = (typeof kw === "string" ? kw : kw?.name) || "";
                if (kwName) applyKeyword(picked, kwName);
            }

            trackLastDrawn(picked);
            if (!pushToHand(hand, picked)) break;
        }
        logEvent("draw", { owner: drawingPlayer, mode, filtered: true, moved: chosenIdxs.length });
    } else {
        // Simple draw path (no filters)
        const countRaw = (eff.count as any);
        let n: number;
        if (countRaw === "combo") {
            n = drawingPlayer === "blue"
                ? (state.bluePlaysThisTurn || 0)
                : (state.redPlaysThisTurn || 0);
        } else {
            n = clampInt(countRaw, 1);
        }

        logEvent("draw", { owner: drawingPlayer, count: n });
        for (let i = 0; i < n; i++) {
            drawCard(hand, deck, drawingPlayer);
        }
    }
}

// DEPRECATED: Use handleDraw with player: "opponent"
export function handleDrawOpponent(eff: Effect, owner: Player) {
    handleDraw({ ...eff, player: "opponent" } as any, owner);
}

/** -----------------------------
 * 2) Named/Keyworded Special Draws
 * -----------------------------
 */

/** Draw the *nearest-to-top* copy with the given name (tutor-by-name) */
export function handleDrawNamed(eff: Effect, owner: Player) {
    const name = toLowerSafe((eff.name as any));
    if (!name) return;

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    for (let i = deck.length - 1; i >= 0; i--) {
        const c = deck[i];
        if (!c) continue;
        if (toLowerSafe(c.name) === name) {
            const picked = removeAt(deck, i);
            if (!picked) break;
            trackLastDrawn(picked);
            pushToHand(hand, picked); // tutors bypass drawCard
            logEvent("tutorNamed", { owner, name: name });
            break;
        }
    }
}

/** Pull *all copies* of a named card and apply keywords */
export function handleDrawAllNamedWithKeyword(eff: Effect, owner: Player) {
    const name = toLowerSafe((eff.name as any));
    if (!name) return;

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    const picked: CardInstance[] = [];
    for (let i = deck.length - 1; i >= 0; i--) {
        const c = deck[i];
        if (!c) continue;
        if (toLowerSafe(c.name) === name) {
            const removed = removeAt(deck, i);
            if (removed) picked.push(removed);
        }
    }
    if (!picked.length) return;

    // STRICT: Use keywords array for consistency
    const keywordsToApply = Array.isArray((eff as any).keywords) ? (eff as any).keywords : [];
    for (const p of picked) {
        for (const kw of keywordsToApply) {
            const kwName = (typeof kw === "string" ? kw : kw?.name) || "";
            if (kwName) applyKeyword(p, kwName);
        }
        if (!pushToHand(hand, p)) break;
    }
    logEvent("tutorAllWithKeyword", { owner, name, keywords: keywordsToApply, count: picked.length });
}

/** Create token(s) directly into hand */
export function handleAddToHand(eff: Effect, owner: Player, context: any = {}) {
    // 1. Resolve source Card Details (either from name OR from selection context)
    const n = clampInt((eff.count as any), 1);
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    let base: any = null;

    if (eff.source === "selection") {
        // Copy from generic selection context
        const sourceCard = context.selectedCard || (Array.isArray(context.targets) ? context.targets[0] : null);
        if (sourceCard) {
            // We want a fresh copy of this card's DEFINITION (plus maybe stats?)
            // Usually "add a copy" means base card details, but sometimes exact copy. 
            // "Primal Beast Absorption" says "add a copy", usually implies base copy in SV unless "exact copy".
            // Let's assume Base Copy for now.
            base = getCardDetails(sourceCard.name);
        }
    } else {
        const name = ((eff.name as any) || "").trim();
        if (name) {
            base = getCardDetails(name);
        }
    }

    if (!base) return;

    for (let i = 0; i < n; i++) {
        if (hand.length >= MAX_HAND) break;
        // 2. Clone it
        const copy = JSON.parse(JSON.stringify(base));
        copy.uid = state.rng.makeUid();

        // 3. Push
        if (pushToHand(hand, copy)) {
            state.lastAddedToHand = copy;
            logEvent("addToHand", { owner, name: copy.name, uid: copy.uid });
        } else break;
    }
}

/** -----------------------------
 * 3) Filtered / Tutor Draws
 * -----------------------------
 * CONTRACT:
 * - Selection modes: "topmost" (default) or "random".
 * - Deck iteration: index 0 = bottom, high index = top (draw from top).
 * - Filtering: MUST use CardFilter module (normalizeCardFilter + buildCardPredicate).
 * - DO NOT add bespoke query logic here; extend CardFilter instead.
 * 
 * UNIFIED DRAW: This op now supports:
 * - count: number | "all" - how many to draw (default 1)
 * - filters: { name?, type?, class?, cost_eq?, ... } - what to match
 * - mode: "topmost" | "random" - selection order
 * - keywords: string[] - keywords to apply to drawn cards
 */
export function handleDrawFiltered(eff: Effect, owner: Player) {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    // Refactored: Use CardFilter module for filtering logic
    const filterSpec = (eff.filters as any) || {};
    const normalizedFilter = normalizeCardFilter(filterSpec);
    const matches = buildCardPredicate(normalizedFilter);

    const idxs: number[] = [];
    for (let i = 0; i < deck.length; i++) {
        const card = deck[i];
        if (card && matches(card)) idxs.push(i);
    }
    if (!idxs.length) return;

    // Support count: "all" to draw all matches
    const countRaw = (eff.count as any);
    const want = countRaw === "all" ? idxs.length : clampInt(countRaw, 1);
    if (!want) return;

    const mode = toLowerSafe((eff.mode as any)) || "topmost";
    let chosenIdxs;

    if (mode === "random") {
        for (let i = idxs.length - 1; i > 0; i--) {
            const j = state.rng.nextInt(i + 1);
            const temp = idxs[i]!;
            idxs[i] = idxs[j]!;
            idxs[j] = temp;
        }
        chosenIdxs = idxs.slice(0, want).sort((a, b) => b - a);
    } else {
        chosenIdxs = idxs
            .sort((a, b) => b - a)
            .slice(0, want);
    }

    // Keywords to apply to drawn cards
    const keywordsToApply = Array.isArray((eff as any).keywords) ? (eff as any).keywords : [];

    for (const ix of chosenIdxs) {
        if (hand.length >= MAX_HAND) break;
        const picked = removeAt(deck, ix);
        if (!picked) continue;

        // Apply keywords if specified
        for (const kw of keywordsToApply) {
            const kwName = (typeof kw === "string" ? kw : kw?.name) || "";
            if (kwName) applyKeyword(picked, kwName);
        }

        trackLastDrawn(picked);
        if (!pushToHand(hand, picked)) break;
    }
    logEvent("drawFiltered", { owner, mode, moved: chosenIdxs.length, keywords: keywordsToApply.length > 0 ? keywordsToApply : undefined });
}

/** Example: combo-based tutor */
export function handleDrawComboFollower(eff: Effect, owner: Player) {
    const combo =
        owner === "blue"
            ? (state.bluePlaysThisTurn || 0)
            : (state.redPlaysThisTurn || 0);
    const drawEff = {
        count: (eff.count as any) ?? 1,
        mode: (eff.mode as any) || "topmost",
        filters: {
            type: "follower",
            cost_eq: combo,
        },
    };
    handleDrawFiltered(drawEff as any, owner);
}

/** -----------------------------
 * 4) Future-proof hooks
 * -----------------------------
 */
export function handlePeekTop(eff: Effect, owner: Player) {
    const x = clampInt((eff.count as any), 1);
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const peek = deck.slice(Math.max(0, deck.length - x));
    state.peekTop = { owner, cards: peek.map((c) => ({ ...c })) };
    logEvent("peekTop", { owner, count: x });
}

export function handlePutOnTopOrBottom(eff: Effect, owner: Player) {
    const which = toLowerSafe((eff.which as any)) || "top";
    const card = (eff.card as any);
    if (!card) return;

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const idx = deck.indexOf(card);
    if (idx < 0) return;

    removeAt(deck, idx);
    if (which === "bottom") {
        deck.unshift(card);
    } else {
        deck.push(card);
    }
    logEvent("putOnDeck", { owner, which, name: card.name, uid: card.uid });
}
