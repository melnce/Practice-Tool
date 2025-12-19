import { GameState, CardInstance } from "../../core/types.js";

export function checkStateIntegrity(state: GameState) {
    const seen = new Map<CardInstance, string>();

    const checkCollection = (collection: CardInstance[], locationName: string, expectedZone: string) => {
        if (!Array.isArray(collection)) {
            throw new Error(`Invariant Violation: ${locationName} is not an array.`);
        }

        collection.forEach((card, index) => {
            const loc = `${locationName}[${index}]`;

            // Check for duplicates
            if (seen.has(card)) {
                throw new Error(`Invariant Violation: Card object duplicated at ${loc} and ${seen.get(card)}. Card: ${card.name} (${card.uid})`);
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
                    if (expectedZone !== 'deck') {
                        throw new Error(`Invariant Violation: Card at ${loc} has invalid zone '${card.zone}'. Expected '${expectedZone}'. Card: ${card.name}`);
                    }
                }
            }
        });
    };

    checkCollection(state.blueHand, "blueHand", "hand");
    checkCollection(state.redHand, "redHand", "hand");
    checkCollection(state.blueBoard, "blueBoard", "board");
    checkCollection(state.redBoard, "redBoard", "board");
    checkCollection(state.blueGraveyard, "blueGraveyard", "graveyard");
    checkCollection(state.redGraveyard, "redGraveyard", "graveyard");
    checkCollection(state.blueDeck, "blueDeck", "deck");
    checkCollection(state.redDeck, "redDeck", "deck");
}
