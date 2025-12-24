// src/logic/core/combat.ts
import { CardInstance, Player } from "../../core/types.js";
import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";

import { fireTrigger } from "./triggers.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { getBoard, opponentOf, setHP, getHP, setAnyAllyAttackedThisTurn } from "../../core/playerHelpers.js";

// Imported from JS still
import { applyLeaderDamage, handleHealLeader } from "../effects/leader.js";
import { destroyTarget } from "../effects/ops/destroy/index.js";
import { cleanupDead } from "./cleanup.js";
import { dealDamage, popBarrier } from "./barrier.js";
import { doAction } from "../../core/history.js";

/* ------------------------------- helpers ------------------------------- */

/**
 * Get the board for a player.
 * @deprecated Use getBoard from playerHelpers
 */
function boardFor(player: Player): CardInstance[] {
  return getBoard(state, player);
}

/**
 * @deprecated Use opponentOf from playerHelpers
 */
function enemyOf(player: Player): Player {
  return opponentOf(player);
}
function hasWardOn(board: CardInstance[]) {
  return board.some((c) => c && c.type === "Follower" && c.hasWard);
}
function canTargetFollower(
  defender: CardInstance,
  defenderBoard: CardInstance[],
) {
  if (!defender || defender.type !== "Follower") return false;
  if (defender.hasAmbush) return false;
  if (defender.keywordState?.hasIntimidate || (defender as any).hasIntimidate)
    return false; // Check both for safety/migration
  if (hasWardOn(defenderBoard) && !defender.hasWard) return false;
  return true;
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
  if (!card) return false;
  const ks = card.keywordState;
  // Fix: Do NOT clear it here.
  // Clearing happens in turns.ts at End of Turn.
  // Clearing here causes it to vanish the moment the owner tries to attack.
  return !!(ks?.cantAttack || ks?.cantAttackFollowers || ks?.cantAttackLeaders);
}

