/**
 * Control change: move an in-play follower onto another player's field.
 *
 * Owner ruling — Rally (2026-08-12): Rally counts a follower successfully
 * *summoned* / entering the field as a summon. A control change is not a
 * summon, so it must NOT increment Rally. Secondary reading — confirm with
 * owner if a printed take-control card ever appears.
 *
 * Does not fire ally/enemy enter triggers (provisional; same secondary question).
 */
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import { getBoard, opponentOf } from "../../../core/playerHelpers.js";
import { bumpZoneVersion } from "../../core/triggers/utils.js";

const MAX_BOARD = 5;

/**
 * Transfer an in-play follower to `newOwner`'s field without incrementing Rally.
 * @returns true if the transfer succeeded; false if the target board is full
 *   or the card is not a follower currently on a board.
 */
export function changeFollowerControl(
  card: CardInstance,
  newOwner: Player,
): boolean {
  if (!card || card.type !== "Follower") return false;
  if (card.zone !== "board") return false;

  const oldOwner = (card.owner as Player) || opponentOf(newOwner);
  if (oldOwner === newOwner) return true;

  const fromBoard = getBoard(state, oldOwner);
  const toBoard = getBoard(state, newOwner);

  const idx = fromBoard.indexOf(card);
  if (idx === -1) return false;

  // Occupied slots (null holes from cleanup still count as occupied until compacted)
  const occupied = toBoard.filter((c) => c && typeof c === "object").length;
  if (occupied >= MAX_BOARD) return false;

  fromBoard.splice(idx, 1);
  card.owner = newOwner;
  card.zone = "board";

  // Fill a null hole if present; otherwise append
  let placed = false;
  for (let i = 0; i < toBoard.length; i++) {
    const slot = toBoard[i];
    if (!slot || typeof slot !== "object") {
      toBoard[i] = card;
      placed = true;
      break;
    }
  }
  if (!placed) toBoard.push(card);

  bumpZoneVersion();
  logEvent("changeControl", {
    from: oldOwner,
    to: newOwner,
    card: card.name,
    uid: card.uid,
  } as any);
  // Intentionally no finishFollowerEnter / no Rally increment.
  return true;
}
