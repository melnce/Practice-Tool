// /gamelogic/barrier.js
import { state } from "@core/gameState.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { logEvent } from "@core/logger.js";


export function grantBarrier(card, charges = 1) {
  card.barrierCharges = (card.barrierCharges || 0) + charges;
  card.hasBarrier = card.barrierCharges > 0;
}

function consumeBarrier(card) {
  if ((card.barrierCharges || 0) > 0) {
    card.barrierCharges--;
    if (card.barrierCharges <= 0) card.hasBarrier = false;
    card.__uiPopBarrier = true; // optional UI flag
    return true;
  }
  return false;
}

// NEW: allow forced pop even if damage is 0 / prevented
export function popBarrier(card, reason = "forced_pop") {
  if (!card || !card.hasBarrier) return false;
  // optional: telemetry
  card.__barrierPopReason = reason;
  return consumeBarrier(card);
}

export function dealDamage(target, amount, source = null) {
  if (!target) return 0;

  const initialDefense = parseInt(target.defense) || 0;
  let damageDealt = amount;
  let preventedBySuper = false;

  // Handle barrier if present
  let barrierConsumed = false;
  if (target.hasBarrier) {
    const used = consumeBarrier(target);
    if (used) { barrierConsumed = true; damageDealt = 0; target.__uiFlashBarrier = true; }
  }

  // Super-evolve: on its owner's turn, damage is reduced to 0,
  // but it STILL counts as an attempted hit (for triggers, barrier, bane rules, etc.).
  try {
    const isBlue = (state.blueBoard || []).includes(target);
    const owner  = isBlue ? "blue" : ((state.redBoard || []).includes(target) ? "red" : null);
    if (owner && state.activePlayer === owner && target?.evoType === "super") {
      // Only *reduce* the damage; don't undo a barrier pop that already happened.
      if (amount > 0) {
        damageDealt = 0;
        preventedBySuper = true;
        target.__uiSuperZero = true; // optional UI flag
      }
    }
  } catch (_) {}

  // Apply remaining damage
  const newDefense = Math.max(0, initialDefense - damageDealt);
  target.defense = newDefense;

  logEvent("damage", {
    target: target?.name,
    targetUid: target?.uid,
    amountTried: amount,
    dealt: Math.max(0, damageDealt|0),
    barrierPopped: !!barrierConsumed,
    preventedBySuper
  });

  if (damageDealt > 0) {
    target.base_defense = target.base_defense || initialDefense;
    // Ensure potential_defense exists and represents full health
    if (target.potential_defense == null) {
      target.potential_defense = initialDefense;
    }
    // Set damaged state by comparing current defense with potential (full health)
    target.isDamaged = newDefense < target.potential_defense;
    target.peak_defense = Math.max(target.peak_defense || initialDefense, initialDefense);
  }
  
  // Count as “took damage” if real damage, barrier blocked, explicit 0-hit,
  // OR it was zeroed by super-evolve protection this turn.
  const countsAsDamaged = (damageDealt > 0) || barrierConsumed || (amount === 0) || preventedBySuper;
  if (countsAsDamaged && target?.type === "Follower" && target.defense > 0) {
    const owner =
      state.blueBoard.includes(target) ? "blue" :
      state.redBoard.includes(target)  ? "red"  : null;
    if (owner && state.activePlayer === owner) {
      fireTrigger("self_damaged", owner, { damagedCard: target, sourceCard: source });
    }
  }
  return Math.max(0, damageDealt|0);
}


// Add this new function to handle buffs properly
export function applyBuff(card, attackBuff, defenseBuff) {
  const atk = parseInt(card.attack) || 0;
  const def = parseInt(card.defense) || 0;
  
  // Update base stats if this is the first buff
  if (!card.base_attack) card.base_attack = atk;
  if (!card.base_defense) card.base_defense = def;
  
  // Apply buffs
  card.attack = atk + (parseInt(attackBuff) || 0);
  card.defense = def + (parseInt(defenseBuff) || 0);
  
  // Update potential stats
  card.potential_attack = (card.potential_attack || card.base_attack) + (parseInt(attackBuff) || 0);
  card.potential_defense = (card.potential_defense || card.base_defense) + (parseInt(defenseBuff) || 0);
  
  // Re-check damaged state
  card.isDamaged = card.defense < card.potential_defense;
  
  // Update peak stats
  card.peak_attack = Math.max(card.peak_attack || atk, card.attack);
  card.peak_defense = Math.max(card.peak_defense || def, card.defense);
}

export function setPotentialFromBasePlus(card, atkDelta = 0, defDelta = 0) {
  // Seed base_* if not present (pre-buff printed stats)
  if (card.base_attack == null)  card.base_attack  = (parseInt(card.attack, 10)  || 0) - atkDelta;
  if (card.base_defense == null) card.base_defense = (parseInt(card.defense, 10) || 0) - defDelta;

  const fullAtk = (card.base_attack  || 0) + atkDelta;
  const fullDef = (card.base_defense || 0) + defDelta;

  // Only raise potential_*; never decrease it here
  card.potential_attack  = Math.max(card.potential_attack  ?? 0, fullAtk);
  card.potential_defense = Math.max(card.potential_defense ?? 0, fullDef);

  // Keep the damaged flag consistent for the renderer
  card.isDamaged = (parseInt(card.defense, 10) || 0) < card.potential_defense;
}
