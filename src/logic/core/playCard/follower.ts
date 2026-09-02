// src/logic/core/playCard/follower.ts
// Follower resolution logic. Pure logic, no rendering.

import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { pushPlayedHistory } from "./history.js";
import type { PlayOutcome } from "./types.js";
import { applyKeywordsFromList } from "../keywords.js";
import { getBoard } from "../../../core/playerHelpers.js";
import { bumpZoneVersion, stampBoardEntryTs } from "../triggers/utils.js";
import { snapshotEnteringKeywords } from "../enterKeywords.js";
import {
  stashPlayFollowerResume,
  runPlayFollowerPostFanfare,
  type PlayFollowerResume,
} from "./followerResume.js";
import { playerHasCrestPassive } from "../../effects/crest.js";
import { enhanceReplacesBase } from "./enhancePlan.js";

/**
 * Play a follower card. Returns PlayOutcome without rendering.
 */
export function playFollower(
  card: CardInstance,
  player: Player,
  chosenTiers: { effects: Effect[] }[] | null = [],
): PlayOutcome {
  const tiers = chosenTiers ?? [];
  pushPlayedHistory(player, card);

  // Snapshot cost for triggers
  const printed = Number.isFinite(card.base_cost)
    ? Number(card.base_cost)
    : parseInt(String(card.cost), 10) || 0;
  const current = parseInt(String(card.cost), 10) || 0;
  const handMod = parseInt(String(card.cost_mod), 10) || 0;
  const costChangedOnPlay =
    handMod !== 0 || (Number.isFinite(card.base_cost) && current !== printed);

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

  card.can_attack = !!card.hasStorm || !!card.hasRush;
  card.isRush = !!card.hasRush && !card.hasStorm;
  card.justPlayed = true;
  card.hasAttacked = false;

  const toBoard = getBoard(state, player);
  stampBoardEntryTs(card, { advance: true });
  toBoard.push(card);
  // Invalidate trigger-candidate cache (mid-turn scans must see this follower).
  bumpZoneVersion();

  const enteringKeywordSnapshot = snapshotEnteringKeywords(card);

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

  // Rulebook §242–256: Fanfare (step 1) before play/enter-reactive triggers (steps 2–5).
  // Shared decision: additive unless enhance_replaces_base (ordering unchanged).
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

    if (fanfarePaused || state.pendingTargetEffect) {
      const resume: PlayFollowerResume = {
        player,
        cardUid: card.uid,
        chosenTierEffectGroups,
        costChangedOnPlay,
        enteringKeywordSnapshot,
      };
      stashPlayFollowerResume(resume);
      return { kind: "paused" };
    }
  }

  runPlayFollowerPostFanfare({
    player,
    cardUid: card.uid,
    // Suppress Enhance ability activation while crest passive is active.
    chosenTierEffectGroups,
    costChangedOnPlay,
    enteringKeywordSnapshot,
  });

  if (state.pendingTargetEffect) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}
