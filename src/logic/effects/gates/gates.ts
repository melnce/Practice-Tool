// src/logic/effects/gates/gates.ts
import { state } from "../../../core/gameState.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { logEvent } from "../../../core/logger.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../core/types/index.js";
import {
  isFirstPlayer,
  getBoard,
  getDeck,
  getRally,
  getMaxPP,
  getAnyAllyAttackedThisTurn,
} from "../../../core/playerHelpers.js";
import { meetsSkyboundArtThreshold } from "../skybound.js";

export function handleOverflowGate(owner: Player) {
  return isOverflow(owner);
}

export function handleSkyboundArtGate(
  _owner: string,
  eff: any,
  sourceCard: any,
) {
  const req = parseInt(eff.requirement || eff.count || 10, 10);
  return meetsSkyboundArtThreshold(sourceCard, req);
}

export function handleNecromancyGate(owner: Player, eff: any) {
  const need = Math.max(1, parseInt(String(eff.cost ?? 1)) || 1);
  if (hasNecromancy(owner, need)) {
    spendShadows(owner, need);
    logEvent("necromancySpend", { owner, cost: need });
    return true;
  }
  logEvent("necromancyBlocked", { owner, need });
  return false;
}

export function handleSuperEvoGate(owner: Player) {
  // Check if super evolution is unlocked for this player
  // First player unlocks at round 7, second at round 6
  return isFirstPlayer(owner) ? state.roundCount >= 7 : state.roundCount >= 6;
}

export function handleEvolvedSelfGate(
  eff: Effect,
  owner: string,
  sourceCard: CardInstance,
  effectsQueue: Effect[],
) {
  const isEvolved = !!(sourceCard && sourceCard.hasEvolved);
  const next = (isEvolved ? eff.effects : eff.else_effects) || [];
  if (next.length && Array.isArray(effectsQueue)) {
    effectsQueue.unshift(...next);
  }
  logEvent("gateBranch", {
    gate: "evolved_self",
    branch: isEvolved ? "effects" : "else_effects",
  });
  return "done";
}

export function amuletCountGate(owner: Player, eff: any) {
  const need = parseInt(eff.count ?? 0);
  const board = getBoard(state, owner);
  const amuletCount = (board || []).filter((c) => c.type === "Amulet").length;
  return amuletCount >= need;
}

/**
 * Checks if the owner's deck has no duplicate cards by name.
 * This is often called a "Highlander" condition.
 */
export function hasNoDuplicatesInDeck(owner: Player) {
  const deck = getDeck(state, owner);
  if (!deck || deck.length <= 1) {
    return true; // An empty or single-card deck has no duplicates.
  }

  const seenNames = new Set();
  for (const card of deck) {
    if (seenNames.has(card.name)) {
      logEvent("highlanderCheck", { owner, result: "fail", name: card.name });
      return false; // Found a duplicate, condition fails.
    }
    seenNames.add(card.name);
  }

  logEvent("highlanderCheck", { owner, result: "pass" });
  return true; // No duplicates found after checking the whole deck.
}

export function noAllyAttackedThisTurn(owner: Player) {
  // hard truth first: if anyone on this side attacked, block immediately
  if (getAnyAllyAttackedThisTurn(state, owner)) {
    return false;
  }
  const board = getBoard(state, owner);

  // A follower is considered to have attacked this turn if ANY of these are true:
  // - attacks_used_this_turn > 0
  // - hasAttacked === true (legacy/UI flag used by your combat)
  // - attacks_left < attacks_per_turn (covers multi-attack, even if counter not updated elsewhere)
  return !(board || []).some((c) => {
    if (!c || c.type !== "Follower") return false;

    const used = (c.attacks_used_this_turn ?? 0) > 0;
    const legacy = !!c.hasAttacked;

    const perTurn = Number.isFinite(c.attacks_per_turn)
      ? c.attacks_per_turn!
      : 1;
    const left = Number.isFinite(c.attacks_left) ? c.attacks_left! : perTurn;
    const spent = left < perTurn;

    return used || legacy || spent;
  });
}

