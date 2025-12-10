// src/logic/effects/counters.ts
import { state } from "@core/gameState.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { completeCrest } from "@logic/effects/crest.js";
import { logEvent } from "@core/logger.js";
// --- helpers
function boardOf(owner) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}
function removeFromBoard(card) {
    const board = boardOf(card.owner);
    const i = board.findIndex((c) => c.uid === card.uid);
    if (i !== -1)
        board.splice(i, 1);
}
// Return the Counter keyword config for a given key on this card
function getCounterConfig(card, key) {
    if (!Array.isArray(card.keywords))
        return null;
    return card.keywords.find((k) => k && k.name === "Counter" && String(k.key) === String(key));
}
// Ensure auto-destroy when the tracked counter hits 0 (or below)
function ensureDestroyOnZero(card, key) {
    const conf = getCounterConfig(card, key);
    const val = card.counters?.[key] ?? 0;
    if (conf?.destroyOnEmpty && val <= 0) {
        // normalize to 0
        if (!card.counters)
            card.counters = {};
        card.counters[key] = 0;
        // fire a generic death/destroy trigger if you use one
        fireTrigger("destroyed", card.owner, { destroyed: card });
        // remove from board + re-render
        removeFromBoard(card);
        render();
        return true;
    }
    return false;
}
// Public API
export function addCounter(card, key, amount = 1) {
    if (!card.counters)
        card.counters = {};
    card.counters[key] = (card.counters[key] ?? 0) + amount;
    logEvent("counterChange", {
        card: card.name,
        uid: card.uid,
        key,
        value: card.counters[key],
    });
    // If someone adds a negative amount, still enforce destroy
    ensureDestroyOnZero(card, key);
    render();
}
export function setCounter(card, key, value) {
    if (!card.counters)
        card.counters = {};
    card.counters[key] = value;
    logEvent("counterChange", {
        card: card.name,
        uid: card.uid,
        key,
        value: card.counters[key],
    });
    ensureDestroyOnZero(card, key);
    render();
}
export function spendCounter(card, key, amount = 1) {
    if (!card.counters)
        card.counters = {};
    card.counters[key] = Math.max(0, (card.counters[key] ?? 0) - amount);
    logEvent("counterChange", {
        card: card.name,
        uid: card.uid,
        key,
        value: card.counters[key],
    });
    ensureDestroyOnZero(card, key);
    render();
}
// compatibility wrapper for effects.js
export function handleAddCounter(eff, owner, sourceCard) {
    const { key, amount = 1 } = eff;
    if (!sourceCard)
        return;
    addCounter(sourceCard, key, amount);
}
/**
 * Used by effect: { op: "reduce_countdown", amount: N }
 * Works for Amulets AND Crests.
 */
export function handleReduceCountdown(sourceCard, eff = {}) {
    const dec = Number(eff.amount ?? 1);
    // Amulet legacy path (unchanged)
    if (sourceCard && sourceCard.type === "Amulet" && sourceCard.hasCountdown) {
        sourceCard.countdown = Math.max(0, (Number(sourceCard.countdown) || 0) - dec);
        logEvent("countdownChange", {
            card: sourceCard?.name,
            owner: sourceCard.owner,
            value: sourceCard.countdown,
        });
        render();
        return;
    }
    // Crest path
    const inBlue = Array.isArray(state.blueCrests) && state.blueCrests.includes(sourceCard);
    const inRed = Array.isArray(state.redCrests) && state.redCrests.includes(sourceCard);
    const isCrestObject = !!sourceCard && Number.isFinite(sourceCard.countdown) && (inBlue || inRed);
    if (isCrestObject) {
        sourceCard.countdown = Math.max(0, (Number(sourceCard.countdown) || 0) - dec);
        const owner = inBlue ? "blue" : "red";
        logEvent("countdownChange", {
            card: sourceCard?.name,
            owner,
            value: sourceCard.countdown,
        });
        // NEW: resolve immediately when it hits 0
        if (sourceCard.countdown <= 0) {
            completeCrest(sourceCard, owner, { reason: "countdown_zero" });
            return; // already removed + paid out
        }
        render();
        return;
    }
    // Otherwise ignore.
}
// Increase countdown instead of reducing it
export function handleIncreaseCountdown(owner, amount = 1) {
    const crests = owner === "blue" ? state.blueCrests : state.redCrests;
    if (!Array.isArray(crests))
        return;
    for (const crest of crests) {
        if (Number.isFinite(crest.countdown)) {
            crest.countdown = Math.max(0, (Number(crest.countdown) || 0) + amount);
            logEvent("countdownChange", {
                card: crest?.name,
                owner,
                value: crest.countdown,
            });
        }
    }
    render();
}
