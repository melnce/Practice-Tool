// /gamelogic/barrier.ts
import { state } from "../../core/gameState.js";
import { fireTrigger } from "./triggers.js";
import { logEvent } from "../../core/logger.js";
import { CardInstance, Player } from "../../core/types/index.js";
import { getBoard, toSlot } from "../../core/playerHelpers.js";

// Helper interface for card with barrier properties
interface BarrierCard extends CardInstance {
  hasBarrier?: boolean;
  __uiPopBarrier?: boolean;
  __uiFlashBarrier?: boolean;
  __barrierPopReason?: string;
  __uiSuperZero?: boolean;
  isDamaged?: boolean;
  potential_defense?: number;
  potential_attack?: number;
  peak_attack?: number;
  peak_defense?: number;
}

export function grantBarrier(card: BarrierCard) {
  card.hasBarrier = true;
}

function consumeBarrier(card: BarrierCard) {
  if (card.hasBarrier) {
    card.hasBarrier = false;
    card.__uiPopBarrier = true; // optional UI flag
    return true;
  }
  return false;
}

// NEW: allow forced pop even if damage is 0 / prevented
export function popBarrier(card: BarrierCard, reason = "forced_pop") {
  if (!card || !card.hasBarrier) return false;
  // optional: telemetry
  card.__barrierPopReason = reason;
  return consumeBarrier(card);
}

export function dealDamage(
  target: BarrierCard,
  amount: number,
  source: CardInstance | null = null,
) {
  if (!target)
    return { damage: 0, barrierPopped: false, preventedBySuper: false };

  const initialDefense = parseInt(target.defense as string) || 0;
  let damageDealt = amount;
  let preventedBySuper = false;

  // Handle barrier if present
  let barrierConsumed = false;
  if (target.hasBarrier) {
    const used = consumeBarrier(target);
    if (used) {
      barrierConsumed = true;
      damageDealt = 0;
      target.__uiFlashBarrier = true;
    }
  }

  // Super-evolve: on its owner's turn, damage is reduced to 0,
  // but it STILL counts as an attempted hit (for triggers, barrier, bane rules, etc.).
  try {
    // --- Max Damage Cap Check ---
    const cap = target.keywordState?.maxDamageCap;
    if (cap !== undefined && cap > 0 && damageDealt > cap) {
      console.log(
        `[Damage] Capped damage on ${target.name} from ${damageDealt} to ${cap}`,
      );
      damageDealt = cap;
    }

    const firstBoard = getBoard(state, "first");
    const secondBoard = getBoard(state, "second");
    const isFirst = (firstBoard || []).includes(target);
    const owner: Player | null = isFirst
      ? "first"
      : (secondBoard || []).includes(target)
        ? "second"
        : null;

    // Use typed activePlayer from GameState
    const currentActive = state.activePlayer;

    if (owner && toSlot(currentActive) === toSlot(owner) && target?.evoType === "super") {
      // Only *reduce* the damage; don't undo a barrier pop that already happened.
      if (amount > 0) {
        damageDealt = 0;
        preventedBySuper = true;
        target.__uiSuperZero = true; // optional UI flag
      }
    }
  } catch (e) {
    console.error("[dealDamage] Error in super-evolve protection check:", e);
  }

  // Apply remaining damage
  const newDefense = Math.max(0, initialDefense - damageDealt);
  target.defense = newDefense;

  logEvent("damage", {
    target: target?.name,
    targetUid: target?.uid,
    amountTried: amount,
    dealt: Math.max(0, damageDealt | 0),
    barrierPopped: !!barrierConsumed,
    preventedBySuper,
  });

  if (damageDealt > 0) {
    target.base_defense = target.base_defense || initialDefense;
    // Ensure potential_defense exists and represents full health
    if (target.potential_defense == null) {
      target.potential_defense = initialDefense;
    }
    // Set damaged state by comparing current defense with potential (full health)
    target.isDamaged = newDefense < target.potential_defense;
    target.peak_defense = Math.max(
      target.peak_defense || initialDefense,
      initialDefense,
    );
  }

  // Count as “took damage” if real damage, barrier blocked, explicit 0-hit,
  // OR it was zeroed by super-evolve protection this turn.
  const countsAsDamaged =
    damageDealt > 0 || barrierConsumed || amount === 0 || preventedBySuper;
  if (
    countsAsDamaged &&
    target?.type === "Follower" &&
    (target.defense as number) > 0
  ) {
    const firstBoard = getBoard(state, "first");
    const secondBoard = getBoard(state, "second");
    const owner = firstBoard.includes(target)
      ? "first"
      : secondBoard.includes(target)
        ? "second"
        : null;

    if (owner && toSlot(state.activePlayer) === toSlot(owner)) {
      fireTrigger("self_damaged", owner, {
        damagedCard: target,
        sourceCard: source,
      });
    }
  }
  return {
    damage: Math.max(0, damageDealt | 0),
    barrierPopped: !!barrierConsumed,
    preventedBySuper,
  };
}

// Add this new function to handle buffs properly
export function applyBuff(
  card: BarrierCard,
  attackBuff: number | string,
  defenseBuff: number | string,
) {
  const atk = parseInt(card.attack as string) || 0;
  const def = parseInt(card.defense as string) || 0;

  // Update base stats if this is the first buff
  if (!card.base_attack) card.base_attack = atk;
  if (!card.base_defense) card.base_defense = def;

  // Apply buffs
  card.attack = atk + (parseInt(attackBuff as string) || 0);
  card.defense = def + (parseInt(defenseBuff as string) || 0);

  // Update potential stats
  card.potential_attack =
    (card.potential_attack || (card.base_attack as number)) +
    (parseInt(attackBuff as string) || 0);
  card.potential_defense =
    (card.potential_defense || (card.base_defense as number)) +
    (parseInt(defenseBuff as string) || 0);

  // Re-check damaged state
  card.isDamaged =
    (card.defense as number) < (card.potential_defense as number);

  // Update peak stats
  card.peak_attack = Math.max(card.peak_attack || atk, card.attack as number);
  card.peak_defense = Math.max(
    card.peak_defense || def,
    card.defense as number,
  );
}

export function setPotentialFromBasePlus(
  card: BarrierCard,
  atkDelta = 0,
  defDelta = 0,
) {
  // Seed base_* if not present (pre-buff printed stats)
  if (card.base_attack == null)
    card.base_attack = (parseInt(card.attack as string, 10) || 0) - atkDelta;
  if (card.base_defense == null)
    card.base_defense = (parseInt(card.defense as string, 10) || 0) - defDelta;

  const fullAtk = ((card.base_attack as number) || 0) + atkDelta;
  const fullDef = ((card.base_defense as number) || 0) + defDelta;

  // Only raise potential_*; never decrease it here
  card.potential_attack = Math.max(card.potential_attack ?? 0, fullAtk);
  card.potential_defense = Math.max(card.potential_defense ?? 0, fullDef);

  // Keep the damaged flag consistent for the renderer
  card.isDamaged =
    (parseInt(card.defense as string, 10) || 0) < card.potential_defense;
}















