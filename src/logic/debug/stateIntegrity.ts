import { GameState, CardInstance } from "../../core/types.js";
import { getHand, getBoard, getDeck, getGraveyard } from "../../core/playerHelpers.js";

export function checkStateIntegrity(state: GameState) {
  const seen = new Map<CardInstance, string>();

  const checkCollection = (
    collection: CardInstance[],
    locationName: string,
    expectedZone: string,
  ) => {
    if (!Array.isArray(collection)) {
      throw new Error(`Invariant Violation: ${locationName} is not an array.`);
    }

    collection.forEach((card, index) => {
      const loc = `${locationName}[${index}]`;

      // Check for duplicates
      if (seen.has(card)) {
        throw new Error(
          `Invariant Violation: Card object duplicated at ${loc} and ${seen.get(card)}. Card: ${card.name} (${card.uid})`,
        );
      }
      seen.set(card, loc);

      // Check zone (optional per prompt, but good practice)
      // Note: Deck cards might not have zone set until drawn? Or should?
      // Usually we expect 'hand', 'board', 'deck', 'graveyard'.
      if (expectedZone && card.zone !== expectedZone) {
        // Relax check for 'deck' if strictly not required, but usually 'deck' is used.
        // Checking if zone matches expected
        if (card.zone !== expectedZone) {
          // Warning or Error? Prompt said "optional: zone field matches actual container".
          // Let's enforce it for board/hand/graveyard which are critical.
          if (expectedZone !== "deck") {
            throw new Error(
              `Invariant Violation: Card at ${loc} has invalid zone '${card.zone}'. Expected '${expectedZone}'. Card: ${card.name}`,
            );
          }
        }
      }
    });
  };

  // Check all zones for both players using semantic helpers
  checkCollection(getHand(state, "first"), "firstHand", "hand");
  checkCollection(getHand(state, "second"), "secondHand", "hand");
  checkCollection(getBoard(state, "first"), "firstBoard", "board");
  checkCollection(getBoard(state, "second"), "secondBoard", "board");
  checkCollection(getGraveyard(state, "first"), "firstGraveyard", "graveyard");
  checkCollection(getGraveyard(state, "second"), "secondGraveyard", "graveyard");
  checkCollection(getDeck(state, "first"), "firstDeck", "deck");
  checkCollection(getDeck(state, "second"), "secondDeck", "deck");
}














