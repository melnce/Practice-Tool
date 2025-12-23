// src/logic/effects/deck.ts
// ========================================================================
// UNIFIED DECK OPERATIONS
// ========================================================================

import { state } from "../../core/gameState.js";
import { getCardDetails } from "../../data/cardDatabase.js";
import { shuffleInPlace } from "../../core/utils.js";
import { logEvent } from "../../core/logger.js";
import { Effect, Player } from "../../core/types.js";

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
      if (eff.from_set) {
        void replaceDeckFromSet(owner, eff.from_set, eff.exclude).then(() => {
          context.adapter?.render?.();
        });
      }
      // cards: Explicit card list with counts
      else if (eff.cards) {
        handleReplaceDeckFromList(owner, eff.cards);
      }
      break;

    case "cost":
      void import("./cost.js").then(
        ({ handleHalveDeckCost, reduceDeckFollowersCost }) => {
          if (eff.mode === "halve") {
            handleHalveDeckCost(owner);
          } else if (eff.filter === "follower") {
            const amt = parseInt(eff.amount ?? 1) || 1;
            reduceDeckFollowersCost(owner, amt);
          }
        },
      );
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
async function replaceDeckFromSet(
  owner: Player,
  setId: string,
  exclude?: string[],
): Promise<void> {
  const setFile = `/cards/sets/${setId}.json`;
  const excludeSet = new Set((exclude || []).map((s) => String(s)));

  const res = await fetch(setFile, { cache: "no-cache" });
  if (!res.ok) {
    console.warn(`[deck] Set not found: ${setId} (${setFile})`);
    return;
  }
  const cards = await res.json();

  const deck = owner === "blue" ? state.blueDeck : state.redDeck;
  deck.length = 0;

  for (const base of Array.isArray(cards) ? cards : []) {
    if (!base?.name) continue;
    if (excludeSet.has(String(base.name))) continue;
    const copy = JSON.parse(JSON.stringify(base));
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
  const deck = owner === "blue" ? state.blueDeck : state.redDeck;
  deck.length = 0;

  for (const { name, count } of cards) {
    const cardData = getCardDetails(name);
    if (cardData) {
      for (let i = 0; i < (count || 1); i++) {
        const copy = JSON.parse(JSON.stringify(cardData));
        copy.uid = state.rng.makeUid();
        deck.push(copy);
      }
    }
  }

  shuffleInPlace(deck);
  logEvent("deckReplace", { owner, count: deck.length });
}

// Legacy export alias (deprecated - use handleDeck instead)
export const handleReplaceDeck = handleReplaceDeckFromList;
