// src/ui/zones/selectors.ts
import type { GameState, Player } from "../../core/types/index.js";
import { isOwnBoard, isBoardZone } from "../../helpers/board.js";
import type { ZoneContext } from "./types.js";
import {
  isHiddenHandEnabled,
  getScriptedSide,
  getScriptRuntimeSnapshot,
} from "../../logic/script/runtime.js";

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
  const owner: Player = isBlueHand || isBlueBoard ? "first" : "second";
  const isMyBoard = isOwnBoard(containerId, state);
  // Use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";
  const isMyHand =
    (isBlueHand && isFirstActive) || (isRedHand && !isFirstActive);

  const snap = getScriptRuntimeSnapshot();
  const scripted = getScriptedSide();
  const hideHandFaces =
    isHand &&
    isHiddenHandEnabled() &&
    !!scripted &&
    owner === scripted &&
    (snap.mode === "playing" || snap.mode === "recording");

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
    hideHandFaces,
  };
}
