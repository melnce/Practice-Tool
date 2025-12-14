import { expect, test, describe } from 'vitest';
import { state, resetGameState } from '../../src/core/gameState';
import { summonNamed } from '../../src/logic/effects/ops/summon_ops/direct';

describe('GameState Identity', () => {
    test('arrays preserve identity across resets', () => {
        // Ensure initialized
        if (!state.lastSummoned) (state as any).lastSummoned = [];

        const deckRef = state.blueDeck;
        const handRef = state.blueHand;
        const lsRef = state.lastSummoned;

        state.blueDeck.push({ uid: 'test' } as any);
        state.lastSummoned!.push({ uid: 'test' } as any);

        resetGameState();

        expect(state.blueDeck).toBe(deckRef);
        expect(state.blueDeck.length).toBe(0);
        expect(state.blueHand).toBe(handRef);

        expect(state.lastSummoned).toBeDefined();
        expect(state.lastSummoned).toBe(lsRef);
        expect(state.lastSummoned!.length).toBe(0);
    });

    test('summonNamed preserves lastSummoned identity', () => {
        // Ensure initialized
        if (!state.lastSummoned) (state as any).lastSummoned = [];

        const lsRef = state.lastSummoned;
        state.lastSummoned!.push({ uid: 'prev' } as any);

        // Call summonNamed with invalid card to trigger the clear logic (start of function)
        // without needing DB setup or side effects.
        summonNamed({ op: 'summon_named', name: 'INVALID_CARD_999' } as any, 'blue');

        expect(state.lastSummoned).toBe(lsRef);
        expect(state.lastSummoned!.length).toBe(0);
    });
});


