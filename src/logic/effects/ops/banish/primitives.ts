// src/logic/effects/ops/banish/primitives.ts
// Low-level banish operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { fireTrigger } from "../../../core/triggers.js";
import type { TriggerContext } from "../../../core/triggers/types.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import {
  getBoard as getPlayerBoard,
  getDeck,
  getBanish,
} from "../../../../core/playerHelpers.js";
import { bumpZoneVersion } from "../../../core/triggers/utils.js";

// ============================================================================
// CORE PRIMITIVES
// ============================================================================

/**
 * Banish a single card from its current zone.
 * Fires ally_follower_leaves_field and enemy_follower_leaves_field triggers.
 * @returns true if card was banished
 */
export function banishCard(
  card: CardInstance,
  reason: string = "effect",
): boolean {
  if (!card) return false;

  // Try first player's board
  const firstBoard = getPlayerBoard(state, "first");
  const bi = firstBoard.indexOf(card);
  if (bi !== -1) {
    firstBoard.splice(bi, 1);
    bumpZoneVersion(); // PERF: Invalidate cache before triggers
    if (card.type === "Follower") {
      const leaveCtx: TriggerContext = {
        leavingOwner: "first",
        leavingCard: card,
      };
      fireTrigger("ally_follower_leaves_field", "first", leaveCtx);
      fireTrigger("enemy_follower_leaves_field", "first", leaveCtx);
    }
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "first",
      reason,
    });
    moveToBanishZone(card, "first");
    return true;
  }

  // Try second player's board
  const secondBoard = getPlayerBoard(state, "second");
  const ri = secondBoard.indexOf(card);
  if (ri !== -1) {
    secondBoard.splice(ri, 1);
    bumpZoneVersion(); // PERF: Invalidate cache before triggers
    if (card.type === "Follower") {
      const leaveCtx: TriggerContext = {
        leavingOwner: "second",
        leavingCard: card,
      };
      fireTrigger("ally_follower_leaves_field", "second", leaveCtx);
      fireTrigger("enemy_follower_leaves_field", "second", leaveCtx);
    }
    logEvent("banish", {
      card: card.name,
      uid: card.uid,
      owner: "second",
      reason,
    });
    moveToBanishZone(card, "second");
    return true;
  }

  return false;
}

/**
 * Banish source card (self-banish).
 */
export function banishSelf(sourceCard: CardInstance | null): boolean {
  if (!sourceCard) return false;
  return banishCard(sourceCard, "self");
}

/**
 * Move a card into the owner's banish zone and mark `zone = "banished"`.
 * Does **not** search boards or fire leave-field triggers — callers must
 * already have removed the card from its prior zone (hand / board / deck).
 * Use this for hand/deck banishes; `banishCard` is for board removals only.
 */
export function moveToBanishZone(card: CardInstance, owner: Player): void {
  card.zone = "banished";
  const bzone = getBanish(state, owner);
  if (Array.isArray(bzone)) {
    bzone.push(card);
    bumpZoneVersion();
  }
}

// ============================================================================
// DECK OPERATIONS
// ============================================================================

/**
 * Get deck and banish zone for an owner.
 */
function getDeckAndBanish(
  owner: Player,
): [CardInstance[], CardInstance[] | null] {
  const deck = getDeck(state, owner);
  const bzone = getBanish(state, owner);
  return [Array.isArray(deck) ? deck : [], Array.isArray(bzone) ? bzone : null];
}

/**
 * Banish all duplicate cards from owner's deck (keep first occurrence).
 * @returns count of cards banished
 */
export function banishDeckDuplicates(owner: Player): number {
  const [deck, bzone] = getDeckAndBanish(owner);
  if (!deck.length) return 0;

  const seen = new Set<string>();
  const kept: CardInstance[] = [];
  const removed: CardInstance[] = [];

  for (const card of deck) {
    const key = String(card?.name || "");
    if (!key) continue;
    if (seen.has(key)) {
      removed.push(card);
    } else {
      seen.add(key);
      kept.push(card);
    }
  }

  // Overwrite deck in place
  deck.length = 0;
  deck.push(...kept);
  bumpZoneVersion();
  logEvent("banishDuplicatesFromDeck", {
    owner,
    kept: kept.length,
    removed: removed.length,
  });

  // Move to banish zone if available
  if (bzone && removed.length) {
    bzone.push(...removed);
  }

  return removed.length;
}

/**
 * Banish all deck cards matching a filter (cost_in / type / etc).
 * Does not fire leave-field triggers (cards were never on field).
 * @returns count banished
 */
export function banishFilteredFromDeck(
  owner: Player,
  filters: Record<string, any> | null,
): number {
  const [deck, bzone] = getDeckAndBanish(owner);
  if (!deck.length) return 0;

  const costInRaw = filters?.cost_in ?? filters?.base_cost_in ?? null;
  const costIn = Array.isArray(costInRaw)
    ? costInRaw.map((n) => parseInt(String(n), 10)).filter(Number.isFinite)
    : null;
  const wantType = filters?.type ? String(filters.type).toLowerCase() : null;
  const wantName = filters?.name ? String(filters.name).trim() : null;

  // Refuse unfiltered deck wipe — callers must supply cost_in / type / name / etc.
  if (!filters || (!wantType && !(costIn && costIn.length) && !wantName)) {
    logEvent("banishFilteredFromDeck_noFilter", { owner, filters });
    return 0;
  }

  const kept: CardInstance[] = [];
  const removed: CardInstance[] = [];

  for (const card of deck) {
    if (!card) continue;
    const cost = parseInt(String(card.cost), 10) || 0;
    const typeOk =
      !wantType || String(card.type || "").toLowerCase() === wantType;
    const costOk = !costIn || costIn.includes(cost);
    const nameOk = !wantName || String(card.name) === wantName;
    if (typeOk && costOk && nameOk) {
      removed.push(card);
    } else {
      kept.push(card);
    }
  }

  deck.length = 0;
  deck.push(...kept);
  bumpZoneVersion();

  if (bzone && removed.length) {
    for (const card of removed) {
      card.zone = "banished";
      bzone.push(card);
    }
  }

  logEvent("banishFilteredFromDeck", {
    owner,
    removed: removed.length,
    filters,
  });
  return removed.length;
}

/**
 * Banish all enemy cards with same name as selected card.
 * @returns count of cards banished
 */
export function banishAllEnemyCopies(
  owner: Player,
  selected: CardInstance | null,
): number {
  if (!selected || !selected.name) return 0;

  const oppBoard = getPlayerBoard(
    state,
    owner === "first" ? "second" : "first",
  );
  const hits = oppBoard.filter((c) => c?.name === selected.name);

  let count = 0;
  for (const card of hits) {
    if (banishCard(card, "all_enemy_copies")) {
      count++;
    }
  }

  return count;
}

/**
 * Get owner of a board card.
 */
export function getCardOwner(card: CardInstance): Player | null {
  if (getPlayerBoard(state, "first").includes(card)) return "first";
  if (getPlayerBoard(state, "second").includes(card)) return "second";
  return null;
}

/**
 * Get board for owner.
 */
export function getBoard(owner: Player): CardInstance[] {
  return getPlayerBoard(state, owner);
}
