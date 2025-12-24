// src/logic/core/playCard/core.ts
// Core orchestration for playing a card. Pure logic, no rendering.
// Contract: docs/playcard-contract.md

import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";
import { canPlayCard } from "./preflight.js";
import { pickEnhanceTier } from "./cost.js";
import { playSpell } from "./spell.js";
import { playFollower } from "./follower.js";
import { playAmulet } from "./amulet.js";
import { PlayOutcome } from "./types.js";
import { getPP, setPP, getPlaysThisTurn, setPlaysThisTurn, isFirstPlayer } from "../../../core/playerHelpers.js";

/**
 * Core play card logic. Returns a PlayOutcome without any rendering.
 * All UI/rendering decisions are made by the caller based on the outcome.
 */
export function playCardCore(
  fromHand: CardInstance[],
  player: Player,
  index: number,
): PlayOutcome {
  // 1) Turn guard
  const first = isFirstPlayer(player);
  if (
    (first && state.activePlayer !== "first") ||
    (!first && state.activePlayer === "first")
  ) {
    return { kind: "blocked", reason: "Not your turn" };
  }

  const card = fromHand[index];
  if (!card) return { kind: "blocked", reason: "No card at index" };

  // 2) Preflight checks
  const check = canPlayCard(card, player);
  if (check.ok === false) {
    return { kind: "blocked", reason: check.reason };
  }

  // 3) Cost / Enhance
  const currentPP = getPP(state, player);
  const handMod = parseInt(String(card.cost_mod)) || 0;
  const baseCost = parseInt(String(card.cost)) || 0;

  // Pick highest affordable tier by *printed* tier cost
  const chosenTier = pickEnhanceTier(card, currentPP);

  // Final effective cost calculation
  const effectiveCost = chosenTier ? chosenTier.cost : baseCost + handMod;

  if (effectiveCost > currentPP) {
    return { kind: "blocked", reason: "Not enough PP" };
  }

  // 4) Pay PP exactly once
  setPP(state, player, currentPP - effectiveCost);

  // 5) Remove from hand and count play
  fromHand.splice(index, 1);
  setPlaysThisTurn(state, player, getPlaysThisTurn(state, player) + 1);

  // 6) Dispatch by type
  if (card.type === "Spell") {
    return playSpell(card, player, effectiveCost, chosenTier);
  } else if (card.type === "Follower") {
    return playFollower(card, player, chosenTier);
  } else if (card.type === "Amulet") {
    return playAmulet(card, player, chosenTier);
  }

  return { kind: "done" };
}















