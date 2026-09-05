// src/logic/core/combat.ts
import type { CardInstance, Player } from "../../core/types/index.js";
import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";

import { fireTrigger } from "./triggers.js";
import {
  fireAttackerCombatTriggers,
  fireDefenderClashTriggers,
} from "./triggers/handlers/combat.js";
import { recordEvent } from "../../core/debugTimeline.js";
import {
  getBoard,
  opponentOf,
  setAnyAllyAttackedThisTurn,
  setAnyAllyAttackedLeaderThisTurn,
} from "../../core/playerHelpers.js";
import { isGameOver } from "../../core/gameOver.js";

// Imported from JS still
import { applyLeaderDamage } from "../effects/leader.js";
import { destroyTarget } from "../effects/ops/destroy/index.js";
import { cleanupDead, resumeDeferredDeathIfIdle } from "./cleanup.js";
import { dealDamage, enterDamageBatch, exitDamageBatch } from "./barrier.js";
import { doAction } from "../../core/history.js";
import { handleRestore } from "../effects/ops/restore/index.js";
import { isCantAttackLocked } from "./keywords/has.js";

/** Engine-level attack ownership / turn guard (mirrors playCardCore). */
export type AttackOutcome =
  | { kind: "done" }
  | { kind: "blocked"; reason: string };

function guardAttackerOwnership(
  attackerPlayer: Player,
  attackerIdx: number,
): AttackOutcome | null {
  if (isGameOver()) {
    return { kind: "blocked", reason: "Game over" };
  }
  if (state.activePlayer !== attackerPlayer) {
    return { kind: "blocked", reason: "Not your turn" };
  }
  const board = getBoard(state, attackerPlayer);
  const attacker = board[attackerIdx];
  if (!attacker || attacker.type !== "Follower") {
    return { kind: "blocked", reason: "Invalid attacker" };
  }
  return null;
}

/* ------------------------------- helpers ------------------------------- */

function hasActiveWardOn(board: CardInstance[]) {
  return board.some(
    (c) =>
      c &&
      c.type === "Follower" &&
      c.hasWard &&
      !c.hasAmbush &&
      !(c.keywordState?.hasIntimidate || (c as any).hasIntimidate),
  );
}

function attackerIgnoresWard(attacker?: CardInstance): boolean {
  return !!(attacker?.ignoresWard || attacker?.keywordState?.ignoresWard);
}

function canTargetFollower(
  defender: CardInstance,
  defenderBoard: CardInstance[],
  attacker?: CardInstance,
) {
  if (!defender || defender.type !== "Follower") return false;
  if (defender.hasAmbush) return false;
  if (defender.keywordState?.hasIntimidate || (defender as any).hasIntimidate)
    return false; // Check both for safety/migration
  if (
    !attackerIgnoresWard(attacker) &&
    hasActiveWardOn(defenderBoard) &&
    !defender.hasWard
  )
    return false;
  return true;
}

export function canAttackFollowerTarget(
  defender: CardInstance,
  defenderBoard: CardInstance[],
  attacker?: CardInstance,
): boolean {
  return canTargetFollower(defender, defenderBoard, attacker);
}

export function canAttackLeaderWhileWardActive(
  defenderBoard: CardInstance[],
  attacker?: CardInstance,
): boolean {
  return attackerIgnoresWard(attacker) || !hasActiveWardOn(defenderBoard);
}
function effectiveAtk(card: CardInstance) {
  return Math.max(0, parseInt(card?.attack as any, 10) || 0);
}

/* attack counter + flags */

function spendAttack(attacker: CardInstance) {
  if (attacker.attacks_left == null) {
    const per = Number.isFinite(attacker.attacks_per_turn)
      ? (attacker.attacks_per_turn as number)
      : 1;
    attacker.attacks_left = per;
  }

  // mark: someone attacked this turn (even if they die later)
  const ownerIsFirst = (getBoard(state, "first") || []).includes(attacker);
  setAnyAllyAttackedThisTurn(state, ownerIsFirst ? "first" : "second", true);

  attacker.attacks_used_this_turn = (attacker.attacks_used_this_turn ?? 0) + 1;
  const left = (attacker.attacks_left ?? 1) - 1;
  attacker.attacks_left = Math.max(0, left);
  attacker.hasAttacked = attacker.attacks_left <= 0;
}

function isAttackForbidden(card: CardInstance) {
  // Do NOT clear locks here — expiry is owned by turns/keywords EOT helpers.
  return isCantAttackLocked(card);
}

