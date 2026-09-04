import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { checkStateIntegrity } from "../../src/logic/debug/stateIntegrity.js";
import { getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("Scenario: End of Turn Delayed Triggers", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20, 20)
      .withSecondHP(20, 20)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  afterEach(() => {
    checkStateIntegrity(state);
  });

  it("fires delayed effects at end of turn and cleans up", () => {
    const ally = createCard(
      {
        name: "TriggerUnit",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "damage", amount: 1, target: "enemy:leader" }],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [ally];

    expect(getHP(state, "second")).toBe(20);
    runEndOfTurnBoundary("first");
    expect(getHP(state, "second")).toBe(19);
  });

  it("does NOT fire opponent end-of-turn triggers on owner's boundary", () => {
    const enemy = createCard(
      {
        name: "EnemyUnit",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "damage", amount: 5, target: "enemy:leader" }],
          },
        ],
      },
      "board",
      "second",
    );
    state.players.second.board = [enemy];

    runEndOfTurnBoundary("first");
    expect(getHP(state, "first")).toBe(20);
  });
});
