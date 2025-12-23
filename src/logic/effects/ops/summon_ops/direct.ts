import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";

import { applyKeywordsFromList, applyKeyword } from "../../../core/keywords.js";
import { CardInstance, Effect, Player } from "../../../../core/types.js";
import {
  getCardDetails,
  isCardDatabaseInitialized,
} from "../../../../data/cardIndex.js";
import { adapter } from "../../../../core/adapter.js";
import { makeCardFromDB, pushToBoard } from "./core.js";
import { boardOf, normalizeName, safeClone } from "./utils.js";
import { findEarthSigilTarget } from "./earth.js";

// =============== Public API ===============

export function summonNamed(eff: Effect, owner: Player) {
  if (state.lastSummoned) state.lastSummoned.length = 0;

  const name = String((eff as any)?.name || "").trim();
  let count = parseInt((eff as any)?.count);
  if (!Number.isFinite(count) || count <= 0) count = 1;

  if (!name) return;

  const data = getCardDetails(name);
  if (!data) {
    console.error(`summonNamed: Card "${name}" not found in DB`);
    console.log(
      `DEBUG: direct.ts - isCardDatabaseInitialized: ${isCardDatabaseInitialized()}`,
    );
    return;
  }

  const board = boardOf(owner);
  const isSedimentSummon = normalizeName(name) === "magic sediment";

  for (let i = 0; i < count; i++) {
    if (isSedimentSummon) {
      // SPECIAL HANDLING FOR MAGIC SEDIMENT: Check if any Earth Sigil exists first
      const existingEarthSigil = findEarthSigilTarget(board);
      if (existingEarthSigil) {
        // Add counter to existing Earth Sigil instead of summoning new one
        existingEarthSigil.counters = existingEarthSigil.counters || {};
        existingEarthSigil.counters.earth =
          (existingEarthSigil.counters.earth || 0) + 1;
        continue; // Skip summoning
      }
    }

    const card = makeCardFromDB(data, owner);

    // STRICT: Only accept keywords array, not singular keyword
    if (Array.isArray(eff?.keywords)) {
      for (const kw of eff.keywords) {
        if (typeof kw === "string") applyKeyword(card, kw);
        else if (kw && typeof kw.name === "string")
          applyKeyword(card, kw.name, kw);
      }
    }

    const placed = pushToBoard(board, owner, card);
    if (placed) {
      logEvent("summon", { owner, card: card.name, uid: card.uid });
      state.lastSummoned.push(card);
    }
  }

  adapter.render();
}

export function summonExactCopy(sourceCard: CardInstance, owner: Player) {
  if (!sourceCard || sourceCard.type !== "Follower") return null;

  const board = boardOf(owner);
  if ((board?.length || 0) >= 5) return null;

  // Deep clone current instance (no cycles)
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(sourceCard)
      : safeClone<CardInstance>(sourceCard);

  // Normalize instance identity/placement
  clone.uid = state.rng.makeUid();
  clone.owner = owner;
  clone.zone = "board";
  clone.selected = false;
  clone.selectable = false;
  clone.glow = false;

  // Make sure arrays/objects exist
  clone.triggers = Array.isArray(clone.triggers) ? clone.triggers : [];
  clone.keywords = Array.isArray(clone.keywords) ? clone.keywords : [];
  clone.buffs = clone.buffs || {};

  // Follower init similar to summonExactCopyFromHand
  clone.attack = parseInt(String(clone.attack || 0), 10) || 0;
  clone.defense = parseInt(String(clone.defense || 0), 10) || 0;

  if (clone.base_attack == null) clone.base_attack = clone.attack;
  if (clone.base_defense == null) clone.base_defense = clone.defense;
  if (clone.peak_defense == null) clone.peak_defense = clone.defense;

  // Re-derive keyword flags (Rush/Storm/etc.) from keywords list
  applyKeywordsFromList(clone);

  // Turn state
  clone.justPlayed = true;
  clone.hasAttacked = false;
  clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn)
    ? clone.attacks_per_turn!
    : 1;
  clone.attacks_left = clone.attacks_per_turn;

  // Combat flags
  if (clone.hasStorm) {
    clone.can_attack = true;
    clone.can_attack_followers = true;
    clone.isRush = false;
  } else if (clone.hasRush) {
    clone.can_attack = true; // followers this turn
    clone.can_attack_followers = true;
    clone.isRush = true;
  } else {
    clone.can_attack = false;
    clone.can_attack_followers = false;
    clone.isRush = false;
  }

  if (!pushToBoard(board, owner, clone)) return null;

  logEvent("summonExactCopy", { owner, from: sourceCard.name, uid: clone.uid });
  // >>> Congregant chain managed by JSON triggers now

  if (state.lastSummoned) {
    state.lastSummoned.length = 0;
    state.lastSummoned.push(clone);
  }
  adapter.render();
  return clone;
}
