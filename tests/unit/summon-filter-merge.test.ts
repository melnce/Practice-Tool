import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  createCard,
  resetUidCounter,
  givenGameState,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const AMULET_LW = "Winged Statue";

function setup(seed = 1): void {
  resetUidCounter();
  givenGameState({ seed, activePlayer: "first", roundCount: 5 }).build();
  state.gameStarted = true;
}

describe("summon filter merge", () => {
  beforeEach(() => setup());

  it("merges filter and condition on destroyed_match summon (both predicates required)", () => {
    const amulet = createCard("10062210", "graveyard", "first");
    amulet.hasLastWords = true;
    recordDestroyed(state, "first", amulet);

    const follower = createCard("10001110", "graveyard", "first");
    follower.hasLastWords = true;
    recordDestroyed(state, "first", follower);

    // count:2 — merged pool has one eligible card; condition-only pool has two.
    whenRunEffects(
      [
        {
          op: "summon",
          source: "destroyed_match",
          count: 2,
          filter: { type: "Amulet" },
          condition: { hasLastWords: true },
        } as any,
      ],
      "first",
    );

    const summoned = getBoard(state, "first");
    expect(summoned).toHaveLength(1);
    expect(summoned[0].name).toBe(AMULET_LW);
  });

  it("filter wins over condition on the same key (type collision)", () => {
    const amulet = createCard("10062210", "graveyard", "first");
    recordDestroyed(state, "first", amulet);

    const follower = createCard("10001110", "graveyard", "first");
    recordDestroyed(state, "first", follower);

    whenRunEffects(
      [
        {
          op: "summon",
          source: "destroyed_match",
          count: 1,
          filter: { type: "Amulet" },
          condition: { type: "Follower" },
        } as any,
      ],
      "first",
    );

    const summoned = getBoard(state, "first");
    expect(summoned).toHaveLength(1);
    expect(summoned[0].name).toBe(AMULET_LW);
  });
});
