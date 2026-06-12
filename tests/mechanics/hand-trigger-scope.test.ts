/**
 * C2/C1 — Board triggers must not fire from hand during turn boundaries.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHand, getShadows } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("hand trigger zone scope", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("board EOT debuff in hand does not fire on end turn", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const debuffer = createCard(
      {
        name: "Hand Debuffer",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "stat",
                action: "give",
                target: "enemy:follower",
                attack: -1,
                defense: 0,
              },
            ],
          },
        ],
      },
      "hand",
      "first",
    );
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 4 },
      "board",
      "second",
    );
    enemy.peak_defense = 4;

    state.players.first.hand = [debuffer];
    state.players.second.board = [enemy];

    whenEndTurn();

    expect(Number(enemy.attack)).toBe(2);
    expect(Number(enemy.defense)).toBe(4);
  });

  it("Fediel in hand does not EOT-debuff enemies during shadow farming", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 10 })
      .withFirstHand(["10251120", "10454110"])
      .withFirstPP(10, 10)
      .build();

    const blocker = createCard(
      { name: "Blocker", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    blocker.peak_defense = 5;
    state.players.second.board = [blocker];

    whenEndTurn();

    expect(Number(blocker.attack)).toBe(2);
    expect(Number(blocker.defense)).toBe(5);
    expect(getHand(state, "first").some((c) => c.name?.includes("Fediel"))).toBe(
      true,
    );
  });

  it("hand-scoped EOT trigger still fires from hand", () => {
    givenGameState({ seed: 4, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();

    const handWatcher = createCard(
      {
        name: "Hand Watcher",
        type: "Follower",
        cost: 5,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "end_of_turn",
            source: "hand",
            condition: { whose_turn: "owner" },
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "hand",
      "first",
    );
    state.players.first.hand = [handWatcher];
    expect(getShadows(state, "first")).toBe(0);

    whenEndTurn();

    expect(getShadows(state, "first")).toBe(1);
  });
});
