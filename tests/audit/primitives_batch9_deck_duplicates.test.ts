/**
 * Batch 9 — deck_duplicates banish primitive (Tablet of Tribulations).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenDeck,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import "../../src/logic/core/effects/index.js";

describe("deck_duplicates banish primitive", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("scope deck_duplicates keeps one copy per name", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10303210"])
      .withFirstPP(3, 6)
      .withFirstDeck([
        { name: "A", type: "Follower", attack: 1, defense: 1 },
        { name: "A", type: "Follower", attack: 1, defense: 1 },
        { name: "B", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    whenPlayCard("first", 0);
    const deck = thenDeck("first");
    expect(deck.filter((c) => c.name === "A")).toHaveLength(1);
    expect(deck.filter((c) => c.name === "B")).toHaveLength(1);
  });
});
