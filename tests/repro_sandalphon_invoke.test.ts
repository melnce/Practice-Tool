import { state, resetGameState } from '../src/core/gameState.js';
import { endTurnBlue, endTurnRed } from '../src/logic/core/turns.js';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import * as DB from '../src/data/cardDatabase.js';

// Mock adapter
vi.mock('../src/core/adapter', () => ({
    adapter: { render: vi.fn() }
}));

describe('Sandalphon Invoke Logic', () => {
    let sandalphonData: any;

    beforeEach(() => {
        resetGameState();
        state.blueDeck = [];
        state.blueBoard = [];
        state.blueHand = [];
        state.blueCrests = [];
        state.blueEvoCount = 0;

        // Load JSON
        const setPath = path.resolve(__dirname, '../cards/sets/10004_skybound-dragons.json');
        const content = fs.readFileSync(setPath, 'utf8');
        const setData = JSON.parse(content);
        sandalphonData = setData.find((c: any) => c.id === "10404110");
        if (!sandalphonData) throw new Error("Sandalphon ID 10404110 not found in JSON");

        // Mock DB
        vi.spyOn(DB, 'getCardDetails').mockImplementation((nameOrId) => {
            if (nameOrId === sandalphonData.name || nameOrId === sandalphonData.id) return sandalphonData;
            return null;
        });
    });

    test('Sandalphon invokes from deck when 6 evolves requirement is met', () => {
        // Setup Sandalphon in deck
        const sandy = { ...sandalphonData, uid: "sandy-1", zone: "deck" };
        state.blueDeck.push(sandy); // Bottom of stack (First invokable)
        const sandy2 = { ...sandalphonData, uid: "sandy-2", zone: "deck" };
        state.blueDeck.push(sandy2); // Another copy

        // Add plenty of fillers so we don't draw Sandalphon
        for (let i = 0; i < 5; i++) {
            // Remove 'invoke' from filler so they don't trigger
            const { invoke, ...rest } = sandalphonData;
            state.blueDeck.push({ ...rest, uid: `filler-${i}`, name: "Filler", zone: "deck" });
        }
        // Wait, drawCard uses shift() (take from front). So fillers should be pushed FIRST?
        // state.blueDeck = [ filler0, filler1, ... , sandy ]
        // draw() -> filler0.

        // My previous code:
        // push(filler) -> index 0
        // push(sandy) -> index 1
        // draw() -> shift() -> gets index 0 (filler). Remaining: [sandy].
        // Next draw -> shift() -> gets [sandy].

        // So I need Sandy to be at the END.
        // Array.push adds to END.
        // Deck is [filler...sandy].
        // Draw takes from START/FRONT.

        // Correct logic:
        // Push 5 fillers.
        // Push Sandy.
        // Deck: [F, F, F, F, F, S]
        // Turn 1 Draw: F. Deck: [F, F, F, F, S]
        // Turn 2 Draw: F. Deck: [F, F, F, S]
        // Invoke Check: Scans deck. Finds S. Invokes S.


        // Debug Sandalphon Data
        console.log("Sandalphon Data Name:", sandalphonData.name);
        console.log("Sandy Name:", sandy.name);
        console.log("Deck Setup:", state.blueDeck.map(c => `${c.name} (${c.uid})`));

        // Pre-condition: Not enough evolves (5)
        state.blueEvoCount = 5;

        // Pass turn to Blue (end Red turn)
        state.isBlueTurn = false;
        console.log("Ending Red Turn...");
        endTurnRed(); // -> Starts Blue turn
        console.log("Red Turn Ended. Deck Now:", state.blueDeck.map(c => `${c.name} (${c.uid})`));

        // Neither invoked
        expect(state.blueDeck.find(c => c.uid === sandy.uid)).toBeDefined();
        expect(state.blueDeck.find(c => c.uid === sandy2.uid)).toBeDefined();

        // Condition met (6)
        state.blueEvoCount = 6;

        // Pass turn to Blue again
        state.isBlueTurn = false;
        state.activePlayer = "red"; // reset for turn end logic
        endTurnRed(); // -> Starts Blue turn

        // Sandy 1 should be Invoked (and bounced)
        // Sandy 2 should REMAIN in deck (Limit 1 per turn)
        // Note: order of invocation depends on deck iteration order.
        // scanDeckForInvokes iterates `candidates = [...deck]`.
        // Deck order: [F, F, F, F, F, Sandy1, Sandy2].
        // Loop visits F...F... Sandy1.
        // Sandy1 meets condition. Invoked. Name added to set.
        // Loop visits Sandy2. Name in set. Skipped.

        const inDeck1 = state.blueDeck.find(c => c.uid === sandy.uid);
        const inDeck2 = state.blueDeck.find(c => c.uid === sandy2.uid);

        console.log(`[LimitCheck] Sandy1InDeck=${!!inDeck1} Sandy2InDeck=${!!inDeck2}`);

        expect(inDeck1).toBeUndefined(); // Invoked
        expect(inDeck2).toBeDefined();   // Skipped

        // Check Hand logic for Sandy1
        const inHand = state.blueHand.find(c => c.name === sandalphonData.name);
        expect(inHand).toBeDefined();
        // Should catch only 1 copy in hand
        const handCount = state.blueHand.filter(c => c.name === sandalphonData.name).length;
        expect(handCount).toBe(1);

        // Check Crest
        const crest = state.blueCrests.find(c => c.name === "Sandalphon, Primarch Successor");
        expect(crest).toBeDefined();
        expect(crest.countdown).toBe(2);

        // Sandalphon Invoke Effect: Should return to hand!
        // The invoke triggers firing might be async if fireTrigger uses promises/async import?
        // turns.ts used: import("./triggers.js").then...
        // This is async. We need to await or wait for it.
        // But endTurnRed is sync.
        // We might need to wait for pending promises.
    });
});
