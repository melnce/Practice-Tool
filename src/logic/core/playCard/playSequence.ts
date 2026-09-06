// Play-sequence depth gate (mirrors combatResolutionDepth in PR #269).
// Stages play/enter reactions at board entry; merges ahead of fanfare-raised
// queue items at the single end-of-play drain.
import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { EnteringKeywordSnapshot } from "../enterKeywords.js";
import type { TriggerContext, TriggerEventName } from "../triggers/types.js";
import { enrichContextWithUids } from "../triggers/resolve.js";
import {
  collectReactiveTriggers,
  getResolutionQueue,
  type ReactiveQueueItem,
} from "../triggers/queue.js";
import {
  cleanupCountdownZeroAmulets,
  flushDeferredDeathBatch,
} from "../cleanup.js";
import { clearResolutionQueue } from "../triggers/queue.js";
import { isEffectResolutionPaused } from "../resolutionPause.js";
import { isGameOver } from "../../../core/gameOver.js";
import { flushDeferredDeckShuffle } from "../../effects/ops/returnHandToDeck.js";

export function getPlaySequenceDepth(): number {
  return ((state as any).playSequenceDepth ?? 0) as number;
}

function getStagedPlayEnterGroups(): ReactiveQueueItem[] {
  if (!(state as any)._stagedPlayEnterGroups) {
    (state as any)._stagedPlayEnterGroups = [];
  }
  return (state as any)._stagedPlayEnterGroups as ReactiveQueueItem[];
}

function turnToken(): number {
  return Number.isFinite(state.turnNumber)
    ? state.turnNumber
    : (state.roundCount || 0) * 2 + (state.activePlayer === "first" ? 0 : 1);
}

function stageReactiveGroup(
  event: TriggerEventName,
  activePlayer: Player,
  context: Record<string, unknown>,
): void {
  const enriched = enrichContextWithUids(context as TriggerContext);
  enriched._turnNumber = turnToken();
  enriched._triggerEvent = event;
  const entries = collectReactiveTriggers(
    event,
    activePlayer,
    enriched as TriggerContext,
  );
  if (entries.length === 0) return;
  getStagedPlayEnterGroups().push({
    kind: "reactive",
    event,
    activePlayer,
    entries,
  });
}

/** Begin a card-play sequence; suppresses end-of-runEffects drain until ended. */
export function beginPlaySequence(): void {
  const depth = getPlaySequenceDepth();
  if (depth === 0) {
    (state as any)._playSequenceSavedDefer = !!(state as any)
      .deferDeathTriggers;
    (state as any).deferDeathTriggers = true;
  }
  (state as any).playSequenceDepth = depth + 1;
}

function mergeStagedPlayEnterGroups(): void {
  const staged = getStagedPlayEnterGroups();
  if (staged.length === 0) return;
  const q = getResolutionQueue();
  for (let i = staged.length - 1; i >= 0; i--) {
    q.unshift(staged[i]!);
  }
  (state as any)._stagedPlayEnterGroups = [];
}

/** Drain the play sequence queue once after Fanfare, Enhance, and post-Fanfare tail. */
export function endPlaySequenceDrain(): void {
  const depth = getPlaySequenceDepth();
  if (depth <= 0) return;
  (state as any).playSequenceDepth = depth - 1;
  if (getPlaySequenceDepth() > 0) return;

  if ((state as any)._playSequenceSavedDefer !== undefined) {
    (state as any).deferDeathTriggers = (state as any)._playSequenceSavedDefer;
    delete (state as any)._playSequenceSavedDefer;
  }

  if (
    isEffectResolutionPaused() ||
    isGameOver() ||
    (state as any)._drainingResolutionQueue
  ) {
    return;
  }

  mergeStagedPlayEnterGroups();
  flushDeferredDeckShuffle();
  cleanupCountdownZeroAmulets();
  flushDeferredDeathBatch();
  clearResolutionQueue();
}

/** Stage follower play + enter reactions (FIFO ahead of Fanfare-raised items). */
export function stageFollowerPlayEnterReactions(
  card: CardInstance,
  player: Player,
  costChangedOnPlay: boolean,
  enteringKeywordSnapshot: EnteringKeywordSnapshot,
): void {
  stageReactiveGroup("ally_follower_played", player, {
    playedCard: card,
    costChanged: costChangedOnPlay,
  });
  stageReactiveGroup("ally_card_played", player, {
    playedCard: card,
  });

  const enterCtx = {
    enteringCard: card,
    enteringOwner: player,
    enteringKeywordSnapshot,
  };
  stageReactiveGroup("ally_follower_enter", player, enterCtx);
  stageReactiveGroup("enemy_follower_enter", player, enterCtx);
}

/** Stage amulet ally_card_played (FIFO ahead of Fanfare-raised items). */
export function stageAmuletCardPlayedReaction(
  card: CardInstance,
  player: Player,
): void {
  stageReactiveGroup("ally_card_played", player, {
    playedCard: card,
  });
}

/** End play sequence when no interactive pause remains. */
export function endPlaySequenceDrainIfIdle(): void {
  if (getPlaySequenceDepth() <= 0) return;
  if (isEffectResolutionPaused()) return;
  if (state.pendingTargetEffect) return;
  if (state.pendingModeChoice) return;
  endPlaySequenceDrain();
}
