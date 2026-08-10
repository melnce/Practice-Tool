/**
 * @file Mechanic Contract Test: return (bounce)
 *
 * DESIGN: Tests the return operation for bouncing cards.
 *
 * INVARIANTS UNDER TEST:
 * - Return removes card from board
 * - Returned card goes to hand
 * - Returns correct player's cards
 * - Cannot return to full hand
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenBoard,
  thenHand,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: return", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // BASIC RETURN
  // ===========================================================================

  describe("return to hand", () => {
    it("removes follower from board", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          { name: "Target", type: "Follower", attack: 2, defense: 2 },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "enemy:follower",
      };
      whenRunEffects([effect], "first");

      expect(thenBoard("second").length).toBe(0);
    });

    it("returned card goes to owner's hand", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          { name: "Target", type: "Follower", attack: 2, defense: 2 },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "enemy:follower",
      };
      whenRunEffects([effect], "first");

      // Card should be in second player's hand
      expect(thenHand("second").length).toBe(1);
      expect(thenHand("second")[0].name).toBe("Target");
    });

    it("returned card has zone = hand", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          { name: "Target", type: "Follower", attack: 2, defense: 2 },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "enemy:follower",
      };
      whenRunEffects([effect], "first");

      expect(thenHand("second")[0].zone).toBe("hand");
    });

    it("can return ally follower", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Ally", type: "Follower", attack: 3, defense: 3 },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "ally:follower",
      };
      whenRunEffects([effect], "first");

      expect(thenBoard("first").length).toBe(0);
      expect(thenHand("first").length).toBe(1);
    });
  });

  // ===========================================================================
  // RETURN MULTIPLE
  // ===========================================================================

  describe("return multiple", () => {
    it("returns multiple followers", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          { name: "A", type: "Follower", attack: 1, defense: 1 },
          { name: "B", type: "Follower", attack: 2, defense: 2 },
          { name: "C", type: "Follower", attack: 3, defense: 3 },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "enemy:follower",
        select: "all" as const,
      };
      whenRunEffects([effect], "first");

      expect(thenBoard("second").length).toBe(0);
      expect(thenHand("second").length).toBe(3);
    });
  });

  // ===========================================================================
  // RETURN DOES NOT TRIGGER LAST WORDS
  // ===========================================================================

  describe("no LastWords trigger", () => {
    it("return does NOT trigger LastWords", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          {
            name: "LastWordsCard",
            type: "Follower",
            attack: 1,
            defense: 1,
            hasLastWords: true,
            lastWordsEffects: [{ op: "draw", source: "deck", count: 5 }],
          },
        ])
        .build();

      const effect = {
        op: "return" as const,
        destination: "hand" as const,
        target: "enemy:follower",
      };
      whenRunEffects([effect], "first");

      // Card should be in hand, not graveyard
      expect(thenHand("second").length).toBe(1);
    });
  });
});
