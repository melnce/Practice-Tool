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
  setPP,
  getPlaysThisTurn,
  setPlaysThisTurn,
  isFirstPlayer,
} from "../../../core/playerHelpers.js";
import { isGameOver } from "../../../core/gameOver.js";
import type { AlternateForm } from "../../../helpers/alternateForm.js";
import { fireTrigger } from "../triggers.js";
import { bumpZoneVersion } from "../triggers/utils.js";

/**
 * Transform a follower into its Crystallize amulet form for this play.
 * Follower Fanfare / keywords do not apply; amuletKeywords take over.
 */
function applyCrystallizeTransform(
  card: CardInstance,
  form: AlternateForm,
): void {
  (card as any).playedAs = "crystallize";
  (card as any).originalPrintedType = card.type;
  card.type = "Amulet";
  card.attack = 0;
  card.defense = 0;
  card.fanfare = [];
  card.evolve = [];
  card.superevolve = [];
  card.hasRush = false;
  card.hasStorm = false;
  card.hasBane = false;
  card.hasWard = false;
  card.hasAura = false;
  card.hasAmbush = false;
  card.hasIntimidate = false;
  card.can_attack = false;
  card.isRush = false;
  card.keywords = [...form.amuletKeywords];
}

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
  setPP(state, player, currentPP - plan.cost);

  // 5) Remove from hand and count play
  fromHand.splice(index, 1);
  bumpZoneVersion();
  setPlaysThisTurn(state, player, getPlaysThisTurn(state, player) + 1);

  // Enhanced-play watchers (Faith / crests) — fire once the Enhance cost is paid.
  if (plan.mode === "enhance") {
    fireTrigger("enhanced_play", player, { playedCard: card });
  }

  // 6) Dispatch by resolved form
  if (plan.mode === "accelerate" && plan.alternate) {
    (card as any).playedAs = "accelerate";
    (card as any).originalPrintedType = card.type;
    card.type = "Spell";
    return playSpell(card, player, plan.cost, {
      effects: plan.alternate.effects,
    });
  }

  if (plan.mode === "crystallize" && plan.alternate) {
    applyCrystallizeTransform(card, plan.alternate);
    return playAmulet(card, player, null);
  }

  if (card.type === "Spell") {
    return playSpell(card, player, plan.cost, plan.enhanceTier);
  } else if (card.type === "Follower") {
    return playFollower(card, player, plan.enhanceTier);
  } else if (card.type === "Amulet") {
    return playAmulet(card, player, plan.enhanceTier);
  }

  return { kind: "done" };
}
