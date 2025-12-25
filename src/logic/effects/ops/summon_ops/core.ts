import { state } from "../../../../core/gameState.js";
import { fireTrigger } from "../../../core/triggers.js";
import { CardInstance, CardTemplate, Player } from "../../../../core/types/index.js";
import { initAmulet, initFollower } from "./init.js";
import { isFollower, isAmulet } from "./utils.js";
import { opponentOf, setRally, getRally } from "../../../../core/playerHelpers.js";

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
) {
  // Respect max board size 5 (and prevent duplicates)
  if (board.length >= 5) return false;
  // Prevention: If card is already on board (e.g. reanimate logic artifact where object is reused),
  // we silently ignore the push to preserve idempotency and prevent duplicates.
  if (board.includes(card)) return true;
  card.zone = "board";
  board.push(card);

  // Increment Rally if follower
  if (card.type === "Follower") {
    setRally(state, owner, getRally(state, owner) + 1);
  }

  // MEDICAL ASSASSIN TRIGGER - ADD THIS LINE
  // Hook removed - replaced by JSON trigger
  // medicalAssassinOnFollowerEnter(owner, card);

  // follower enter triggers
  if (isFollower(card)) {
    // Fire ally trigger for owner, enemy trigger for opponent
    const opponent = opponentOf(owner);
    fireTrigger("ally_follower_enter", owner, { enteringCard: card });
    fireTrigger("enemy_follower_enter", opponent, { enteringCard: card });

    // >>> Congregant chain (runs once when the first instance enters)
    // Legacy Support REMOVED: Managed by JSON Trigger now
    // if (normalizeName(card.name) === "congregant of unkilling") ...
  }
  return true;
}