function recomputeAttackFlags(card: CardInstance) {
  const eligible = !!(card.hasStorm || !card.justPlayed || card.hasRush);
  const swingsLeft = ((card as any).attacks_left ?? 0) > 0;
  // Fix: Check isAttackForbidden
  const forbidden = isAttackForbidden(card);
  (card as any).can_attack = eligible && swingsLeft && !forbidden;
  card.isRush = !!(card.justPlayed && card.hasRush && !card.hasStorm);
}
function drainCombatResolutionQueue() {
  if (state.pendingTargetEffect) return;
  if ((state as any)._drainingResolutionQueue) return;
  resumeDeferredDeathIfIdle();
}

function finishCombatCleanup() {
  cleanupDead();
  drainCombatResolutionQueue();
}

function endCombatOnGameOver(attacker: CardInstance) {
  finishCombatCleanup();
  spendAttack(attacker);
  recomputeAttackFlags(attacker);
}

function stripAmbushOnSelfAttack(attacker: CardInstance) {
  if (attacker.hasAmbush) attacker.hasAmbush = false;
}

/** Check if a card currently has a trigger for a given event in a given zone (default: board). */
function hasCardTrigger(
  card: CardInstance,
  eventName: string,
  source = "board",
) {
  return (
    Array.isArray((card as any)?.triggers) &&
    (card as any).triggers.some(
      (t: any) => t.event === eventName && t.source === source,
    )
  );
}

function hasPiercingOne(attacker: CardInstance) {
  return attacker?.evoType === "super" || !!attacker.keywordState?.hasPiercing;
}

// =============================================================================
// COMBAT RESOLUTION SUB-FUNCTIONS
// Extracted for maintainability. Each handles one keyword's combat effect.
// =============================================================================

/**
 * Resolves Bane keyword effect after the combat damage step.
 *
 * Bible §346 / §443 / §477: any combat damage amount (including 0) destroys.
 * Call sites invoke this only after dealDamage in the damage exchange, so a
 * Bane follower whose attack was cancelled before the damage step never
 * reaches here (e.g. follower_strike removed the defender). The dealt amount
 * and barrier pop are irrelevant — Barrier does not save from Bane either.
 */
function resolveBane(
  source: CardInstance,
  target: CardInstance,
  targetOwner: Player,
): void {
  if (!source.hasBane) return;

  // Route through centralized destroy (respects cannotBeDestroyed & super-protect)
  destroyTarget(target, targetOwner, "bane");
  logEvent("baneDestroy", {
    killer: source.name,
    victim: target.name,
    killerUid: source.uid,
    victimUid: target.uid,
  });
}

/**
 * Resolves Drain keyword effect: restores leader HP based on damage dealt.
 * Routes through unified restore handler for consistency with JSON card effects.
 */
function resolveDrain(
  source: CardInstance,
  sourceOwner: Player,
  damageDealt: number,
): void {
  if (!source.hasDrain) return;
  if (damageDealt <= 0) return;

  // Route through unified restore handler with proper spec format
  // Same format as JSON: { op: "restore", target: "leader", player: "self", amount: X }
  const restored = handleRestore(
    { op: "restore", target: "leader", player: "self", amount: damageDealt },
    sourceOwner,
    [],
    { owner: sourceOwner, sourceCard: source },
  );

  if (restored > 0) {
    logEvent("drainRestore", {
      player: sourceOwner,
      amount: restored,
      source: source.name,
    });
  }
}

/**
 * Resolves Piercing keyword effect: pings enemy leader for 1 if target dies.
 */
function resolvePiercing(
  attacker: CardInstance,
  defender: CardInstance,
  defenderOwner: Player,
): void {
  if (!hasPiercingOne(attacker)) return;

  const defenderDef = parseInt(defender.defense as any) || 0;
  if (defenderDef > 0) return; // Defender survived, no piercing

  applyLeaderDamage(defenderOwner, 1);
  logEvent("piercingPing", {
    attacker: attacker.name,
    targetLeader: defenderOwner,
    amount: 1,
  });
}

