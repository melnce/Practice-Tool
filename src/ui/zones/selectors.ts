// src/ui/zones/selectors.ts
import { GameState, Player } from "../../core/types.js";
import { isOwnBoard, isBoardZone } from "../../helpers/board.js";
import { ZoneContext } from "./types.js";

export function buildZoneContext(
  containerId: string,
  state: GameState,
): ZoneContext {
  const isMulligan = state.phase === "mulligan";
  const isBlueHand = containerId === "blueHand";
  const isRedHand = containerId === "redHand";
  const isBlueBoard = containerId === "blueBoard";
  const isRedBoard = containerId === "redBoard";
  const isHand = isBlueHand || isRedHand;
  const isBoard = isBoardZone(containerId);
  const owner: Player = isBlueHand || isBlueBoard ? "blue" : "red";
  const isMyBoard = isOwnBoard(containerId, state);
  const isMyHand =
    (isBlueHand && state.isBlueTurn) || (isRedHand && !state.isBlueTurn);

  return {
    containerId,
    owner,
    isBoard,
    isHand,
    isMyBoard,
    isMyHand,
    isBlueHand,
    isRedHand,
    isBlueBoard,
    isRedBoard,
    isMulligan,
  };
}
