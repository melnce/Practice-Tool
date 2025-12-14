import { state } from "../../../../core/gameState.js";
import { makeUid } from "../../../../core/rng.js";
import { CardInstance, Player } from "../../../../core/types.js";

// =============== Utilities ===============

export function boardOf(owner: Player) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}

export function deckOf(owner: Player) {
    return owner === "blue" ? state.blueDeck : state.redDeck;
}

export function normalizeName(s: string) {
    return String(s || "").trim().toLowerCase();
}

export function isAmulet(card: CardInstance) {
    return card && card.type === "Amulet";
}

export function isFollower(card: CardInstance) {
    return card && card.type === "Follower";
}

export function getEffectiveCost(card: CardInstance) {
    // @ts-ignore
    if (card && typeof card.effectiveCost === "number") return card.effectiveCost;
    const base = parseInt(card?.cost as any, 10) || 0;
    const mod = parseInt(card?.cost_mod as any, 10) || 0;
    return base + mod;
}

export function nextId() {
    // Use seeded UID for deterministic instance IDs
    return makeUid("inst_");
}

// function filterArtifactFollowersHand removed - moved to hand.ts

// Safe deep clone that ignores cycles and engine backrefs
export function safeClone(value: any, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return undefined;
    seen.add(value);

    if (Array.isArray(value)) return value.map(v => safeClone(v, seen));

    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
        // Drop obvious engine links/cycles
        if (k === "__state" || k === "__dom" || k === "element") continue;
        if (v === state) continue; // direct reference to global state
        out[k] = safeClone(v, seen);
    }
    return out;
}
