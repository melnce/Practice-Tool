// src/logic/effects/ops/draw.ts — standardized draw handling

import { state } from "@core/gameState.js";
import { drawCard, pushToHand, MAX_HAND } from "@core/utils.js";
import { getCardDetails } from "@data/cardDatabase.js";
import { applyKeyword } from "@logic/core/keywords.js";
import { rand, randInt, makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { Effect, Player, CardInstance } from "@core/types.js";


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
    state.lastDrawnCards = state.lastDrawnCards || [];
    state.lastDrawnCards.unshift(card);
    if (state.lastDrawnCards.length > 5) state.lastDrawnCards.length = 5;
}

/** -----------------------------
 * 1) Basic Draws (always via drawCard)
 * -----------------------------
 */
export function handleDraw(eff: Effect, owner: Player) {
    const n = clampInt((eff.count as any), 1);
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    logEvent("draw", { owner, count: n });

    for (let i = 0; i < n; i++) {
        drawCard(hand, deck, owner);
    }
}

export function handleDrawOpponent(eff: Effect, owner: Player) {
    const opp = owner === "blue" ? "red" : "blue";
    const n = clampInt((eff.count as any), 1);
    const hand = opp === "blue" ? state.blueHand : state.redHand;
    const deck = opp === "blue" ? state.blueDeck : state.redDeck;
    logEvent("draw", { owner: opp, count: n });

    for (let i = 0; i < n; i++) {
        drawCard(hand, deck, opp);
    }
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
        if (toLowerSafe(c.name) === name) {
            const picked = removeAt(deck, i);
            trackLastDrawn(picked);
            pushToHand(hand, picked); // tutors bypass drawCard
            logEvent("tutorNamed", { owner, name: name });
            break;
        }
    }
}

/** Pull *all copies* of a named card and apply keyword */
export function handleDrawAllNamedWithKeyword(eff: Effect, owner: Player) {
    const name = toLowerSafe((eff.name as any));
    const kw = toLowerSafe((eff.keyword as any) || "storm");
    if (!name) return;

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    const picked: CardInstance[] = [];
    for (let i = deck.length - 1; i >= 0; i--) {
        const c = deck[i];
        if (toLowerSafe(c.name) === name) {
            picked.push(removeAt(deck, i));
        }
    }
    if (!picked.length) return;

    for (const p of picked) {
        applyKeyword(p, kw);
        if (!pushToHand(hand, p)) break;
    }
    logEvent("tutorAllWithKeyword", { owner, name, keyword: kw, count: picked.length });
}

/** Create token(s) directly into hand */
export function handleAddToHand(eff: Effect, owner: Player) {
    const n = clampInt((eff.count as any), 1);
    const name = ((eff.name as any) || "").trim();
    if (!n || !name) return;

    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const base = getCardDetails(name);
    if (!base) return;

    for (let i = 0; i < n; i++) {
        if (hand.length >= MAX_HAND) break;
        const copy = JSON.parse(JSON.stringify(base));
        copy.uid = makeUid();
        if (pushToHand(hand, copy)) {
            state.lastAddedToHand = copy;
            logEvent("addToHand", { owner, name, uid: copy.uid });
        } else break;
    }
}

/** -----------------------------
 * 3) Filtered / Tutor Draws
 * -----------------------------
 */
export function handleDrawFiltered(eff: Effect, owner: Player) {
    const want = clampInt((eff.count as any), 1);
    if (!want) return;

    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    const f = (eff.filters as any) || {};

    const type = toLowerSafe(f.type ?? f.type_eq);
    const cls = toLowerSafe(f.class ?? f.class_eq);

    const costLte = isFiniteNum(f.cost_lte) ? Number(f.cost_lte) : null;
    const costGte = isFiniteNum(f.cost_gte) ? Number(f.cost_gte) : null;
    const costEq = isFiniteNum(f.cost_eq) ? Number(f.cost_eq) : null;

    const atkLte = isFiniteNum(f.attack_lte) ? Number(f.attack_lte) : null;
    const atkGte = isFiniteNum(f.attack_gte) ? Number(f.attack_gte) : null;
    const atkEq = isFiniteNum(f.attack_eq) ? Number(f.attack_eq) : null;

    const defLte = isFiniteNum(f.defense_lte) ? Number(f.defense_lte) : null;
    const defGte = isFiniteNum(f.defense_gte) ? Number(f.defense_gte) : null;
    const defEq = isFiniteNum(f.defense_eq) ? Number(f.defense_eq) : null;

    const tribeRaw =
        f.tribe_in ?? f.tribe ?? f.tribes ?? f.tribes_in ?? null;
    const tribeList = Array.isArray(tribeRaw)
        ? tribeRaw.map(toLowerSafe).filter(Boolean)
        : tribeRaw
            ? [toLowerSafe(tribeRaw)]
            : [];

    const matches = (c: CardInstance) => {
        const cType = toLowerSafe(c.type);
        const cClass = toLowerSafe(c.class);
        const cCost = Number(c.cost);
        const cAtk = Number(c.attack);
        const cDef = Number(c.defense);

        if (type && cType !== type) return false;
        if (cls && cClass !== cls) return false;

        if (costEq != null && cCost !== costEq) return false;
        if (costLte != null && !(cCost <= costLte)) return false;
        if (costGte != null && !(cCost >= costGte)) return false;

        if (atkEq != null && cAtk !== atkEq) return false;
        if (atkLte != null && !(cAtk <= atkLte)) return false;
        if (atkGte != null && !(cAtk >= atkGte)) return false;

        if (defEq != null && cDef !== defEq) return false;
        if (defLte != null && !(cDef <= defLte)) return false;
        if (defGte != null && !(cDef >= defGte)) return false;

        if (tribeList.length) {
            const cardTribes = Array.isArray(c.tribes)
                ? c.tribes.map(toLowerSafe)
                : [];
            const hasOne = tribeList.some((t: string) => cardTribes.includes(t));
            if (!hasOne) return false;
        }

        return true;
    };

    const idxs = [];
    for (let i = 0; i < deck.length; i++) {
        if (matches(deck[i])) idxs.push(i);
    }
    if (!idxs.length) return;

    const mode = toLowerSafe((eff.mode as any)) || "topmost";
    let chosenIdxs;

    if (mode === "random") {
        for (let i = idxs.length - 1; i > 0; i--) {
            const j = randInt(i + 1);
            [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
        }
        chosenIdxs = idxs.slice(0, want).sort((a, b) => b - a);
    } else {
        chosenIdxs = idxs
            .sort((a, b) => b - a)
            .slice(0, want);
    }

    for (const ix of chosenIdxs) {
        if (hand.length >= MAX_HAND) break;
        const picked = removeAt(deck, ix);
        trackLastDrawn(picked);
        if (!pushToHand(hand, picked)) break;
    }
    logEvent("tutorFiltered", { owner, mode, moved: chosenIdxs.length });
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
