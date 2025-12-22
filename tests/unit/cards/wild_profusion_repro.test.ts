import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, state } from '../../../src/core/gameState';
import { playCard } from '../../../src/logic/core/playCard/index'; // Explicit index
import { getCardDetails } from '../../../src/data/cardDatabase';

// Helper to create a card instance for testing
function createCard(id: string, owner: 'blue' | 'red') {
    const details = getCardDetails(id);
    if (!details) throw new Error(`Card definitions not found for ID: ${id}`);

    // Mimic deckLoader.ts enrichDeck logic
    const card: any = { ...details };
    card.uid = state.rng.makeUid();
    card.owner = owner;

    // Initialize common properties if needed
    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    if (!card.keywords) card.keywords = [];

    return card;
}

describe('Wild Profusion (Bug Repro)', () => {
    beforeEach(() => {
        // Reset game state
        state.init();
        // Initialize simple RNG seed if needed, usually init() handles it with default 0
    });

    it('should deal 1 damage to a random enemy follower when a Pixie enters', () => {
        // 1. Setup Wild Profusion on board (Amulet)
        // ID 10011210: Wild Profusion
        const wildProfusion = createCard('10011210', 'blue');

        // We must play it to trigger "Fanfare" or manually setup its state if we just push to board.
        // But Wild Profusion's effect is an amulet ongoing effect / engaged effect?
        // Description: "Fanfare: Add a Fairy to your hand. Countdown (2). Whenever an allied Pixie follower enters the field, deal 1 damage to a random enemy follower."
        // This is an ongoing effect (triggers).
        // If we just push to board, we must ensure keywords are applied.
        // The playCard function handles keyword application.
        // So let's play it.

        state.bluePP = 10;
        state.blueHand.push(wildProfusion);
        playCard(wildProfusion, 'blue', 0);

        expect(state.blueBoard.length).toBe(1);
        const onBoardProfusion = state.blueBoard[0];
        // Check if PixieEnter keyword was applied (this confirms if logic *thinks* it has it)
        // The bug is that playCard checks `card.hasPixieEnter` but `apply` sets `ks.hasPixieEnter`.

        // 2. Setup Enemy Follower
        // ID 90001110: Goblin
        const goblin = createCard('90001110', 'red');
        state.redBoard.push(goblin);
        expect(goblin.defense).toBe(2);

        // 3. Play a Fairy (Pixie)
        // ID 90011110: Fairy
        const fairy = createCard('90011110', 'blue');
        state.blueHand.push(fairy);

        playCard(fairy, 'blue', 0);

        // 4. Assert Damage
        // Goblin should take 1 damage (2 -> 1)
        expect(goblin.defense).toBe(1, "Goblin should have taken 1 damage from Wild Profusion");
    });
});
