// src/logic/effects/ops/restore/primitives.ts
// Low-level restore operations.

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player } from "../../../../core/types/index.js";
import { fireTrigger } from "../../../core/triggers.js";
import { getHP, setHP, getMaxHP, getHand, getBoard } from "../../../../core/playerHelpers.js";

// ============================================================================
// LEADER RESTORE
// ============================================================================

/**
 * Restore leader HP by fixed amount, respecting max HP.
 * Fires `leader_restored` trigger if HP actually increases.
 * @returns actual amount healed
 */
export function restoreLeaderHP(player: Player, amount: number): number {
  if (amount <= 0) return 0;

  const before = getHP(state, player);
  const maxHP = getMaxHP(state, player);
  const newHP = Math.max(0, Math.min(maxHP, before + amount));
  setHP(state, player, newHP);
  const healed = newHP - before;

  if (healed > 0) {
    logEvent("restoreLeader", { player, amount: healed });
    // Fire trigger so cards/crests can react to leader heal
    fireTrigger("leader_restored", player, { amount: healed });
  }

  return healed;
}

/**
 * Get hand size for a player.
 */
export function getHandSize(player: Player): number {
  const hand = getHand(state, player);
  return hand?.length || 0;
}

// ============================================================================
// FOLLOWER RESTORE
// ============================================================================

/**
 * Get the maximum defense for a follower (potential > peak > base > current).
 */
export function getMaxDefense(card: CardInstance): number {
  const curr = parseInt(String(card.defense), 10) || 0;

  if (Number.isFinite(card.potential_defense)) return card.potential_defense!;
  if (Number.isFinite(card.peak_defense)) return card.peak_defense!;
  if (card.base_defense !== undefined) {
    const baseDefNum = parseInt(String(card.base_defense), 10);
    if (Number.isFinite(baseDefNum)) return baseDefNum;
  }

  return curr;
}

/**
 * Restore a follower's defense to full.
 * @returns amount restored
 */
export function restoreFollowerToFull(card: CardInstance): number {
  if (!card || card.type !== "Follower") return 0;

  const curr = parseInt(String(card.defense), 10) || 0;
  const full = getMaxDefense(card);
  const restored = Math.max(0, full - curr);

  if (restored > 0) {
    card.defense = full;
    // Store for chained effects
    (card as any).__lastRestored = restored;
    logEvent("restoreFollower", { name: card.name, uid: card.uid, restored });
  }

  return restored;
}

/**
 * Restore a follower's defense by a fixed amount (up to max).
 * @returns actual amount restored
 */
export function restoreFollowerByAmount(
  card: CardInstance,
  amount: number,
): number {
  if (!card || card.type !== "Follower" || amount <= 0) return 0;

  const curr = parseInt(String(card.defense), 10) || 0;
  const max = getMaxDefense(card);
  const canRestore = max - curr;

  if (canRestore <= 0) return 0;

  const actual = Math.min(amount, canRestore);
  card.defense = curr + actual;
  logEvent("restoreFollower", {
    name: card.name,
    uid: card.uid,
    restored: actual,
  });

  return actual;
}

/**
 * Get allied followers on board.
 */
export function getAlliedFollowers(owner: Player): CardInstance[] {
  const board = getBoard(state, owner);
  return board.filter((c) => c && c.type === "Follower");
}















