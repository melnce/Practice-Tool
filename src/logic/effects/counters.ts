// src/logic/effects/counters.ts
import { state } from "../../core/gameState.js";
import { completeCrest } from "./crest.js";
import { logEvent } from "../../core/logger.js";
import { CardInstance, Effect, Player } from "../../core/types/index.js";
import { getBoard, getCrests } from "../../core/playerHelpers.js";

// --- helpers
function boardOf(owner: Player) {
  return getBoard(state, owner);
}
function removeFromBoard(card: CardInstance) {
  const owner = card.owner;
  if (!owner) return;
  const board = boardOf(owner);
  const i = board.findIndex((c) => c.uid === card.uid);
  if (i !== -1) board.splice(i, 1);
}

// Return the Counter keyword config for a given key on this card
function getCounterConfig(card: CardInstance, key: string) {
  if (!Array.isArray(card.keywords)) return null;
  return card.keywords.find(
    (k) =>
      k &&
      (k as any).name === "Counter" &&
      String((k as any).key) === String(key),
  );
}

// Ensure auto-destroy when the tracked counter hits 0 (or below)
function ensureDestroyOnZero(card: CardInstance, key: string) {
  const conf = getCounterConfig(card, key);
  const val = card.counters?.[key] ?? 0;

  if ((conf as any)?.destroyOnEmpty && val <= 0) {
    // normalize to 0
    if (!card.counters) card.counters = {};
    card.counters[key] = 0;

    // remove from board + re-render
    removeFromBoard(card);
    // Render removed - UI layer
    return true;
  }
  return false;
}

// Public API
export function addCounter(card: CardInstance, key: string, amount = 1) {
  if (!card.counters) card.counters = {};
  card.counters[key] = (card.counters[key] ?? 0) + amount;
  logEvent("counterChange", {
    card: card.name,
    uid: card.uid,
    key,
    value: card.counters[key],
  });
  // If someone adds a negative amount, still enforce destroy
  ensureDestroyOnZero(card, key);
  // Render removed - UI layer
}

export function setCounter(card: CardInstance, key: string, value: number) {
  if (!card.counters) card.counters = {};
  card.counters[key] = value;
  logEvent("counterChange", {
    card: card.name,
    uid: card.uid,
    key,
    value: card.counters[key],
  });
  ensureDestroyOnZero(card, key);
  // Render removed - UI layer
}

export function spendCounter(card: CardInstance, key: string, amount = 1) {
  if (!card.counters) card.counters = {};
  card.counters[key] = Math.max(0, (card.counters[key] ?? 0) - amount);
  logEvent("counterChange", {
    card: card.name,
    uid: card.uid,
    key,
    value: card.counters[key],
  });
  ensureDestroyOnZero(card, key);
  // Render removed - UI layer
}

// compatibility wrapper for effects.js
export function handleAddCounter(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
) {
  const { key, amount = 1 } = eff as any;
  if (!sourceCard) return;
  addCounter(sourceCard, key, amount);
}

/**
 * Used by effect: { op: "reduce_countdown", amount: N }
 * Works for Amulets AND Crests.
 */
export function handleReduceCountdown(
  sourceCard: CardInstance | null,
  eff: Effect = {} as any,
) {
  const dec = Number((eff as any).amount ?? 1);

  // Amulet legacy path (unchanged)
  if (sourceCard && sourceCard.type === "Amulet" && sourceCard.hasCountdown) {
    sourceCard.countdown = Math.max(
      0,
      (Number(sourceCard.countdown) || 0) - dec,
    );
    logEvent("countdownChange", {
      card: sourceCard?.name,
      owner: sourceCard.owner,
      value: sourceCard.countdown,
    });
    // Render removed - UI layer
    return;
  }

  // Crest path
  const blueCrests = getCrests(state, "first");
  const redCrests = getCrests(state, "second");
  const inBlue = Array.isArray(blueCrests) && blueCrests.includes(sourceCard as any);
  const inRed = Array.isArray(redCrests) && redCrests.includes(sourceCard as any);
  const isCrestObject =
    !!sourceCard && Number.isFinite(sourceCard.countdown) && (inBlue || inRed);

  if (isCrestObject) {
    sourceCard.countdown = Math.max(
      0,
      (Number(sourceCard.countdown) || 0) - dec,
    );
    const owner = inBlue ? "first" : "second";
    logEvent("countdownChange", {
      card: sourceCard?.name,
      owner,
      value: sourceCard.countdown,
    });

    // NEW: resolve immediately when it hits 0
    if ((sourceCard.countdown as number) <= 0) {
      completeCrest(sourceCard as any, owner, { reason: "countdown_zero" });
      return; // already removed + paid out
    }

    // Render removed - UI layer
    return;
  }

  // Otherwise ignore.
}

// Increase countdown instead of reducing it
export function handleIncreaseCountdown(owner: Player, amount = 1) {
  const crests = getCrests(state, owner);
  if (!Array.isArray(crests)) return;

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
  // Render removed - UI layer
}















