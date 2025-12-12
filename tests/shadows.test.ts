
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../src/core/gameState.js';
import { playCard } from '../src/logic/core/playCard.js';
import { cleanupDead } from '../src/logic/core/cleanup.js';
import { handleBanish } from '../src/logic/effects/ops/banish.js';
import { makeUid } from '../src/core/rng.js';

describe('Shadow Generation Logic', () => {
    beforeEach(() => {
        state.blueHand = [];
        state.redBoard = [];
        state.blueDeck = [];
        state.redDeck = [];
        state.blueShadows = 0;
        state.redShadows = 0;
        state.blueGraveyard = [];
        state.blueBoard = [];
        state.bluePP = 10;
        state.isBlueTurn = true;
    });

    it('should increase shadows when playing a spell', () => {
        const spell = {
            uid: makeUid(),
            name: "Test Spell",
            type: "Spell",
            cost: 1,
            spell: [{ op: "sumon", name: "Fairy", count: 1 }] // op doesn't matter much for this test
        };
        state.blueHand = [spell as any];

        playCard(state.blueHand, "blue", 0);

        expect(state.blueShadows).toBe(1);
        expect(state.blueGraveyard.length).toBe(1);
    });

    it('should increase shadows when follower dies', () => {
        const follower = {
            uid: makeUid(),
            name: "Skeleton",
            type: "Follower",
            defense: 1,
            max_defense: 1
        };
        state.blueBoard = [follower as any];

        // Sim damage/kill
        follower.defense = 0;
        cleanupDead();

        expect(state.blueShadows).toBe(1);
        expect(state.blueGraveyard.length).toBe(1);
    });

    it('should NOT increase shadows when banished', () => {
        const follower = {
            uid: makeUid(),
            name: "Ghost",
            type: "Follower",
            defense: 1,
            max_defense: 1
        };
        state.blueBoard = [follower as any];

        handleBanish(follower as any);

        expect(state.blueShadows).toBe(0);
        // Banished pile? Not checked here, but shouldn't be in grave
        expect(state.blueGraveyard.length).toBe(0);
    });
});
