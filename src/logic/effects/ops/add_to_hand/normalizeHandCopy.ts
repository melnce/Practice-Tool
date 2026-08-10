// src/logic/effects/ops/add_to_hand/normalizeHandCopy.ts
// Normalize a structuredClone'd live instance that is entering hand as a copy.
//
// source:"copy" clones a board/hand/etc. CardInstance. That carries runtime
// state that is wrong for a card that has *just entered* the receiving hand.
// Keep identity + printed/effect state that is ambiguous for the owner;
// strip only what is clearly invalid on a hand card (see field audit in PR).

import type { CardInstance } from "../../../../core/types/index.js";

const EPHEMERAL_UI_KEYS = [
  "__uiFlashBarrier",
  "__uiPopBarrier",
  "__uiSelectable",
  "__mulliganSelectable",
  "__mulliganSelected",
  "selected",
  "selectable",
  "glow",
] as const;

const BOARD_COMBAT_KEYS = [
  "hasAttacked",
  "attacks_left",
  "attacks_used_this_turn",
  "justPlayed",
  "can_attack",
  "can_attack_followers",
] as const;

const BOARD_PROVENANCE_KEYS = [
  "insertionTs",
  "__onceByTurn",
  "_spawnedByChain",
  "_spawnedByCongregant",
  "__icarusBuff",
] as const;

function deleteKeys(card: CardInstance, keys: readonly string[]): void {
  const bag = card as CardInstance & Record<string, unknown>;
  for (const key of keys) {
    delete bag[key];
  }
}

/**
 * Reset runtime fields so a copied instance behaves as a fresh hand card
 * for Skybound gauge and board combat, without guessing on evolve/buffs.
 */
export function normalizeInstanceEnteringHandAsCopy(copy: CardInstance): void {
  // Bible (Skybound Art gauge): evolves before the card entered hand do not count.
  copy.skyboundArtEvolvesWitnessed = 0;

  // Board combat / summoning-sick flags are meaningless in hand.
  deleteKeys(copy, BOARD_COMBAT_KEYS);

  // Damage taken on the field must not persist into hand HP.
  const peak = copy.peak_defense;
  const def = copy.defense;
  if (
    typeof peak === "number" &&
    Number.isFinite(peak) &&
    typeof def === "number" &&
    Number.isFinite(def) &&
    def < peak
  ) {
    copy.defense = peak;
  }
  delete (copy as { isDamaged?: boolean }).isDamaged;

  // Ephemeral UI / selection / once-per-life board provenance.
  deleteKeys(copy, EPHEMERAL_UI_KEYS);
  deleteKeys(copy, BOARD_PROVENANCE_KEYS);

  // Turn-scoped engage lock inside keywordState (keep the rest — ambiguous).
  if (copy.keywordState && "engagedThisTurn" in copy.keywordState) {
    delete copy.keywordState.engagedThisTurn;
  }
}
