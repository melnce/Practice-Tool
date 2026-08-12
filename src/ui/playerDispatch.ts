/**
 * UI → PlayerAction dispatcher.
 * Captures stable script refs before mutation when recording a sparring line.
 */

import { state } from "../core/gameState.js";
import type { PlayerAction, Player } from "../core/types/index.js";
import { getHand, getBoard, opponentOf } from "../core/playerHelpers.js";
import { dispatch as engineDispatch } from "../engine.js";
import {
  buildRecordStepFromAction,
  recordScriptStep,
  isScriptRecordingActive,
  getScriptedSide,
  shouldAutoAdvanceScript,
  advanceScriptPlayback,
  isScriptPlaybackActive,
} from "../logic/script/runtime.js";
import { reportBlockedOutcome } from "./outcomes.js";

let advancing = false;

/**
 * Apply a player action through the engine dispatcher, optionally recording it.
 */
export function dispatchPlayerAction(action: PlayerAction): void {
  const recording = isScriptRecordingActive();
  const side = getScriptedSide();
  const activeBefore = state.activePlayer;

  let preZones:
    | {
        hand?: ReturnType<typeof getHand>;
        board?: ReturnType<typeof getBoard>;
        enemyBoard?: ReturnType<typeof getBoard>;
      }
    | undefined;

  if (recording && side) {
    const involves =
      ("player" in action && (action as { player: Player }).player === side) ||
      (action.type === "END_TURN" && activeBefore === side);
    if (involves) {
      preZones = {
        hand: [...getHand(state, side)],
        board: [...getBoard(state, side)],
        enemyBoard: [...getBoard(state, opponentOf(side))],
      };
    }
  }

  engineDispatch(state, action);

  if (recording && side) {
    if (action.type === "END_TURN") {
      if (activeBefore === side) {
        recordScriptStep({ op: "END_TURN" });
      }
    } else if (
      "player" in action &&
      (action as { player: Player }).player === side
    ) {
      const step = buildRecordStepFromAction(action, preZones);
      recordScriptStep(step);
    }
  }

  maybeAdvanceScriptFromUi();
}

export function maybeAdvanceScriptFromUi(): void {
  if (advancing) return;
  if (!isScriptPlaybackActive() || !shouldAutoAdvanceScript()) return;
  advancing = true;
  try {
    advanceScriptPlayback({
      applyAction: (action) => {
        engineDispatch(state, action);
      },
    });
  } finally {
    advancing = false;
  }
}

/** Helpers used by click/drag handlers to build actions. */
export function playCardAction(player: Player, cardUid: string): void {
  dispatchPlayerAction({ type: "PLAY_CARD", player, cardUid });
}

export function attackAction(
  player: Player,
  attackerUid: string,
  defender: { type: "leader"; player: Player } | { type: "card"; uid: string },
): void {
  dispatchPlayerAction({
    type: "ATTACK",
    player,
    attackerUid,
    defender,
  });
}

export function endTurnAction(): void {
  dispatchPlayerAction({ type: "END_TURN" });
}

export function evolveAction(
  player: Player,
  cardUid: string,
  mode: "normal" | "super",
): void {
  dispatchPlayerAction({ type: "EVOLVE", player, cardUid, mode });
}

export function engageAction(player: Player, cardUid: string): void {
  dispatchPlayerAction({ type: "ENGAGE", player, cardUid });
}

export function bonusPpAction(player: Player): void {
  dispatchPlayerAction({ type: "BONUS_PP", player });
}

export function chooseTargetAction(
  player: Player,
  target: { type: "leader"; player: Player } | { type: "card"; uid: string },
): void {
  dispatchPlayerAction({ type: "CHOOSE_TARGET", player, target });
}

export function toggleMulliganAction(player: Player, cardUid: string): void {
  dispatchPlayerAction({ type: "TOGGLE_MULLIGAN", player, cardUid });
}

export function confirmMulliganAction(player: Player): void {
  dispatchPlayerAction({ type: "CONFIRM_MULLIGAN", player });
}

/** Play-card by hand index (UI convenience). */
export function playCardAtIndex(player: Player, index: number): void {
  const hand = getHand(state, player);
  const card = hand[index];
  if (!card) {
    reportBlockedOutcome({ kind: "blocked", reason: "No card at index" });
    return;
  }
  playCardAction(player, card.uid);
}
