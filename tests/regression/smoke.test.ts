import { describe, it, expect, beforeEach } from "vitest";

// Import from compiled dist via #imports mapped in package.json
import { state, resetGameState } from "../../src/core/gameState";
import { startGame } from "../../src/logic/startGame";
import { playCard } from "../../src/logic/core/playCard";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns";
import { runEffects } from "../../src/logic/core/effects";
// Type-only import
import type { CardInstance } from "../../src/core/types";

declare const process: any;

describe("Smoke tests", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  it("Scenario A: Start Game", async () => {
    console.log("--- Scenario A: Start Game ---");

    // We need to ensure decks are loaded. startGame loads example_deck if empty.
    await startGame();

    expect(state.gameStarted).toBe(true);
    expect(state.players.first.hand.length).toBeGreaterThan(0);
    expect(state.players.second.hand.length).toBeGreaterThan(0);
    expect(state.players.first.hp).toBe(20);
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
      can_attack: false,
    };
    state.players.first.hand = [goblin];
    state.players.first.pp = 1;
    state.isFirstPlayerTurn = true;

    // Play it
    playCard(state.players.first.hand, "first", 0);

    expect(state.players.first.board.length).toBe(1);
    expect(state.players.first.board[0].name).toBe("Goblin");
    expect(state.players.first.pp).toBe(0);
  });

  it("Scenario C: Damage Leader", () => {
    console.log("--- Scenario C: Damage Leader ---");
    state.players.second.hp = 20;

    // Run a direct damage effect
    runEffects(
      [{ op: "damage", amount: 3, target: "enemy:leader" }],
      "first",
      null,
    );

    expect(state.players.second.hp).toBe(17);
  });
});






