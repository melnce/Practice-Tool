import { state } from "../../../../core/gameState.js";
import { fireTrigger } from "../../../core/triggers.js";
import type {
  CardInstance,
  CardTemplate,
  Player,
} from "../../../../core/types/index.js";
import { initAmulet, initFollower } from "./init.js";
import { isFollower, isAmulet } from "./utils.js";
import {
  opponentOf,
  setRally,
  getRally,
} from "../../../../core/playerHelpers.js";
import {
  bumpZoneVersion,
  stampBoardEntryTs,
} from "../../../core/triggers/utils.js";
import { snapshotEnteringKeywords } from "../../../core/enterKeywords.js";
import { recordFollowerEnter } from "../../../core/followerEnterHistory.js";

const BOARD_CAP = 5;

/** Count real cards on the field (null death placeholders are not cards). */
export function countRealBoardCards(board: CardInstance[]): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) {
    const slot = board[i];
    if (slot && typeof slot === "object") n++;
  }
  return n;
}

/** True when another follower/amulet can enter (fills null holes first). */
export function boardHasRoom(board: CardInstance[]): boolean {
  return countRealBoardCards(board) < BOARD_CAP;
}

// =============== Core Summon Routines ===============

export function makeCardFromDB(
  cardData: CardTemplate,
  owner: Player,
): CardInstance {
  const card: CardInstance = structuredClone(cardData);
  card.uid = state.rng.makeUid();
  card.owner = owner;

  if (isFollower(card)) initFollower(card);
  else if (isAmulet(card)) initAmulet(card);
  return card;
}

export function pushToBoard(
  board: CardInstance[],
  owner: Player,
  card: CardInstance,
  opts?: { deferEnter?: boolean },
) {
  if (board.includes(card)) return true;

  card.zone = "board";
  stampBoardEntryTs(card);

  // Fill a null hole left during cleanup (LW summon before board compaction)
  for (let i = 0; i < board.length; i++) {
    const slot = board[i];
    if (!slot || typeof slot !== "object") {
      board[i] = card;
      bumpZoneVersion();
      if (!opts?.deferEnter) finishFollowerEnter(card, owner);
      return true;
    }
  }

  // Respect max board size: 5 real cards (null holes are freed slots)
  if (countRealBoardCards(board) >= BOARD_CAP) return false;

  board.push(card);
  bumpZoneVersion();
  if (!opts?.deferEnter) finishFollowerEnter(card, owner);
  return true;
}

export function finishFollowerEnter(card: CardInstance, owner: Player) {
  // Owner ruling — Rally (2026-08-12): any successful follower entry increments
  // Rally (route-agnostic). Callers that place without a successful entry
  // (full board) must not reach here; control-change uses changeFollowerControl.
  if (card.type === "Follower") {
    setRally(state, owner, getRally(state, owner) + 1);
    recordFollowerEnter(state, owner, card);
  }

  if (isFollower(card)) {
    const opponent = opponentOf(owner);
    const enterCtx = {
      enteringCard: card,
      enteringOwner: owner,
      enteringKeywordSnapshot: snapshotEnteringKeywords(card),
    };
    fireTrigger("ally_follower_enter", owner, enterCtx);
    fireTrigger("enemy_follower_enter", opponent, enterCtx);
  }
}
