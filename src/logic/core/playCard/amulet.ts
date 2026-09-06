// src/logic/core/playCard/amulet.ts
// Amulet resolution logic. Pure logic, no rendering.

import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { isEffectResolutionPaused } from "../resolutionPause.js";
import { pushPlayedHistory, rememberLastPlayedCard } from "./history.js";
import type { PlayOutcome } from "./types.js";

import { mergeEarthSigilOnPlay } from "../../effects/ops/summon_ops/earth.js";
import { applyKeywordsFromList } from "../keywords.js";

import { initAmulet } from "../../effects/ops/summon_ops/init.js";
import { getBoard } from "../../../core/playerHelpers.js";
import { stampBoardEntryTs } from "../triggers/utils.js";
import { fireTrigger } from "../triggers.js";
import { pushToBoard } from "../../effects/ops/summon_ops/core.js";
import { enhanceReplacesBase } from "./enhancePlan.js";
import {
  beginPlaySequence,
  endPlaySequenceDrain,
  stageAmuletCardPlayedReaction,
} from "./playSequence.js";

/**
 * Play an amulet card. Returns PlayOutcome without rendering.
 */
export function playAmulet(
  card: CardInstance,
  player: Player,
  chosenTiers: { effects: Effect[] }[] | null = [],
  opts?: { enhancedPlay?: boolean },
): PlayOutcome {
  const tiers = chosenTiers ?? [];
  pushPlayedHistory(player, card);
  initAmulet(card);
  applyKeywordsFromList(card);

  const toBoard = getBoard(state, player);
  stampBoardEntryTs(card, { advance: true });
  if (!pushToBoard(toBoard, player, card, { deferEnter: true })) {
    return { kind: "blocked", reason: "Board is full." };
  }

  beginPlaySequence();
  stageAmuletCardPlayedReaction(card, player);

  if (opts?.enhancedPlay) {
    fireTrigger("enhanced_play", player, { playedCard: card });
  }

  mergeEarthSigilOnPlay(card, player);

  // Shared decision: base (fanfare) then tiers, unless enhance_replaces_base.
  // (Order flipped from the previous tiers-then-fanfare; only Timepiece of
  // Perfection has an Enhance tier and it has no fanfare — unobservable.)
  const runBase =
    !enhanceReplacesBase(card, tiers) &&
    Array.isArray(card.fanfare) &&
    card.fanfare.length > 0;
  if (runBase) {
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    runEffects([...card.fanfare!], player, card, { enteringCard: card });
  }

  for (const tier of tiers) {
    if (Array.isArray(tier.effects) && tier.effects.length) {
      runEffects([...tier.effects], player, card);
    }
  }

  rememberLastPlayedCard(card);

  if (!isEffectResolutionPaused()) {
    endPlaySequenceDrain();
  }

  if (isEffectResolutionPaused()) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}
