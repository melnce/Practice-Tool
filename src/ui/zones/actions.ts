// src/ui/zones/actions.ts
import type { Player, CardInstance } from "../../core/types/index.js";
import { reportError } from "../errors.js";
import {
  playCardAtIndex,
  chooseTargetAction,
  engageAction,
  dispatchPlayerAction,
} from "../playerDispatch.js";
import { state } from "../../core/gameState.js";
import { getBoard } from "../../core/playerHelpers.js";

export function handleMulliganToggle(owner: Player, uid: string): void {
  // Mulligan stays on the browser mulligan module (records into the script runtime).
  void import(/* webpackIgnore: true */ "../../logic/mulligan.js")
    .then(({ toggleMulliganPick }) => {
      toggleMulliganPick(owner, uid);
    })
    .catch(reportError);
}

export function handleFuse(
  owner: Player,
  uid: string,
  _hasFuseRecipes: boolean,
  _card: CardInstance,
): void {
  void _hasFuseRecipes;
  void _card;
  try {
    dispatchPlayerAction({ type: "FUSE", player: owner, cardUid: uid });
  } catch (e) {
    reportError(e);
  }
}

export function handleResolveTarget(uid: string): void {
  try {
    const player = state.activePlayer;
    if (uid === "leader") {
      const enemy = player === "first" ? "second" : "first";
      chooseTargetAction(player, { type: "leader", player: enemy });
    } else {
      chooseTargetAction(player, { type: "card", uid });
    }
  } catch (e) {
    reportError(e);
  }
}

export function handleEngage(owner: Player, index: number): void {
  try {
    const card = getBoard(state, owner)[index];
    if (!card) return;
    engageAction(owner, card.uid);
  } catch (e) {
    reportError(e);
  }
}

export function handlePlayCard(
  handArray: CardInstance[],
  owner: Player,
  index: number,
): void {
  void handArray;
  try {
    playCardAtIndex(owner, index);
  } catch (e) {
    reportError(e);
  }
}
