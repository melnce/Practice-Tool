// src/logic/effects/deck.ts
// ========================================================================
// UNIFIED DECK OPERATIONS
// ========================================================================

import { state } from "../../core/gameState.js";
import { getCardDetails } from "../../data/cardDatabase.js";
import { getSetCards } from "../../data/cardSets.js";
import { shuffleInPlace } from "../../core/utils.js";
import { logEvent } from "../../core/logger.js";
import type { Effect as _Effect, Player } from "../../core/types/index.js";
import { getDeck } from "../../core/playerHelpers.js";
import { handleHalveDeckCost, reduceDeckFollowersCost } from "./cost.js";

// ========================================================================
// UNIFIED DECK HANDLER - routes by action field
// ========================================================================
export function handleDeck(
  eff: any,
  owner: Player,
  context: any = {},
): void | "pending" {
  const action = eff.action || "replace";

  switch (action) {
    case "replace":
      // from_set: Replace deck with all cards from a set (one copy each)
      // Fully synchronous — set JSON is preloaded at card-DB init (no post-await RNG).
      if (eff.from_set) {
        replaceDeckFromSet(owner, eff.from_set, eff.exclude);
        context.adapter?.render?.();
      }
      // cards: Explicit card list with counts
      else if (eff.cards) {
        handleReplaceDeckFromList(owner, eff.cards);
      }
      break;

    case "cost":
      // NOTE: Synchronous import ensures deterministic effect execution order
      if (eff.mode === "halve") {
        handleHalveDeckCost(owner);
      } else if (eff.filter === "follower") {
        const amt = parseInt(eff.amount ?? 1) || 1;
        reduceDeckFollowersCost(owner, amt);
      }
      break;

    default:
      console.warn(`[deck] Unknown action: ${action}`);
  }
}

// ========================================================================
// REPLACE FROM SET
// Replace deck with all cards from a set (one copy each), optionally excluding cards by name
//
// Example:
//   { "op": "deck", "action": "replace", "from_set": "10003_heirs-of-the-omen", "exclude": ["Card Name"] }
// ========================================================================
function replaceDeckFromSet(
  owner: Player,
  setId: string,
  exclude?: string[],
): void {
  const setCards = getSetCards(setId);
  if (!setCards) {
    console.warn(
      `[deck] Set not preloaded: ${setId} (load card sets at DB init)`,
    );
    return;
  }

  const excludeSet = new Set((exclude || []).map((s) => String(s)));
  const deck = getDeck(state, owner);
  deck.length = 0;

  for (const base of setCards) {
    if (!base?.name) continue;
    if (excludeSet.has(String(base.name))) continue;
    // Prefer indexed/processed card data (keyword flags) like handleReplaceDeckFromList
    const cardData =
      getCardDetails(String(base.id ?? "")) ??
      getCardDetails(String(base.name));
    if (!cardData) continue;
    const copy = structuredClone(cardData);
    copy.uid = state.rng.makeUid();
    deck.push(copy);
  }

  shuffleInPlace(deck);
  logEvent("deckReplaceFromSet", {
    owner,
    set: setId,
    count: deck.length,
    excluded: excludeSet.size,
  });
}

// ========================================================================
// REPLACE FROM LIST
// Replace deck with explicit list of cards by name with optional counts
//
// Example:
//   { "op": "deck", "action": "replace", "cards": [{ "name": "Fairy", "count": 3 }] }
// ========================================================================
function handleReplaceDeckFromList(
  owner: Player,
  cards: { name: string; count?: number }[],
) {
  const deck = getDeck(state, owner);
  deck.length = 0;

  for (const { name, count } of cards) {
    const cardData = getCardDetails(name);
    if (cardData) {
      for (let i = 0; i < (count || 1); i++) {
        const copy = structuredClone(cardData);
        copy.uid = state.rng.makeUid();
        deck.push(copy);
      }
    }
  }

  shuffleInPlace(deck);
  logEvent("deckReplace", { owner, count: deck.length });
}
