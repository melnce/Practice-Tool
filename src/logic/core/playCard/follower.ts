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
import { incrementRally, getBoard } from "../../../core/playerHelpers.js";
import { stampBoardEntryTs } from "../triggers/utils.js";
import { snapshotEnteringKeywords } from "../enterKeywords.js";
import {
  stashPlayFollowerResume,
  runPlayFollowerPostFanfare,
  type PlayFollowerResume,
} from "./followerResume.js";

/**
 * Play a follower card. Returns PlayOutcome without rendering.
 */
export function playFollower(
  card: CardInstance,
  player: Player,
  chosenTier: { effects: Effect[] } | null,
): PlayOutcome {
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

  // Rally check
  const hasRallyFanfare =
    Array.isArray(card.fanfare) &&
    card.fanfare.some((e: any) => String(e.op).toLowerCase() === "rally_gate");

  if (!hasRallyFanfare) {
    incrementRally(state, player);
  }

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

  const enteringKeywordSnapshot = snapshotEnteringKeywords(card);

  // Rulebook §242–256: Fanfare (step 1) before play/enter-reactive triggers (steps 2–5).
  const skipFanfareForEnhance =
    chosenTier && (card as any).enhance_replaces_fanfare;
  if (
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
        chosenTierEffects:
          chosenTier && Array.isArray(chosenTier.effects)
            ? [...chosenTier.effects]
            : null,
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
    chosenTierEffects:
      chosenTier && Array.isArray(chosenTier.effects)
        ? [...chosenTier.effects]
        : null,
    costChangedOnPlay,
    enteringKeywordSnapshot,
  });

  if (state.pendingTargetEffect) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}
