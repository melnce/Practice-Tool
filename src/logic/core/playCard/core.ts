// src/logic/core/playCard/core.ts
// Core orchestration for playing a card. Pure logic, no rendering.
// Contract: docs/playcard-contract.md

import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import { canPlayCard } from "./preflight.js";
import { resolvePlayCost } from "./cost.js";
import { playSpell } from "./spell.js";
import { playFollower } from "./follower.js";
import { playAmulet } from "./amulet.js";
import type { PlayOutcome } from "./types.js";
import {
  getPP,
  spendPP,
  getPlaysThisTurn,
  setPlaysThisTurn,
  isFirstPlayer,
} from "../../../core/playerHelpers.js";
import { isGameOver } from "../../../core/gameOver.js";
import {
  applyAlternateFormBaseCost,
  applyCrystallizeTransform,
} from "../../../helpers/alternateForm.js";
import { fireTrigger } from "../triggers.js";
import { bumpZoneVersion } from "../triggers/utils.js";

/**
 * Core play card logic. Returns a PlayOutcome without any rendering.
 * All UI/rendering decisions are made by the caller based on the outcome.
 */
export function playCardCore(
  fromHand: CardInstance[],
  player: Player,
  index: number,
): PlayOutcome {
  if (isGameOver()) {
    return { kind: "blocked", reason: "Game over" };
  }

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

  // 3) Cost / Enhance / Accelerate / Crystallize
  const currentPP = getPP(state, player);
  const plan = resolvePlayCost(card, currentPP);

  if (plan.cost > currentPP) {
    return { kind: "blocked", reason: "Not enough PP" };
  }

  // 4) Pay PP exactly once
  spendPP(state, player, plan.cost);

  // 5) Remove from hand and count play
  fromHand.splice(index, 1);
  bumpZoneVersion();
  setPlaysThisTurn(state, player, getPlaysThisTurn(state, player) + 1);

  // Enhanced-play watchers (Faith / crests) — fire once the Enhance cost is paid.
  // Followers/amulets fire after entering the field (see playFollower/playAmulet).
  if (plan.mode === "enhance" && card.type === "Spell") {
    fireTrigger("enhanced_play", player, { playedCard: card });
  }

  // 6) Dispatch by resolved form
  if (plan.mode === "accelerate" && plan.alternate) {
    (card as any).playedAs = "accelerate";
    (card as any).originalPrintedType = card.type;
    applyAlternateFormBaseCost(card, plan.alternate.cost);
    card.type = "Spell";
    // Accelerate reuses the tiers slot for alternate-form effects; pass
    // replaceBase so only those effects run (not the printed follower text).
    return playSpell(
      card,
      player,
      plan.cost,
      [{ effects: plan.alternate.effects }],
      { replaceBase: true },
    );
  }

  if (plan.mode === "crystallize" && plan.alternate) {
    applyCrystallizeTransform(card, plan.alternate);
    return playAmulet(card, player, []);
  }

  if (card.type === "Spell") {
    return playSpell(card, player, plan.cost, plan.enhanceTiers);
  } else if (card.type === "Follower") {
    return playFollower(card, player, plan.enhanceTiers, {
      enhancedPlay: plan.mode === "enhance",
    });
  } else if (card.type === "Amulet") {
    return playAmulet(card, player, plan.enhanceTiers, {
      enhancedPlay: plan.mode === "enhance",
    });
  }

  return { kind: "done" };
}
