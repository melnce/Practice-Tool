// Continuation after fanfare pauses for interactive resolution (C3).
import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { applyKeywordsFromList } from "../keywords.js";
import {
  getBoard,
  getGraveyard,
  incrementRally,
} from "../../../core/playerHelpers.js";
import type { EnteringKeywordSnapshot } from "../enterKeywords.js";
import { resumeDeferredDeathIfIdle } from "../cleanup.js";
import { recordFollowerEnter } from "../followerEnterHistory.js";
import { recomputeAttackFlags } from "../combat.js";
import { endPlaySequenceDrainIfIdle } from "./playSequence.js";
import { isEffectResolutionPaused } from "../resolutionPause.js";
import { fireTrigger } from "../triggers.js";

export interface PlayFollowerResume {
  player: Player;
  cardUid: string;
  chosenTierEffectGroups: Effect[][] | null;
  costChangedOnPlay: boolean;
  enteringKeywordSnapshot: EnteringKeywordSnapshot;
}

function findFollowerOnBoard(uid: string, player: Player): CardInstance | null {
  const board = getBoard(state, player);
  return board.find((c) => c != null && c.uid === uid) ?? null;
}

/** Stash post-fanfare tail while fanfare awaits UI (target pick or mode modal). */
export function stashPlayFollowerResume(ctx: PlayFollowerResume): void {
  if (state.pendingTargetEffect) {
    state.pendingTargetEffect.resumePlayFollower = ctx;
  } else {
    (state as any).resumePlayFollower = ctx;
  }
}

/** Run play/enter-reactive triggers and Enhance after fanfare fully resolves. */
export function runPlayFollowerPostFanfare(resume: PlayFollowerResume): void {
  try {
    const player = resume.player;
    // §372 / Owner ruling — Rally (2026-08-12): Fanfare Rally(N) sees the count
    // from just before this card entered (timing). Increment after Fanfare
    // (before enter/play triggers) so rally-conditioned Fanfare gates exclude
    // self; tokens/summons during Fanfare still count via summon_ops. Always
    // increment even if the follower left play during Fanfare.
    incrementRally(state, resume.player);

    const card =
      findFollowerOnBoard(resume.cardUid, resume.player) ??
      getGraveyard(state, resume.player).find((c) => c?.uid === resume.cardUid) ??
      null;
    if (card) {
      recordFollowerEnter(state, player, card);
    }

    const live = findFollowerOnBoard(resume.cardUid, resume.player);
    if (!live) return;

    fireTrigger("ally_card_played", player, { playedCard: live });
    fireTrigger("ally_follower_played", player, {
      playedCard: live,
      costChanged: resume.costChangedOnPlay,
    });

    if (resume.chosenTierEffectGroups?.length) {
      for (const effects of resume.chosenTierEffectGroups) {
        if (effects.length) {
          runEffects([...effects], player, live);
        }
      }
    }

    applyKeywordsFromList(live);
    recomputeAttackFlags(live);

    const myBoard = getBoard(state, player);
    for (const perm of myBoard) {
      if (!perm || perm === live || perm.type !== "Amulet") continue;
      const ks = perm.keywordState;
      if (ks?.hasAllyEnter && Array.isArray(ks.allyEnterEffects)) {
        for (const eff of ks.allyEnterEffects) {
          if (eff.op === "stat" && eff.target === "trigger") {
            live.attack =
              (Number(live.attack) || 0) + (Number((eff as any).attack) || 0);
            live.defense =
              (Number(live.defense) || 0) + (Number((eff as any).defense) || 0);
          }
        }
      }
    }

    if (card && Array.isArray(card.tribes) && card.tribes.includes("Pixie")) {
      for (const perm of myBoard) {
        if (!perm) continue;
        const ks = perm.keywordState || {};
        if (
          perm.type === "Amulet" &&
          ks.hasPixieEnter &&
          Array.isArray(ks.pixieEnterEffects)
        ) {
          runEffects([...ks.pixieEnterEffects], player, perm);
        }
      }
    }
  } finally {
    // Every completion path (orchestrateExecution, multi-pick discard, etc.)
    // must end the play sequence; idempotent for explicit follower.ts drain.
    if (!isEffectResolutionPaused()) {
      endPlaySequenceDrainIfIdle();
    }
    resumeDeferredDeathIfIdle();
  }
}

/** Consume stashed resume after interactive fanfare completes. */
export function consumePlayFollowerResume(): void {
  const pendingResume = state.pendingTargetEffect?.resumePlayFollower as
    | PlayFollowerResume
    | undefined;
  const globalResume = (state as any).resumePlayFollower as
    | PlayFollowerResume
    | undefined;
  const resume = pendingResume ?? globalResume;
  if (!resume) return;

  delete (state as any).resumePlayFollower;
  if (state.pendingTargetEffect) {
    delete state.pendingTargetEffect.resumePlayFollower;
  }

  runPlayFollowerPostFanfare(resume);
}
