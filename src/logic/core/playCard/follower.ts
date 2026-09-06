// src/logic/core/playCard/follower.ts
// Follower resolution logic. Pure logic, no rendering.

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
import { applyKeywordsFromList } from "../keywords.js";
import { getBoard } from "../../../core/playerHelpers.js";
import { stampBoardEntryTs } from "../triggers/utils.js";
import { fireTrigger } from "../triggers.js";
import { pushToBoard } from "../../effects/ops/summon_ops/core.js";
import { snapshotEnteringKeywords } from "../enterKeywords.js";
import {
  stashPlayFollowerResume,
  runPlayFollowerPostFanfare,
  type PlayFollowerResume,
} from "./followerResume.js";
import { resumeDeferredDeathIfIdle } from "../cleanup.js";
import { playerHasCrestPassive } from "../../effects/crest.js";
import { enhanceReplacesBase } from "./enhancePlan.js";
import { recomputeAttackFlags } from "../combat.js";
import { isPlayCostChangedFromPrinted } from "../../../helpers/alternateForm.js";
import {
  beginPlaySequence,
  endPlaySequenceDrain,
  stageFollowerPlayEnterReactions,
} from "./playSequence.js";

/**
 * Play a follower card. Returns PlayOutcome without rendering.
 */
export function playFollower(
  card: CardInstance,
  player: Player,
  chosenTiers: { effects: Effect[] }[] | null = [],
  opts?: { enhancedPlay?: boolean },
): PlayOutcome {
  const tiers = chosenTiers ?? [];
  pushPlayedHistory(player, card);

  // Snapshot cost for triggers — net effective vs printed base (Institute of Truth Q&A).
  const costChangedOnPlay = isPlayCostChangedFromPrinted(card);

  card.attack = parseInt(String(card.attack), 10) || 0;
  card.defense = parseInt(String(card.defense), 10) || 0;

  // Rally: incremented in runPlayFollowerPostFanfare (after Fanfare) so
  // rally-conditioned Fanfare gates (§372) see the pre-entry count.

  if ((card as any).base_attack === undefined)
    (card as any).base_attack = card.attack;
  if ((card as any).base_defense === undefined)
    (card as any).base_defense = card.defense;
  if (card.peak_defense === undefined) card.peak_defense = card.defense;

  applyKeywordsFromList(card);

  card.justPlayed = true;
  card.hasAttacked = false;
  recomputeAttackFlags(card);

  const toBoard = getBoard(state, player);
  stampBoardEntryTs(card, { advance: true });
  if (!pushToBoard(toBoard, player, card, { deferEnter: true })) {
    return { kind: "blocked", reason: "Board is full." };
  }

  beginPlaySequence();
  const enteringKeywordSnapshot = snapshotEnteringKeywords(card);
  stageFollowerPlayEnterReactions(
    card,
    player,
    costChangedOnPlay,
    enteringKeywordSnapshot,
  );

  if (opts?.enhancedPlay) {
    fireTrigger("enhanced_play", player, { playedCard: card });
  }

  // Crest passive: suppress Fanfare (and Enhance is gated in resolvePlayCost).
  const suppressFanfareEnhance = playerHasCrestPassive(
    player,
    "suppress_fanfare_enhance",
  );

  const chosenTierEffectGroups = suppressFanfareEnhance
    ? null
    : tiers
        .map((tier) => (Array.isArray(tier.effects) ? [...tier.effects] : []))
        .filter((effects) => effects.length);

  // Rulebook §242–256: play/enter reactions are staged at entry (before Fanfare);
  // Fanfare runs next; Rally / enter-count counters stay in runPlayFollowerPostFanfare.
  const skipFanfareForEnhance =
    !!chosenTierEffectGroups?.length && enhanceReplacesBase(card, tiers);
  if (
    !suppressFanfareEnhance &&
    !skipFanfareForEnhance &&
    Array.isArray(card.fanfare) &&
    card.fanfare.length
  ) {
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    const fanfarePaused =
      runEffects([...card.fanfare], player, card, { enteringCard: card }) ===
      "pending";

    if (fanfarePaused || isEffectResolutionPaused()) {
      const resume: PlayFollowerResume = {
        player,
        cardUid: card.uid,
        chosenTierEffectGroups,
        costChangedOnPlay,
        enteringKeywordSnapshot,
      };
      stashPlayFollowerResume(resume);
      rememberLastPlayedCard(card);
      return { kind: "paused" };
    }
  }

  rememberLastPlayedCard(card);
  runPlayFollowerPostFanfare({
    player,
    cardUid: card.uid,
    // Suppress Enhance ability activation while crest passive is active.
    chosenTierEffectGroups,
    costChangedOnPlay,
    enteringKeywordSnapshot,
  });

  if (!isEffectResolutionPaused()) {
    endPlaySequenceDrain();
  }
  resumeDeferredDeathIfIdle();

  if (isEffectResolutionPaused()) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}
