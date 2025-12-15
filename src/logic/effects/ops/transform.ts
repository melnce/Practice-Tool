// src/logic/effects/ops/transform.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { applyKeywordsFromList } from "../../core/keywords.js";
import { randInt, makeUid } from "../../../core/rng.js";
import { logEvent } from "../../../core/logger.js";
import { Player, CardInstance } from "../../../core/types.js";



/** Locate which zone currently holds the card. */
function locateZone(target: CardInstance) {
    if (!target) return null;
    if (state.blueBoard?.includes(target)) return "blueBoard";
    if (state.redBoard?.includes(target)) return "redBoard";
    if (state.blueHand?.includes(target)) return "blueHand";
    if (state.redHand?.includes(target)) return "redHand";
    return null;
}

/**
 * Transform a card into another card by name.
 * Accepts board or hand targets. Keeps owner & uid. No enter/leave triggers.
 * For board followers, preserves attack/turn state (no free attack refresh).
 */
export function transformTarget(target: CardInstance, intoName: string) {
    if (!target || !intoName) {
        console.warn("transformTarget: missing target or intoName");
        return;
    }

    const zone = locateZone(target);

    // If it's in hand, delegate to hand transformer and return.
    if (zone === "blueHand" || zone === "redHand") {
        return transformHandTarget(target, intoName);
    }

    if (zone !== "blueBoard" && zone !== "redBoard") {
        console.warn("transformTarget: target not found on any board");
        return;
    }

    const board = zone === "blueBoard" ? state.blueBoard : state.redBoard;
    const owner = zone === "blueBoard" ? "blue" : "red";

    const base = getCardDetails(intoName);
    if (!base) {
        console.warn(`transformTarget: unknown card '${intoName}'`);
        return;
    }

    const idx = board.indexOf(target);
    if (idx === -1) {
        console.warn("transformTarget: target index not found");
        return;
    }

    // Clone new template and preserve identity
    const c: CardInstance = JSON.parse(JSON.stringify(base));
    c.uid = target.uid;
    c.owner = owner;

    // Initialize basics depending on type
    if (c.type === "Follower") {
        // @ts-ignore
        c.attack = parseInt(c.attack as any) || 0;
        // @ts-ignore
        c.defense = parseInt(c.defense as any) || 0;
        if (c.base_attack == null) c.base_attack = c.attack;
        if (c.base_defense == null) c.base_defense = c.defense;
        if (c.peak_defense == null) c.peak_defense = c.defense;

        // Keywords set flags like hasRush/hasStorm/etc.
        applyKeywordsFromList(c);

        // Preserve turn/action state (no free swing refresh)
        const perTurnNew = Number.isFinite(c.attacks_per_turn) ? c.attacks_per_turn : 1;
        const leftOld = Number.isFinite(target.attacks_left) ? target.attacks_left : perTurnNew;

        c.justPlayed = target.justPlayed === true;
        c.hasAttacked = target.hasAttacked === true;
        c.attacks_per_turn = perTurnNew;
        // @ts-ignore
        c.attacks_left = Math.max(0, Math.min(perTurnNew, leftOld));
        c.can_attack = !!(target.can_attack && (c.hasStorm || c.hasRush || !target.justPlayed));
    } else if (c.type === "Amulet") {
        applyKeywordsFromList(c);
        if (c.hasCountdown) c.countdown = Number(c.countdown || 0);
    }

    // Replace in place; do not fire enter/leave triggers
    board.splice(idx, 1, c);
    logEvent("transformTarget", { owner, from: target.name, to: intoName, uid: target.uid });
}

/**
 * Transform a selected card in hand into another card by name.
 * Keeps uid/owner and preserves hand-relevant modifiers (cost, spellboost).
 */
export function transformHandTarget(target: CardInstance, intoName: string) {
    if (!target || !intoName) {
        console.warn("transformHandTarget: missing target or intoName");
        return;
    }

    const zone = locateZone(target);
    if (zone !== "blueHand" && zone !== "redHand") {
        console.warn("transformHandTarget: target not found in any hand");
        return;
    }

    const hand = zone === "blueHand" ? state.blueHand : state.redHand;
    const owner = zone === "blueHand" ? "blue" : "red";

    const base = getCardDetails(intoName);
    if (!base) {
        console.warn(`transformHandTarget: unknown card '${intoName}'`);
        return;
    }

    const idx = hand.indexOf(target);
    if (idx === -1) {
        console.warn("transformHandTarget: target index not found in hand");
        return;
    }

    const c: CardInstance = JSON.parse(JSON.stringify(base));
    c.uid = target.uid;
    c.owner = owner;

    // Preserve hand modifiers that affect cost/behavior while in hand
    if (target.cost_mod !== undefined) c.cost_mod = target.cost_mod;
    if (target.effectiveCost !== undefined) c.effectiveCost = target.effectiveCost;

    // Copy KeywordState relevant fields (spellboost)
    if (target.keywordState) {
        if (!c.keywordState) c.keywordState = {};
        if (target.keywordState.spellboostCount !== undefined) {
            c.keywordState.spellboostCount = target.keywordState.spellboostCount;
        }
    }

    // Minimal numeric init (hand preview may rely on these)
    // @ts-ignore
    c.attack = parseInt(c.attack as any) || 0;
    // @ts-ignore
    c.defense = parseInt(c.defense as any) || 0;

    hand.splice(idx, 1, c);
    logEvent("transformHandTarget", { owner, from: target.name, to: intoName, uid: target.uid });
}

/** Convenience entry point that works for either board or hand. */
export function transformAnywhere(target: CardInstance, intoName: string) {
    const zone = locateZone(target);
    if (zone === "blueBoard" || zone === "redBoard") return transformTarget(target, intoName);
    if (zone === "blueHand" || zone === "redHand") return transformHandTarget(target, intoName);
    console.warn("transformAnywhere: target not found in board/hand");
}

// Add near the other exports
export function transformRandomSpellInHand(owner: Player, intoName = "Ersatz Elimination") {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    if (!hand?.length) return;

    // pick a random spell
    const spells = hand.filter(c => c && c.type === "Spell");
    if (!spells.length) return;

    const pick = spells[randInt(spells.length)];
    const uid = pick.uid;

    // transform in hand (preserves uid/cost_mod/etc.)
    transformHandTarget(pick, intoName);

    // set transformed card to cost 0 until EOT
    const updated = (owner === "blue" ? state.blueHand : state.redHand).find(c => c && c.uid === uid);
    if (!updated) return;

    // @ts-ignore
    const printed = parseInt(updated.cost, 10) || 0;
    // @ts-ignore
    const existingM = parseInt(updated.cost_mod || 0, 10) || 0;
    const current = printed + existingM;
    const delta = 0 - current; // bring to zero

    // @ts-ignore
    if (updated.base_cost === undefined) updated.base_cost = printed;
    // @ts-ignore
    updated.cost_mod = existingM + delta;
    // @ts-ignore
    updated.temp_cost_mod_until_eot = (parseInt(updated.temp_cost_mod_until_eot, 10) || 0) + delta;
    logEvent("transformRandomSpell", { owner, to: intoName });
}
