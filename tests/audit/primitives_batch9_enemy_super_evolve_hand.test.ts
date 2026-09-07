/**
 * Batch 9 — enemy_super_evolve hand trigger primitive (Inspirational One / Dogged One).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { hasKeyword } from "../../src/logic/core/keywords/has.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import "../../src/logic/core/effects/index.js";

describe("enemy_super_evolve hand trigger primitive", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("hand follower gains keyword when opponent super-evolves", () => {
    givenGameState({ seed: 1, activePlayer: "second", roundCount: 7 })
      .withFirstHand(["10302110"])
      .build();
    state.players.second.superEvoCharges = 1;
    state.players.second.evoCharges = 2;
    const foe = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    applyKeywordsFromList(foe);
    state.players.second.board = [foe];
    whenSuperEvolve(foe, "second");
    const insp = thenHand("first").find((c) => c.name === "Inspirational One")!;
    expect(hasKeyword(insp, "Bane")).toBe(true);
  });
});
