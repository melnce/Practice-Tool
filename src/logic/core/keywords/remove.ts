import type { CardInstance } from "../../../core/types/index.js";
import { normalizeKeywordName } from "./registry.js";
// import { getKS } from "./internal.js";
// import { state } from "../../../core/gameState.js";

// Helper to clear the lock flags on a single card (keywordState is SoT).
export function clearCantAttack(card: CardInstance) {
  if (!card) return;
  if (card.keywordState) {
    const ks = card.keywordState;
    delete ks.hasCantAttack;
    delete ks.cantAttack;
    delete ks.cantAttackFollowers;
    delete ks.cantAttackLeaders;
    delete ks.cantAttackUntilOpponentEOT;
    delete ks.cantAttackExpiresOnTurn;
    delete ks.cantAttackIsTemporary;
    delete ks.cantAttackOwner;
  }
  // Defensive scrub of legacy root mirrors (no longer written by applyKeyword).
  delete (card as any).cantAttack;
  delete (card as any).cantAttackFollowers;
  delete (card as any).cantAttackLeaders;
}

export function removeKeywordFromSingleCard(
  target: CardInstance,
  rawKeyword: string,
) {
  const normalizedRaw = normalizeKeywordName(rawKeyword);
  const keywordToRemove = normalizedRaw || rawKeyword.toLowerCase();

  if (!keywordToRemove) return;

  // Step 1: Disable the keyword's functionality (flags)
  if (keywordToRemove === "ward") target.hasWard = false;
  else if (keywordToRemove === "rush") target.hasRush = false;
  else if (keywordToRemove === "storm") target.hasStorm = false;
  else if (keywordToRemove === "bane") target.hasBane = false;
  else if (keywordToRemove === "intimidate") target.hasIntimidate = false;
  else if (keywordToRemove === "drain") target.hasDrain = false;
  else if (keywordToRemove === "last_words")
    target.hasLastWords = false; // Canonical key
  else if (keywordToRemove === "ambush") target.hasAmbush = false;

  // Step 2: Remove from KeywordState if applicable
  // (Logic to clear specific keyword state bits could be expanded here)
  if (target.keywordState) {
    // const ks = target.keywordState;
  }

  // Step 3: Remove the keyword from the card's data array to fix the UI
  if (Array.isArray(target.keywords)) {
    target.keywords = target.keywords.filter((k) => {
      const kwName = (typeof k === "string" ? k : (k as any)?.name) || "";
      return normalizeKeywordName(kwName) !== keywordToRemove;
    });
  }
}

export function removeAllAbilitiesFromCard(card: CardInstance) {
  // Clear boolean flags
  card.hasRush = false;
  card.hasStorm = false;
  card.hasWard = false;
  card.hasBane = false;
  card.hasDrain = false;
  card.hasAmbush = false;
  card.hasIntimidate = false;
  card.hasLastWords = false;

  card.hasAura = false;

  // Clear complex properties in KeywordState
  if (card.keywordState) {
    const ks = card.keywordState;
    ks.hasBarrier = false;

    ks.triggers = [];
    ks.hasFanfare = false;

    card.fanfare = []; // Clear root fanfare

    ks.lastWordsEffects = [];
    ks.strikeEffects = [];
    ks.engageEffects = [];

    card.enhanceTiers = [];

    // Clear Cant Attack
    clearCantAttack(card);
  }
}
