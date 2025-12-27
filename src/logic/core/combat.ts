// src/logic/core/combat.ts
import type { CardInstance, Player } from "../../core/types/index.js";
import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";

import { fireTrigger } from "./triggers.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { getBoard, opponentOf, setHP, getHP, setAnyAllyAttackedThisTurn } from "../../core/playerHelpers.js";

// Imported from JS still
import { applyLeaderDamage } from "../effects/leader.js";
import { destroyTarget } from "../effects/ops/destroy/index.js";
import { cleanupDead } from "./cleanup.js";
import { dealDamage, popBarrier } from "./barrier.js";
import { doAction } from "../../core/history.js";
import { handleRestore } from "../effects/ops/restore/index.js";

/* ------------------------------- helpers ------------------------------- */

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

// =============================================================================
// COMBAT RESOLUTION SUB-FUNCTIONS
// Extracted for maintainability. Each handles one keyword's combat effect.
// =============================================================================

/**
 * Resolves Bane keyword effect: destroys target if damage was dealt or barrier popped.
 */
function resolveBane(
  source: CardInstance,
  target: CardInstance,
  targetOwner: Player,
  damageDealt: number,
  barrierPopped: boolean,
): void {
  if (!source.hasBane) return;
  if (damageDealt <= 0 && !barrierPopped) return;

  // Route through centralized destroy (respects cannotBeDestroyed & super-protect)
  destroyTarget(target, targetOwner, "bane");
  logEvent("baneDestroy", { killer: source.name, victim: target.name });
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

  const currentHP = getHP(state, defenderOwner);
  setHP(state, defenderOwner, Math.max(0, currentHP - 1));
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
  if (!canTargetFollower(defender, defenderBoard)) return;

  // Ambush breaks on own attack
  stripAmbushOnSelfAttack(attacker);

  // ========================================================================
  // COMBAT TRIGGERS - Fire BEFORE damage
  // ========================================================================
  // Combat triggers fire in this sequence:
  // 1. Clash (both parties, simultaneously - neither dies until both resolve)
  // 2. Strike (attacker only)
  // 3. Follower Strike (if applicable, attacker only)
  // 4. Damage exchange
  // ========================================================================

  // Clash: Fires for BOTH parties in follower combat
  // SEMANTICS: Both Clash triggers fire "simultaneously" - if attacker's Clash
  // would kill the defender, defender's Clash still fires before cleanup.
  // This ensures fair resolution when both combatants have Clash.
  state.suppressCleanup = true; // Defer deaths until both Clash triggers resolve
  fireTrigger("clash", attackerPlayer, { attacker, defender });
  fireTrigger("clash", defenderPlayer, { attacker, defender });
  state.suppressCleanup = false;
  cleanupDead(); // Now process any deaths from Clash effects

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

  // Resolve Bane for attacker
  resolveBane(attacker, defender, defenderPlayer, dealtToDef, dmgResultDef.barrierPopped);

  // Defender deals back, unless attacker is invincible on attack this swing
  if (!isInvincibleOnAttack(attacker)) {
    const dmgResultAtk = dealDamage(attacker, defDmg, defender);
    dealtToAtk = dmgResultAtk.damage;

    // Resolve Bane for defender
    resolveBane(defender, attacker, attackerPlayer, dealtToAtk, dmgResultAtk.barrierPopped);
  } else if (
    attacker.keywordState?.hasBarrier ||
    (attacker as any).hasBarrier
  ) {
    popBarrier(attacker, "invincible_simul_zero");
  }

  // Resolve Drain and Piercing
  resolveDrain(attacker, attackerPlayer, dealtToDef);
  resolvePiercing(attacker, defender, defenderPlayer);

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
    { autoRender: true },
  );
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
      });
    }
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
    { autoRender: true },
  );
}

/* ------------------------------ drag-drop hook ------------------------------ */
export function handleDropOnLeader(
  attackerIdx: number,
  attackerPlayer: Player,
) {
  return attackLeader(attackerIdx, attackerPlayer, opponentOf(attackerPlayer));
}















