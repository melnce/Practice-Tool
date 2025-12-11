
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { state, resetGameState } from "#core/gameState";
import { startGame } from "#logic/startGame";
import { playCard } from "#logic/core/playCard";
import { endTurnBlue, endTurnRed } from "#logic/core/turns";
import { makeUid } from "#core/rng";
import { loadCardDatabase } from "#data/cardDatabase";
import { vanillaFollower, damageSpell, evolveFollower as evoCardFixture } from "./utils/testCards";

describe("Integration Simulation", () => {
    beforeAll(async () => {
        // Ensure DB is loaded so keyword checks etc work
        await loadCardDatabase();
    });

    beforeEach(() => {
        resetGameState();
    });

    it("should simulate a mini game flow", async () => {
        // 1. Start Game
        // This will try to load decks from FS mock. 
        // We let it happen, then overwrite the state.
        await startGame();

        // 2. Setup Decks & Hands Manually
        // Blue has 3 cards: Vanilla, Damage Spell, Evolve Unit
        state.blueDeck = [];
        state.blueHand = [
            { ...vanillaFollower, uid: makeUid(), owner: "blue", cost: 1 },
            { ...damageSpell, uid: makeUid(), owner: "blue", cost: 2, spell: damageSpell.spell },
            { ...evoCardFixture, uid: makeUid(), owner: "blue", cost: 2, can_evolve: true }
        ];

        // Red has small deck
        state.redDeck = [];
        state.redHand = [
            { ...vanillaFollower, uid: makeUid(), owner: "red", cost: 1 }
        ];

        // Force Turn 1 state
        state.bluePP = 1;
        state.blueMaxPP = 1;
        state.isBlueTurn = true;

        // 3. Play Follower (Blue Turn 1)
        // Card at index 0 is "Vanilla Follower"
        expect(state.blueHand[0].name).toBe("Vanilla Follower");

        // playCard(hand, player, index)
        playCard(state.blueHand, "blue", 0);

        expect(state.blueBoard.length).toBe(1);
        expect(state.blueHand.length).toBe(2); // Two left
        expect(state.bluePP).toBe(0);

        // 4. End Turn Blue -> Red Turn 1
        endTurnBlue();
        expect(state.isBlueTurn).toBe(false);
        // Red logic
        expect(state.redPP).toBeGreaterThanOrEqual(1);

        // 5. Red Plays from index 0
        playCard(state.redHand, "red", 0);
        expect(state.redBoard.length).toBe(1);

        endTurnRed(); // -> Blue Turn 2

        // 6. Blue Turn 2: Play Damage Spell
        // Check spell is now at index 0 (since index 0 was played previously)
        // Wait, splice shifts indices. yes.
        expect(state.isBlueTurn).toBe(true);
        expect(state.blueMaxPP).toBe(2);

        const spellIndex = state.blueHand.findIndex(c => c.name === "Damage Spell");
        expect(spellIndex).toBeGreaterThanOrEqual(0);

        // We know Damage Spell targets "enemy:follower".
        // playCard() handles spells by running effects.
        // BUT logic/playCard.ts says: `if (isSpell && spellNeedsTarget(card, player)) ...`
        // It uses `spellNeedsTarget` which calls `getPool`.
        // If it needs a target and none provided (playCard args don't take target context), 
        // logic/playCard usually assumes UI interaction or simple auto-targeting?
        // Wait, `playCard` signature is `(fromHand, player, index)`. No target arg.
        // It relies on `state.pendingTargetEffect` or something?
        // Checking `playCard.ts`: 
        // `if (isSpell && spellNeedsTarget(card, player)) { console.warn(...); return; }`
        // It fails if target needed! :O
        // This means `playCard` is NOT the full entry point for targeted spells?
        // OR `spellNeedsTarget` returns false if we have a valid target?
        // `spellNeedsTarget` checks if effects have `select`.
        // `damageSpell.spell` has `target: "enemy:follower"`. Does it have `select`?
        // My `testCards.ts` had: `{ op: "damage", target: "enemy:follower", amount: 3 }`
        // It did NOT have `select: true`.
        // If `select` is missing, `spellNeedsTarget` loop skips it.
        // So `getPool` is NOT called. `runEffects` is called.
        // `runEffects` with a target string usually auto-resolves if it's "enemy:follower"?
        // `resolveTarget` handles strings.
        // So "non-selective" targeting spells should work fine via playCard.
        // Selective ones (requiring user click) fail in `playCard` if called directly without setup.
        // My test card is "Damage Spell" with `{ op: "damage", target: "enemy:follower" }`.
        // This implicitly assumes auto-targeting or "all"? 
        // Usually "enemy:follower" means ALL or ONE?
        // If I want "deal 3 to AN enemy follower", it implies selection.
        // But if I didn't put `select: true`, logical interpretation is... generic?
        // In this engine, lacking `select: true` often means "auto-target if deterministic or all"?
        // Actually, if `target` is present but `select` isn't, `runEffects` calls `resolveTarget`.
        // `resolveTarget("enemy:follower")` returns ALL enemy followers?
        // If so, Damage Spell becomes AOE?
        // Let's assume for this integration test, it hits SOMETHING.
        // If it hits all, good. If it hits random (if `random: true`), good.
        // My integration test just waits for result.

        const redUnit = state.redBoard[0];
        const initialDef = redUnit.defense as number;

        playCard(state.blueHand, "blue", spellIndex);

        // Spell should have fired.
        // Check if red unit took damage.
        const redUnitAfter = state.redBoard[0]; // might be same object ref
        if (redUnitAfter) {
            expect(redUnitAfter.defense).toBeLessThan(initialDef);
        } else {
            // Destroyed
            expect(state.redBoard.length).toBe(0);
        }
    });
});
