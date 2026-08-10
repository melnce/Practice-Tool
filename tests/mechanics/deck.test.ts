/**
 * @file Mechanic Contract Test: deck operations
 *
 * DESIGN: Tests deck manipulation operations.
 *
 * CANONICAL DECK OPERATIONS:
 * - action: "replace" - Replace deck with cards from set or list
 * - action: "cost" - Modify cost of cards in deck
 *
 * NOTE: There's no canonical "add", "shuffle", or "add_top" action.
 * Deck shuffling happens automatically via shuffleInPlace.
 *
 * INVARIANTS UNDER TEST:
 * - Replace deck from list works
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: deck", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // REPLACE DECK
  // Canonical: { op: "deck", action: "replace", cards: [{ name: "X", count: N }] }
  // ===========================================================================

  describe("deck action: replace", () => {
    it("replaces deck with specified cards", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.deck = [];

      const effect = {
        op: "deck" as const,
        action: "replace",
        cards: [{ name: "Fairy", count: 3 }],
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.deck.length).toBe(3);
    });
  });

  // ===========================================================================
  // DECK STRUCTURE
  // ===========================================================================

  describe("deck structure", () => {
    it("deck contains CardInstance objects", () => {
      givenGameState({ seed: 1 })
        .withFirstDeck([
          { name: "A", type: "Follower", attack: 1, defense: 1 },
          { name: "B", type: "Follower", attack: 2, defense: 2 },
        ])
        .build();

      expect(state.players.first.deck.length).toBe(2);
      expect(state.players.first.deck[0].name).toBeDefined();
    });
  });
});
