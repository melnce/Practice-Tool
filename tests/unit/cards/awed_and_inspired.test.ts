
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../../../src/core/gameState';
import { engageAmulet } from '../../../src/logic/effects/ops/engage';
import { makeCardFromDB } from '../../../src/logic/effects/ops/summon_ops/core';
import masterCardDefinitions from '../../../cards/sets/10004_skybound-dragons.json';
import { CardInstance } from '../../../src/core/types';
import { setPendingTarget } from '../../../src/logic/core/pendingTarget/pendingTarget';
import { resolvePendingTarget } from '../../../src/logic/core/resolveTarget';

import { initCardDatabase } from '../../../src/data/cardIndex';

describe('Awed and Inspired (10461210)', () => {
    beforeEach(() => {
        // Register cards so getCardDetails works for transform
        initCardDatabase({ mainCards: masterCardDefinitions as any[], tokenCards: [] });

        state.blueHand = [];
        state.blueBoard = [];
        state.redBoard = [];
        state.bluePP = 10;
        state.blueMaxPP = 10;
        state.isBlueTurn = true;
        // Mock RNG
        if (!state.rng) state.rng = { makeUid: () => Math.random().toString(36).substr(2, 9), nextInt: () => 0 } as any;

        // Mock Pending Target handling to auto-resolve if possible or we resolve it manually
        // We will resolve manually in the test
    });

    it('should destroy self, transform ally, and draw a card upon engage', () => {
        // 1. Setup Awed and Inspired
        const amuletDef: any = masterCardDefinitions.find((c: any) => c.id === "10461210");
        const amulet = makeCardFromDB(amuletDef, "blue");

        // 2. Setup Ally Follower (Target)
        const fairyDef: any = {
            id: "900000",
            name: "Fairy",
            type: "Follower",
            attack: 1,
            defense: 1,
            cost: 1
        };
        const fairy = makeCardFromDB(fairyDef, "blue");

        // 3. Place on board
        state.blueBoard = [amulet, fairy];
        // Index 0: Amulet, Index 1: Fairy

        // 4. Setup Draw Deck
        const deckCardDef = { ...fairyDef, name: "Deck Fairy" };
        const deckCard = makeCardFromDB(deckCardDef, "blue");
        state.blueDeck = [deckCard];

        const initialHandSize = state.blueHand.length;

        // 5. Engage Amulet (Index 0)
        // This stops at 'select' op
        const actionResult = engageAmulet("blue", 0);

        // 6. Verify Pending Target State
        console.log("Pending Target Eff:", state.pendingTargetEffect?.eff);
        expect(state.pendingTargetEffect).toBeDefined();
        // Engine might wrap select effects in nested_effects for execution
        // if (state.pendingTargetEffect) expect(state.pendingTargetEffect.eff.op).toBe("select");

        // 7. Resolve Selection (Select the Fairy at index 1 -> now index 0 because amulet destroyed?)
        // Wait, 'destroy_self' runs BEFORE 'select'.
        // So Amulet is gone. Fairy is now at index 0.
        expect(state.blueBoard.length).toBe(1);
        expect(state.blueBoard[0].uid).toBe(fairy.uid); // Fairy is the only one left
        expect(state.blueGraveyard.length).toBe(1); // Amulet in grave

        const targetFairy = state.blueBoard[0];

        resolvePendingTarget(targetFairy.uid);

        // 8. Verify Transformation
        // Fairy should now be "Awed and Inspired"
        const transformed = state.blueBoard[0];
        expect(transformed.name).toBe("Awed and Inspired");
        expect(transformed.type).toBe("Amulet"); // It transformed into an amulet

        // 9. Verify Draw
        // Draw op is AFTER select. Does it run?
        expect(state.blueHand.length).toBe(initialHandSize + 1);
        expect(state.blueHand[0].name).toBe("Deck Fairy");
    });
});