// --- Logic Moved from effects.ts ---

export function handleBoardNameGate(
  owner: Player,
  eff: Effect,
  effectsQueue: Effect[],
) {
  const want = String(eff.name || (eff as any).card_name || "").trim();
  if (!want) return;
  const myBoard = getBoard(state, owner);
  const found = (myBoard || []).some((c) => String(c?.name) === want);
  if (found) {
    if (Array.isArray(eff.effects)) effectsQueue.unshift(...eff.effects!);
  } else if (Array.isArray(eff.else_effects)) {
    effectsQueue.unshift(...eff.else_effects);
  }
}

export function handleBothMaxPPGate(eff: Effect, effectsQueue: Effect[]) {
  const need = Number.isFinite((eff as any).at_least)
    ? (eff as any).at_least
    : 10;
  const ok =
    getMaxPP(state, "first") >= need && getMaxPP(state, "second") >= need;
  const next = ok ? eff.effects || [] : eff.else_effects || [];
  if (next.length) {
    if (Array.isArray(effectsQueue)) {
      effectsQueue.unshift(...next);
    } else {
      console.error(
        "[Dispatcher] Error in op 'both_max_pp_gate': effectsQueue is not an array",
        effectsQueue,
      );
    }
  }
}

export function handleMaxPPGate(
  owner: Player,
  eff: Effect,
  effectsQueue: Effect[],
) {
  const need = Number.isFinite((eff as any).at_least)
    ? (eff as any).at_least
    : 10;
  const currentMax = getMaxPP(state, owner);
  const ok = currentMax >= need;
  const next = ok ? eff.effects || [] : eff.else_effects || [];
  if (next.length) effectsQueue.unshift(...next);
}

export function handleRallyGate(
  owner: Player,
  eff: any,
  effectsQueue: Effect[],
) {
  const need = parseInt(eff.count ?? 0);
  const ownerRally = getRally(state, owner);
  if (ownerRally >= need) {
    effectsQueue.unshift(...(eff.effects || []));
  } else if (eff.else_effects) {
    effectsQueue.unshift(...eff.else_effects);
  }
}

function getEffectiveCost(card: CardInstance) {
  if (Number.isFinite(card.effectiveCost)) return card.effectiveCost;
  const base = parseInt(card?.cost as string, 10) || 0;
  const mod = parseInt((card as any)?.cost_mod, 10) || 0;
  return base + mod;
}

export function handleSelfCostGate(
  sourceCard: CardInstance,
  eff: any,
  effectsQueue: Effect[],
) {
  if (!sourceCard) return;
  const effCost = getEffectiveCost(sourceCard);
  const targetCost = parseInt(eff.cost);
  const pass = effCost === targetCost;
  const next = pass ? eff.effects || [] : eff.else_effects || [];
  if (next.length) effectsQueue.unshift(...next);
}

export function handleSuperEvolvedAlliedGate(
  owner: Player,
  eff: Effect,
  effectsQueue: Effect[],
) {
  const board = getBoard(state, owner);
  const hasSuper = board.some(
    (c) => c.type === "Follower" && c.evoType === "super",
  );
  const next = (hasSuper ? eff.effects : eff.else_effects) || [];
  if (next.length) effectsQueue.unshift(...next);
}

export function handleEvolvedAlliedGate(
  owner: Player,
  eff: Effect,
  effectsQueue: Effect[],
) {
  const board = getBoard(state, owner);
  const hasEvolved = board.some(
    (c) => c.type === "Follower" && (c.hasEvolved || c.evoType === "super"),
  );
  const next = (hasEvolved ? eff.effects : eff.else_effects) || [];
  if (next.length) effectsQueue.unshift(...next);
}