function recomputeAttackFlags(card: CardInstance) {
  const eligible = !!(card.hasStorm || !card.justPlayed || card.hasRush);
  const swingsLeft = ((card as any).attacks_left ?? 0) > 0;
  // Fix: Check isAttackForbidden
  const forbidden = isAttackForbidden(card);
  (card as any).can_attack = eligible && swingsLeft && !forbidden;
  card.isRush = !!(card.justPlayed && card.hasRush && !card.hasStorm);
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

/* ------------------------ superevolve convenience checks ------------------------ */
function isInvincibleOnAttack(attacker: CardInstance) {
  return (
    attacker?.evoType === "super" ||
    !!attacker.keywordState?.isInvincibleOnAttack
  );
}
function hasPiercingOne(attacker: CardInstance) {
  return attacker?.evoType === "super" || !!attacker.keywordState?.hasPiercing;
}

/* --------------------------- follower vs follower --------------------------- */

function _attackFollowerCore(
  attackerIdx: number,
  defenderIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  const attackerBoard = boardFor(attackerPlayer);
  const defenderBoard = boardFor(defenderPlayer);

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
  if (!canTargetFollower(defender, defenderBoard)) return;

  // Ambush breaks on own attack
  stripAmbushOnSelfAttack(attacker);

  // ========================================================================
  // COMBAT TRIGGERS - Fire BEFORE damage
  // ========================================================================

  // Clash: Fires for BOTH parties in follower combat
  // Only cards with "event": "clash" triggers will actually fire
  fireTrigger("clash", attackerPlayer, { attacker, defender });
  fireTrigger("clash", defenderPlayer, { attacker, defender });

  // Strike: Fires when attacking ANYTHING (follower or leader)
  fireTrigger("strike", attackerPlayer, { attacker, defender });

  // Follower Strike: Fires ONLY when attacking a follower (not leader)
  // Note: Already gated by hasCardTrigger check below for efficiency

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

  const attackerHasBane = !!attacker.hasBane;
  const defenderHasBane = !!defender.hasBane;
  const attackerHasDrain = !!attacker.hasDrain;
  /* const defenderHasDrain = !!defender.hasDrain; */ // unused variable

  // Follower Strike: Fires ONLY when attacking a follower (before damage)
  if (hasCardTrigger(attacker, "follower_strike", "board")) {
    fireTrigger("follower_strike", attackerPlayer, { attacker, defender });

    // IMMEDIATE CLEANUP so 0-DEF units vanish before damage exchange
    cleanupDead();

    // If the defender was removed or died due to follower_strike, award piercing now.
    const stillThere = defenderBoard[defenderIdx];
    if (
      !stillThere ||
      stillThere !== defender ||
      (defender.defense as any) <= 0
    ) {
      if (hasPiercingOne(attacker)) {
        const currentHP = getHP(state, defenderPlayer);
        setHP(state, defenderPlayer, Math.max(0, currentHP - 1));
      }
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
    atkDmg,
    defDmg,
  });

  // --- Simultaneous damage exchange ---
  let dealtToDef = 0;
  let dealtToAtk = 0;

  // Attacker deals damage to defender
  const dmgResultDef = dealDamage(defender, atkDmg, attacker);
  dealtToDef = dmgResultDef.damage;

  // Bane triggers if damage was dealt OR a barrier was popped (which means it "hit")
  if (attackerHasBane && (dealtToDef > 0 || dmgResultDef.barrierPopped)) {
    // Route through centralized destroy (respects cannotBeDestroyed & super-protect)
    destroyTarget(defender, defenderPlayer, "bane");
    logEvent("baneDestroy", { killer: attacker.name, victim: defender.name });
  }

  // Defender deals back, unless attacker is invincible on attack this swing
  if (!isInvincibleOnAttack(attacker)) {
    const dmgResultAtk = dealDamage(attacker, defDmg, defender);
    dealtToAtk = dmgResultAtk.damage;

    if (defenderHasBane && (dealtToAtk > 0 || dmgResultAtk.barrierPopped)) {
      destroyTarget(attacker, attackerPlayer, "bane");
      logEvent("baneDestroy", { killer: defender.name, victim: attacker.name });
    }
  } else if (
    attacker.keywordState?.hasBarrier ||
    (attacker as any).hasBarrier
  ) {
    popBarrier(attacker, "invincible_simul_zero");
  }

  // Drain (leaders heal based on actual damage dealt)
  if (attackerHasDrain && dealtToDef > 0) {
    handleHealLeader(attackerPlayer, { op: "heal", amount: dealtToDef } as any);
    logEvent("drainHeal", {
      player: attackerPlayer,
      amount: dealtToDef,
      source: attacker.name,
    });
  }

  // --- Piercing: if defender will die from this exchange, ping enemy leader for 1 ---
  if (
    hasPiercingOne(attacker) &&
    (parseInt(defender.defense as any) || 0) <= 0
  ) {
    const currentHP = getHP(state, defenderPlayer);
    setHP(state, defenderPlayer, Math.max(0, currentHP - 1));
    logEvent("piercingPing", {
      attacker: attacker.name,
      targetLeader: defenderPlayer,
      amount: 1,
    });
  }

  // Spend the swing, refresh flags, clean (render happens at UI layer)
  spendAttack(attacker);
  recomputeAttackFlags(attacker);
  cleanupDead();
}

export function attackFollower(
  attackerIdx: number,
  defenderIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  const meta = { attackerIdx, defenderIdx, attackerPlayer, defenderPlayer };
  return doAction(
    "Attack Follower",
    () =>
      _attackFollowerCore(
        attackerIdx,
        defenderIdx,
        attackerPlayer,
        defenderPlayer,
      ),
    meta,
    { autoRender: false },
  );
}

/* ----------------------------- follower -> leader ---------------------------- */

function _attackLeaderCore(
  attackerIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  // define first, then log
  const attackerBoard = boardFor(attackerPlayer);
  const defenderBoard = boardFor(defenderPlayer); // used for ward check
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
  if (hasWardOn(defenderBoard)) return;

  stripAmbushOnSelfAttack(attacker);

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

  attacker.attack = parseInt(attacker.attack as any) || 0;
  attacker.defense = parseInt(attacker.defense as any) || 0;

  // Fire generic defender trigger (pre-damage)
  // Synchronous execution ensures any debuffs (e.g. Lu Woh) apply before effectiveAtk()
  fireTrigger("leader_attacked", defenderPlayer, { attacker });

  const damage = effectiveAtk(attacker);
  applyLeaderDamage(defenderPlayer, damage);

  if ((attacker as any).hasDrain && damage > 0) {
    handleHealLeader(attackerPlayer, { op: "heal", amount: damage } as any);
    logEvent("drainHeal", {
      player: attackerPlayer,
      amount: damage,
      source: attacker.name,
    });
  }

  spendAttack(attacker);
  recomputeAttackFlags(attacker);
  // Render removed - happens at UI layer
}

export function attackLeader(
  attackerIdx: number,
  attackerPlayer: Player,
  defenderPlayer: Player,
) {
  const meta = { attackerIdx, attackerPlayer, defenderPlayer };
  return doAction(
    "Attack Leader",
    () => _attackLeaderCore(attackerIdx, attackerPlayer, defenderPlayer),
    meta,
    { autoRender: false },
  );
}

/* ------------------------------ drag-drop hook ------------------------------ */
export function handleDropOnLeader(
  attackerIdx: number,
  attackerPlayer: Player,
) {
  return attackLeader(attackerIdx, attackerPlayer, enemyOf(attackerPlayer));
}















