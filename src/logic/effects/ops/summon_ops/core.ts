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

  // Respect max board size 5 occupied slots
  if (board.length >= 5) return false;

  board.push(card);
  bumpZoneVersion();
  if (!opts?.deferEnter) finishFollowerEnter(card, owner);
  return true;
}

export function finishFollowerEnter(card: CardInstance, owner: Player) {
  if (card.type === "Follower") {
    setRally(state, owner, getRally(state, owner) + 1);
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