function _attackFollowerCore(
  attackerIdx: number,
  defenderIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  const attackerBoard = getBoard(state, attackerPlayer);
  const defenderBoard = getBoard(state, defenderPlayer);

  const attacker = attackerBoard[attackerIdx];
  const defender = defenderBoard[defenderIdx];

  // Basic guards
  if (!attacker || !defender) return;
  if (attacker.type !== "Follower" || defender.type !== "Follower") return;
  if (
    !(attacker as any).can_attack ||
    ((attacker as any).attacks_left ?? 1) <= 0
  )
    return;
  if (isAttackForbidden(attacker)) return; // Checks keywordState inside
  if (!canTargetFollower(defender, defenderBoard, attacker)) return;

  // Ambush breaks on own attack
  stripAmbushOnSelfAttack(attacker);

  // ========================================================================
  // COMBAT TRIGGERS - Fire BEFORE damage (rulebook §228–232)
  // ========================================================================
  // 1. Attacker Strike/Clash in card-text order
  // 2. Defender Clash (queued even if attacker's Clash would kill)
  // 3. ally_follower_attacked / enemy_follower_attacked (C2 ordered path)
  // 4. Damage exchange (no cleanup between pre-damage triggers and damage)
  // ========================================================================

  state.suppressCleanup = true;
  fireAttackerCombatTriggers(attacker, attackerPlayer, { attacker, defender });
  fireDefenderClashTriggers(defender, defenderPlayer, { attacker, defender });
  fireTrigger("ally_follower_attacked", attackerPlayer, { attacker, defender });
  fireTrigger("enemy_follower_attacked", attackerPlayer, {
    attacker,
    defender,
  });
  state.suppressCleanup = false;

  // Strike / Clash may have dealt lethal — stop combat (bible §342).
  if (isGameOver()) {
    endCombatOnGameOver(attacker);
    return;
  }

  // Ensure swing counter exists
  if ((attacker as any).attacks_left == null) {
    (attacker as any).attacks_left = Number.isFinite(
      (attacker as any).attacks_per_turn,
    )
      ? (attacker as any).attacks_per_turn
      : 1;
  }

  // Normalize stats after pre-damage triggers
  attacker.attack = parseInt(attacker.attack as any) || 0;
  attacker.defense = parseInt(attacker.defense as any) || 0;
  defender.attack = parseInt(defender.attack as any) || 0;
  defender.defense = parseInt(defender.defense as any) || 0;

  const atkDmg = effectiveAtk(attacker);
  const defDmg = effectiveAtk(defender);

  // Follower Strike may have fired in card-text order above; if it removed the
  // defender before damage exchange, award piercing and end combat early.
  if (hasCardTrigger(attacker, "follower_strike", "board")) {
    // Rulebook L267: knockback before the destroyed follower's Last Words.
    // Use identity, not defenderIdx: cleanupDead() may splice bystanders and shift
    // indices while the combat target is still alive on the board.
    const stillThere = defenderBoard.includes(defender);
    const defenderDead =
      !stillThere || (parseInt(defender.defense as any, 10) || 0) <= 0;
    if (defenderDead) {
      if (hasPiercingOne(attacker)) {
        applyLeaderDamage(defenderPlayer, 1);
      }
      finishCombatCleanup();
      spendAttack(attacker);
      recomputeAttackFlags(attacker);
      return;
    }

    finishCombatCleanup();

    if (isGameOver()) {
      spendAttack(attacker);
      recomputeAttackFlags(attacker);
      return;
    }

    // Re-normalize in case effects changed stats
    attacker.attack = parseInt(attacker.attack as any) || 0;
    attacker.defense = parseInt(attacker.defense as any) || 0;
    defender.attack = parseInt(defender.attack as any) || 0;
    defender.defense = parseInt(defender.defense as any) || 0;
  }
  // For now, assuming UI filtered it.

  recordEvent({
    type: "attack",
    payload: { attacker: attacker.name, defender: defender.name },
  });

  attacker.hasAttacked = true;
  logEvent("attack", {
    attacker: attacker.name,
    defender: defender?.name,
    attackerUid: attacker.uid,
    defenderUid: defender?.uid,
    atkDmg,
    defDmg,
  });

  // --- Simultaneous damage exchange ---
  // Batch self_damaged from the 0-damage counter-hit so cleanupDead (Last Words)
  // does not run until after Drain and super-evo knockback (rulebook L267).
  let dealtToDef = 0;
  enterDamageBatch();
  try {
    const dmgResultDef = dealDamage(defender, atkDmg, attacker);
    dealtToDef = dmgResultDef.damage;

    // Resolve Bane for attacker (0 damage still counts — see resolveBane)
    resolveBane(attacker, defender, defenderPlayer);

    // Defender deals back. Always route through dealDamage so zeroed hits (super-evolve
    // protection, barrier) still emit self_damaged; prevention is handled inside.
    dealDamage(attacker, defDmg, defender);

    // Resolve Bane for defender (0 counter-damage still counts)
    resolveBane(defender, attacker, attackerPlayer);

    // Resolve Drain and Piercing before flushing deferred deaths / self_damaged
    resolveDrain(attacker, attackerPlayer, dealtToDef);
    resolvePiercing(attacker, defender, defenderPlayer);
  } finally {
    exitDamageBatch();
  }

  if (isGameOver()) {
    finishCombatCleanup();
    spendAttack(attacker);
    recomputeAttackFlags(attacker);
    return;
  }

  // Spend the swing, refresh flags, clean (render happens at UI layer)
  spendAttack(attacker);
  recomputeAttackFlags(attacker);
  finishCombatCleanup();
}

