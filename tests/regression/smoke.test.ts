import { describe, it, expect, beforeEach } from "vitest";

import { state, resetGameState } from "../../src/core/gameState";
import { startGame } from "../../src/logic/startGame";
import { playCard } from "../../src/logic/core/playCard";
import { runEffects } from "../../src/logic/core/effects";
import type { CardInstance } from "../../src/core/types";

const START_OPTS = {
  deckAId: "0_testing_vanilla",
  deckBId: "0_testing_vanilla",
  seed: 1,
};

describe("Smoke tests", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  it("Scenario A: Start Game reaches mulligan (turn 0)", async () => {
    await startGame(START_OPTS);

    expect(state.gameStarted).toBe(true);
    expect(state.phase).toBe("mulligan");
    expect(state.turnNumber).toBe(0);
    expect(state.players.first.hand.length).toBeGreaterThan(0);
    expect(state.players.second.hand.length).toBeGreaterThan(0);
    expect(state.players.first.hp).toBe(20);
  });

  it("Scenario B: Play Follower", async () => {
    await startGame(START_OPTS);

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
    state.activePlayer = "first";
    state.phase = "main";

    playCard(state.players.first.hand, "first", 0);

    expect(state.players.first.board.length).toBe(1);
    expect(state.players.first.board[0]!.name).toBe("Goblin");
    expect(state.players.first.pp).toBe(0);
  });

  it("Scenario C: Damage Leader", () => {
    state.players.second.hp = 20;

    runEffects(
      [{ op: "damage", amount: 3, target: "enemy:leader" }],
      "first",
      null,
    );

    expect(state.players.second.hp).toBe(17);
  });
});
