import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";
import type { Effect, Player } from "../../core/types/index.js";
import { fireTrigger } from "../core/triggers.js";
import {
  getHP,
  setHP,
  setMaxHP,
  getPP,
  setPP,
  getMaxPP,
  opponentOf,
  getEvoCharges,
  setEvoCharges,
} from "../../core/playerHelpers.js";
import { applyGameOverIfNeeded, isGameOver } from "../../core/gameOver.js";

// ============================================================================
// NOTE: "heal" operations are DEPRECATED. Use "restore" instead.
// All healing should go through: handleRestore({ op: "restore", target: "leader", player: "self", amount: X })
// from src/logic/effects/ops/restore/index.ts
// ============================================================================

/**
 * NEW: Sets a leader's maximum HP to a specific value.
 */
export function handleSetMaxHP(eff: Effect, owner: Player) {
  const targetPlayerString = eff.player || "self"; // 'self' or 'opponent'
  const amount = parseInt(eff.amount) || 20;

  const isOpponent = targetPlayerString === "opponent";
  const targetOwner: Player = isOpponent ? opponentOf(owner) : owner;

  logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: amount });

  setMaxHP(state, targetOwner, amount);
  // Clamp current HP to the new max (no accidental +amt)
  const currentHP = getHP(state, targetOwner);
  setHP(state, targetOwner, Math.max(0, Math.min(amount, currentHP)));
}

/**
 * Handles recovering a player's play points for the current turn.
 * (This function is unchanged)
 */
export function handleRecoverPP(owner: Player, eff: Effect) {
  // Determine target side
  const targetPlayer: Player =
    (eff.player || "self") === "self" ? owner : opponentOf(owner);

  const cur = getPP(state, targetPlayer);
  const max = getMaxPP(state, targetPlayer);

  // Allow symbolic "full" refills (your card uses "currentMaxPP")
  let amt;
  if (
    typeof eff.amount === "string" &&
    eff.amount.toLowerCase() === "currentmaxpp"
  ) {
    amt = Math.max(0, max - cur);
  } else {
    amt = parseInt(eff.amount) || 0;
  }

  const next = Math.min(max, cur + amt);
  setPP(state, targetPlayer, next);
}

/* ---------- NEW: leader barrier state ops ---------- */
export function grantLeaderBarrier(owner: Player, _charges = 1) {
  // Ignore extra charges: once the leader has Barrier, do nothing.
  if (state.players[owner].leaderBarrier) return; // already has Barrier

  state.players[owner].leaderBarrier = 1;
  logEvent("leaderBarrierGrant", { owner });
}

export function popLeaderBarrier(owner: Player, reason = "damage_prevent") {
  if (!state.players[owner].leaderBarrier) return false;

  logEvent("leaderBarrierPop", { owner, reason });
  state.players[owner].leaderBarrier = 0;
  // Note: leaderBarrierPopped reason is now just logged, not stored separately
  return true;
}

function getLeaderMaxDamageCap(owner: Player): number | null {
  const playerCap = state.players[owner].leaderMaxDamageCap;
  if (typeof playerCap === "number" && Number.isFinite(playerCap)) {
    return playerCap;
  }
  return null;
}

/** Centralized leader damage that respects barrier and max HP */
export function applyLeaderDamage(owner: Player, amount: number) {
  amount = amount | 0;
  if (amount < 0) return 0;
  // Match already over — no further leader damage (bible continuous lethal).
  if (isGameOver()) return 0;

  logEvent("leaderDamage", { owner, amount });

  // Barrier soaks the *whole packet* and consumes 1 charge
  if (popLeaderBarrier(owner, "leader_hit")) return 0;

  // Max damage cap (Zooey) — root state keys + per-player fallback
  const cap = getLeaderMaxDamageCap(owner);

  // NEW: Leader damage modifier (Beelzebub) - now from nested state
  const mod = state.players[owner].leaderDamageTakenBonus || 0;

  // Apply modifier BEFORE cap
  if (mod > 0) {
    amount += mod;
    logEvent("leaderDamageResistMod", { owner, mod, newAmount: amount });
  }

  if (typeof cap === "number" && Number.isFinite(cap)) {
    if (amount > cap) {
      logEvent("leaderDamageCapped", { owner, original: amount, capped: cap });
      amount = cap;
    }
  }

  if (amount <= 0) return 0;

  const cur = getHP(state, owner);
  const next = Math.max(0, cur - (amount | 0));
  setHP(state, owner, next);

  const actualDamage = cur - next;

  // Continuous lethal check (bible §219): first time a leader reaches 0, match ends.
  if (next <= 0) {
    applyGameOverIfNeeded("lethal");
  }

  // Damage triggers still fire for this packet so Last Words / reactions from the
  // same hit can observe it; further packets are blocked by isGameOver() above.
  if (actualDamage > 0) {
    fireTrigger("leader_damaged", owner, {
      damagedLeader: owner,
      amount: actualDamage,
    });
  }

  return actualDamage;
}

/* ---------- NEW: effect op for cards ---------- */
export function handleLeaderBarrierOp(owner: Player, eff: Effect) {
  const target: Player =
    (eff.player || "self") === "self" ? owner : opponentOf(owner);
  // Ignore eff.charges / eff.amount > 1
  grantLeaderBarrier(target, 1);
}
// NEW: Recover Evolution Points (capped at starting max)
export function handleRecoverEP(owner: Player, eff: Effect) {
  const amt = parseInt(eff.amount) || 0;
  const targetPlayer: Player =
    (eff.player || "self") === "self" ? owner : opponentOf(owner);
  const MAX_EP = 2; // Starting maximum for both players
  const currentEvo = getEvoCharges(state, targetPlayer);
  setEvoCharges(state, targetPlayer, Math.min(MAX_EP, currentEvo + amt));
  logEvent("recoverEP", { owner: targetPlayer, amount: amt });
}

export function handleSetLeaderMaxDamageCap(eff: Effect, owner: Player) {
  const targetPlayerString = eff.player || "self";
  const amount = parseInt(eff.amount as any) || 0;
  const isOpponent = targetPlayerString === "opponent";
  const targetOwner: Player = isOpponent ? opponentOf(owner) : owner;

  // Store on PlayerState (reset-covered) — never root ad-hoc keys
  state.players[targetOwner].leaderMaxDamageCap = amount;

  // Handle duration (Zooey uses "opponent_turn_end")
  if (eff.duration === "opponent_turn_end") {
    state.players[targetOwner].leaderMaxDamageCapExpiry = "opponent_turn_end";
  } else {
    state.players[targetOwner].leaderMaxDamageCapExpiry = null;
  }

  logEvent("setLeaderMaxDamageCap", {
    owner: targetOwner,
    cap: amount,
    duration: eff.duration,
  });
}

// NEW: Modify how much damage a leader takes (permanently or temporarily)
export function handleModifyLeaderDamageReceived(eff: Effect, owner: Player) {
  const targetPlayerString = eff.player || "self";
  const isOpponent = targetPlayerString === "opponent";
  const targetOwner: Player = isOpponent ? opponentOf(owner) : owner;

  const amt = parseInt(eff.amount as any) || 0;

  // Use nested player state
  state.players[targetOwner].leaderDamageTakenBonus += amt;

  logEvent("modifyLeaderDamageReceived", {
    owner: targetOwner,
    amount: amt,
    total: state.players[targetOwner].leaderDamageTakenBonus,
  });
}