export function attackFollower(
  attackerIdx: number,
  defenderIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
): AttackOutcome {
  const blocked = guardAttackerOwnership(attackerPlayer, attackerIdx);
  if (blocked) return blocked;

  const meta = { attackerIdx, defenderIdx, attackerPlayer, defenderPlayer };
  doAction(
    "Attack Follower",
    () => {
      (state as any).combatResolutionDepth =
        ((state as any).combatResolutionDepth ?? 0) + 1;
      try {
        return _attackFollowerCore(
          attackerIdx,
          defenderIdx,
          attackerPlayer,
          defenderPlayer,
        );
      } finally {
        (state as any).combatResolutionDepth =
          ((state as any).combatResolutionDepth ?? 1) - 1;
      }
    },
    meta,
    { autoRender: true },
  );
  return { kind: "done" };
}

/* ----------------------------- follower -> leader ---------------------------- */

function _attackLeaderCore(
  attackerIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  // define first, then log
  const attackerBoard = getBoard(state, attackerPlayer);
  const defenderBoard = getBoard(state, defenderPlayer); // used for ward check
  const attacker = attackerBoard[attackerIdx];

  logEvent("attackLeader", {
    attacker: attacker?.name,
    attackerUid: attacker?.uid,
    attackerPlayer,
  });

  if (!attacker || attacker.type !== "Follower") return;

  // Rush can't hit leader on play turn
  if (attacker.hasRush && attacker.justPlayed && !attacker.hasStorm) return;

  if (
    !(attacker as any).can_attack ||
    ((attacker as any).attacks_left ?? 1) <= 0
  )
    return;
  if (isAttackForbidden(attacker)) return;
  if (!attackerIgnoresWard(attacker) && hasActiveWardOn(defenderBoard)) return;

  stripAmbushOnSelfAttack(attacker);
  setAnyAllyAttackedLeaderThisTurn(state, attackerPlayer, true);

  if ((attacker as any).attacks_left == null) {
    (attacker as any).attacks_left = Number.isFinite(
      (attacker as any).attacks_per_turn,
    )
      ? (attacker as any).attacks_per_turn
      : 1;
  }

  // ========================================================================
  // COMBAT TRIGGERS - Fire BEFORE damage (leader attack)
  // ========================================================================

  // Strike: Fires when attacking ANYTHING (follower or leader)
  fireTrigger("strike", attackerPlayer, { attacker });

  // Leader Strike: Fires ONLY when attacking the leader (not followers)
  fireTrigger("leader_strike", attackerPlayer, { attacker });

  if (isGameOver()) {
    endCombatOnGameOver(attacker);
    return;
  }

  attacker.attack = parseInt(attacker.attack as any) || 0;
  attacker.defense = parseInt(attacker.defense as any) || 0;

  // Fire generic defender trigger (pre-damage)
  // Synchronous execution ensures any debuffs (e.g. Lu Woh) apply before effectiveAtk()
  fireTrigger("leader_attacked", defenderPlayer, { attacker });

  if (isGameOver()) {
    endCombatOnGameOver(attacker);
    return;
  }

  const damage = effectiveAtk(attacker);
  applyLeaderDamage(defenderPlayer, damage);

  if (isGameOver()) {
    endCombatOnGameOver(attacker);
    return;
  }

  if ((attacker as any).hasDrain && damage > 0 && !isGameOver()) {
    // Route through unified restore handler with proper spec format
    const restored = handleRestore(
      { op: "restore", target: "leader", player: "self", amount: damage },
      attackerPlayer,
      [],
      { owner: attackerPlayer, sourceCard: attacker },
    );
    if (restored > 0) {
      logEvent("drainRestore", {
        player: attackerPlayer,
        amount: restored,
        source: attacker.name,
        sourceUid: attacker.uid,
      });
    }
  }

  spendAttack(attacker);
  recomputeAttackFlags(attacker);
  finishCombatCleanup();
}

export function attackLeader(
  attackerIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
): AttackOutcome {
  const blocked = guardAttackerOwnership(attackerPlayer, attackerIdx);
  if (blocked) return blocked;

  const meta = { attackerIdx, attackerPlayer, defenderPlayer };
  doAction(
    "Attack Leader",
    () => {
      (state as any).combatResolutionDepth =
        ((state as any).combatResolutionDepth ?? 0) + 1;
      try {
        return _attackLeaderCore(attackerIdx, attackerPlayer, defenderPlayer);
      } finally {
        (state as any).combatResolutionDepth =
          ((state as any).combatResolutionDepth ?? 1) - 1;
      }
    },
    meta,
    { autoRender: true },
  );
  return { kind: "done" };
}

/* ------------------------------ drag-drop hook ------------------------------ */
export function handleDropOnLeader(
  attackerIdx: number,
  attackerPlayer: Player,
) {
  return attackLeader(attackerIdx, attackerPlayer, opponentOf(attackerPlayer));
}
