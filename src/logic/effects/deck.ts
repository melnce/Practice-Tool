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
import { pickDestroyedMatchHighestBaseCost } from "../core/destroyedHistory.js";
import { getCardById } from "../../data/cardDatabase.js";
import { normalizeCardStats } from "../../core/cardStats.js";

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

    case "add":
      // Add named card(s) or destroyed_match picks into the deck (does not clear).
      if (eff.source === "destroyed_match") {
        handleAddDestroyedMatchToDeck(owner, eff);
      } else {
        handleAddToDeck(owner, eff);
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

// ========================================================================
// ADD NAMED CARDS
// Append copies by name (or self via name from source) without clearing.
//
// Examples:
//   { "op": "deck", "action": "add", "name": "Ephemeral Foxfire", "count": 1 }
//   { "op": "deck", "action": "add", "name": "Lhynkal, Wandering Fool", "count": 10 }
// ========================================================================
function handleAddToDeck(owner: Player, eff: any): void {
  const deck = getDeck(state, owner);
  const count = Math.max(1, parseInt(String(eff.count ?? 1), 10) || 1);
  const name = String(eff.name || "").trim();
  if (!name) {
    console.warn("[deck] add requires name");
    return;
  }
  const cardData = getCardDetails(name);
  if (!cardData) {
    console.warn(`[deck] add: card not found: ${name}`);
    return;
  }
  for (let i = 0; i < count; i++) {
    const copy = structuredClone(cardData);
    copy.uid = state.rng.makeUid();
    // Optional cost override (e.g. Drache crest sets cost to 2)
    if (eff.set_cost !== undefined) {
      const c = parseInt(String(eff.set_cost), 10);
      if (Number.isFinite(c)) {
        copy.cost = c;
        (copy as any).base_cost = c;
      }
    }
    deck.push(copy);
  }
  if (eff.shuffle !== false) {
    shuffleInPlace(deck);
  }
  logEvent("deckAdd", { owner, name, count });
}

function handleAddDestroyedMatchToDeck(owner: Player, eff: any): void {
  const deck = getDeck(state, owner);
  const count = Math.max(1, parseInt(String(eff.count ?? 1), 10) || 1);
  const rank = String(eff.rank ?? eff.pick ?? "").toLowerCase();
  const stat = String(eff.stat ?? "base_cost").toLowerCase();
  if (rank !== "highest" || stat !== "base_cost") {
    console.warn(
      `[deck] destroyed_match add supports rank=highest stat=base_cost only`,
    );
    return;
  }

  for (let i = 0; i < count; i++) {
    const record = pickDestroyedMatchHighestBaseCost(state, owner, {
      filter: eff.filter,
    });
    if (!record) {
      logEvent("deckAdd_destroyed_match_notFound", { owner });
      continue;
    }
    const base =
      getCardById(record.cardId || record.id) ?? getCardDetails(record.name);
    if (!base) {
      console.warn(
        `[deck] destroyed_match add: card not found: ${record.name}`,
      );
      continue;
    }
    const copy = structuredClone(base);
    copy.uid = state.rng.makeUid();
    copy.owner = owner;
    copy.zone = "deck";
    normalizeCardStats(copy);
    deck.push(copy);
    logEvent("deckAdd", {
      owner,
      name: copy.name,
      count: 1,
      source: "destroyed_match",
      from: record.uid,
    });
  }

  if (eff.shuffle !== false) {
    shuffleInPlace(deck);
  }
}
