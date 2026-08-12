// Continuation after fanfare pauses for interactive resolution (C3).
import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { fireTrigger } from "../triggers.js";
import { applyKeywordsFromList } from "../keywords.js";
import {
  getBoard,
  opponentOf,
  incrementRally,
} from "../../../core/playerHelpers.js";
import type { EnteringKeywordSnapshot } from "../enterKeywords.js";
import { resumeDeferredDeathIfIdle } from "../cleanup.js";

export interface PlayFollowerResume {
  player: Player;
  cardUid: string;
  chosenTierEffects: Effect[] | null;
  costChangedOnPlay: boolean;
  enteringKeywordSnapshot: EnteringKeywordSnapshot;
}

function findFollowerOnBoard(uid: string, player: Player): CardInstance | null {
  const board = getBoard(state, player);
  return board.find((c) => c.uid === uid) ?? null;
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
  // §372 / Owner ruling — Rally (2026-08-12): Fanfare Rally(N) sees the count
  // from just before this card entered (timing). Increment after Fanfare
  // (before enter/play triggers) so rally-conditioned Fanfare gates exclude
  // self; tokens/summons during Fanfare still count via summon_ops. Always
  // increment even if the follower left play during Fanfare.
  incrementRally(state, resume.player);

  const card = findFollowerOnBoard(resume.cardUid, resume.player);
  if (!card) return;

  const player = resume.player;
  const opponent = opponentOf(player);

  fireTrigger("ally_follower_played", player as any, {
    playedCard: card,
    costChanged: resume.costChangedOnPlay,
  });

  const enterCtx = {
    enteringCard: card,
    enteringOwner: player,
    enteringKeywordSnapshot: resume.enteringKeywordSnapshot,
  };
  fireTrigger("ally_follower_enter", player as any, enterCtx);
  fireTrigger("enemy_follower_enter", opponent as any, enterCtx);

  if (resume.chosenTierEffects?.length) {
    runEffects([...resume.chosenTierEffects], player, card);
  }

  applyKeywordsFromList(card);
  card.can_attack = !!card.hasStorm || !!card.hasRush;
  card.isRush = !!card.hasRush && !card.hasStorm;

  const myBoard = getBoard(state, player);
  for (const perm of myBoard) {
    if (perm === card || perm.type !== "Amulet") continue;
    const ks = perm.keywordState;
    if (ks?.hasAllyEnter && Array.isArray(ks.allyEnterEffects)) {
      for (const eff of ks.allyEnterEffects) {
        if (eff.op === "stat" && eff.target === "trigger") {
          card.attack =
            (Number(card.attack) || 0) + (Number((eff as any).attack) || 0);
          card.defense =
            (Number(card.defense) || 0) + (Number((eff as any).defense) || 0);
        }
      }
    }
  }

  if (Array.isArray(card.tribes) && card.tribes.includes("Pixie")) {
    for (const perm of myBoard) {
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
  resumeDeferredDeathIfIdle();
}
