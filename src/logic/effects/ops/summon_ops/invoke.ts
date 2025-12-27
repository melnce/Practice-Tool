/* eslint-disable */
import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { fireTrigger } from "../../../core/triggers.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import { initAmulet, initFollower } from "./init.js";
import { pushToBoard } from "./core.js";
import { deckOf, boardOf } from "./utils.js";

/**
 * Handles the execution of Invoking a card from the deck.
 * - Removes from deck.
 * - Initializes the card (stats, keywords).
 * - Pushes to board (if space allows).
 * - Fires specific "invoke" triggers.
 * - Logs the event.
 */
export function handleInvoke(owner: Player, card: CardInstance): boolean {
  const deck = deckOf(owner);
  const board = boardOf(owner);

  // 1. Remove from deck
  const index = deck.indexOf(card);
  if (index === -1) {
    console.warn(`handleInvoke: Card ${card.name} not found in deck.`);
    return false;
  }
  deck.splice(index, 1);

  // 2. Add to board (or return to deck if full)
  if (board.length >= 5) {
    console.log("Invoke failed: Board full. Returning to deck.");
    // "If your area is full, Invoked cards remain in your deck."
    deck.push(card);
    return false;
  }

  // 3. Initialize Card
  card.zone = "board";
  if (card.type === "Follower") {
    initFollower(card);
  } else if (card.type === "Amulet") {
    initAmulet(card);
  }

  // 4. Place on board
  // pushToBoard handles Rally increment and standard enter triggers
  const placed = pushToBoard(board, owner, card);

  if (placed) {
    // 5. Fire specific Invoke trigger (e.g. for card self-reaction)
    // Sandalphon: "When this card is Invoked..."
    fireTrigger("invoke", owner, { sourceCard: card, invokedCard: card });

    logEvent("invoke", { owner, card: card.name, uid: card.uid });
    // Render removed - UI orchestrator handles rendering
    return true;
  } else {
    // Fallback if push failed (unlikely given length check detailed above, but for safety)
    console.warn("Invoke pushToBoard failed unexpectedly. Returning to deck.");
    deck.push(card);
    return false;
  }
}















