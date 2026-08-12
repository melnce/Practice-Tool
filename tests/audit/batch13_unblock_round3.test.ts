/**
 * Round 3 unblock: rich destroyed history and Ward-ignoring attacks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "./setup.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import {
  recordDestroyed,
  type DestroyedRecord,
} from "../../src/logic/core/destroyedHistory.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import "../../src/logic/core/effects/index.js";

describe("Unblock round 3 — destroyed history / ignores Ward", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("adds seeded random fresh cards matching destroyed history", () => {
    const run = (seed: number): string[] => {
      givenGameState({ seed, activePlayer: "first" }).build();
      state.gameStarted = true;
      state.phase = "main";

      const destroyed = [
        createCard("90071130", "graveyard", "first"),
        createCard("90071140", "graveyard", "first"),
        createCard("90071150", "graveyard", "first"),
        createCard("90071130", "graveyard", "first"),
      ];
      for (const card of destroyed) recordDestroyed(state, "first", card);

      const history = state.players.first.destroyedHistory;
      expect(history[0]).toMatchObject({
        id: "90071130",
        cardId: "90071130",
        baseCost: 1,
        tribes: ["Artifact"],
        hasLastWords: false,
      } satisfies Partial<DestroyedRecord>);

      whenRunEffects(
        [
          {
            op: "add_to_hand",
            source: "destroyed_match",
            count: 2,
            filter: {
              type: "Follower",
              tribe: "Artifact",
              base_cost_lte: 3,
            },
            distinct_by: "name",
            distribution: "random",
          },
        ],
        "first",
      );

      const hand = getHand(state, "first");
      expect(hand).toHaveLength(2);
      expect(new Set(hand.map((card) => card.name)).size).toBe(2);
      expect(
        hand.every((card) => !destroyed.some((old) => old.uid === card.uid)),
      ).toBe(true);
      return hand.map((card) => card.name);
    };

    expect(run(73)).toEqual(run(73));
  });

  it("ignores Ward when attacking a non-Ward follower", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstBoard([
        {
          name: "Wardbreaker",
          type: "Follower",
          cost: 2,
          attack: 3,
          defense: 3,
          can_attack: true,
          attacks_left: 1,
          justPlayed: false,
        },
      ])
      .withSecondBoard([
        {
          name: "Ward",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 5,
          hasWard: true,
        },
        {
          name: "Backliner",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 5,
        },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const attacker = getBoard(state, "first")[0]!;
    applyKeyword(attacker, "Ignores Ward");
    expect(attacker.ignoresWard).toBe(true);

    attackFollower(0, 1, "first", "second");

    expect(getBoard(state, "second")[0]?.name).toBe("Ward");
    expect(getBoard(state, "second")[1]?.defense).toBe(2);
    expect(attacker.attacks_left).toBe(0);
  });
});
