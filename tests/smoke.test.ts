import { describe, it, expect, beforeEach } from "vitest";

// Import from compiled dist via #imports mapped in package.json
import { state, resetGameState } from "../src/core/gameState";
import { startGame } from "../src/logic/startGame";
import { playCard } from "../src/logic/core/playCard";
import { endTurnBlue, endTurnRed } from "../src/logic/core/turns";
import { runEffects } from "../src/logic/core/effects";
// Type-only import
import type { CardInstance } from "../src/core/types";

declare const process: any;

describe("Smoke tests", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("Scenario A: Start Game", async () => {
        console.log("--- Scenario A: Start Game ---");

        // We need to ensure decks are loaded. startGame loads example_deck if empty.
        await startGame();

        expect(state.gameStarted).toBe(true);
        expect(state.blueHand.length).toBeGreaterThan(0);
        expect(state.redHand.length).toBeGreaterThan(0);
        expect(state.blueHP).toBe(20);
        expect(state.turnCount >= 1 || state.roundCount >= 1).toBe(true);
    });

    it("Scenario B: Play Follower", async () => {
        console.log("--- Scenario B: Play Follower ---");
        await startGame();

        // Force add a known follower to Blue Hand
        const goblin: CardInstance = {
            uid: "test_goblin",
            name: "Goblin",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 2,
            can_attack: false
        };
        state.blueHand = [goblin];
        state.bluePP = 1;
        state.isBlueTurn = true;

        // Play it
        playCard(state.blueHand, "blue", 0);

        expect(state.blueBoard.length).toBe(1);
        expect(state.blueBoard[0].name).toBe("Goblin");
        expect(state.bluePP).toBe(0);
    });

    it("Scenario C: Damage Leader", () => {
        console.log("--- Scenario C: Damage Leader ---");
        state.redHP = 20;

        // Run a direct damage effect
        runEffects([{ op: "damage", amount: 3, target: "enemy:leader" }], "blue", null);

        expect(state.redHP).toBe(17);
    });
});
