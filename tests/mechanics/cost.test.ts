/**
 * @file Mechanic Contract Test: cost manipulation
 *
 * DESIGN: Tests cost modification operations.
 * CANONICAL FORMAT:
 *   - op: "cost"
 *   - mode: "reduce" | "set" | "modify" | "increase"  (NOT "action")
 *   - target: "self" | "selected" | "pool" | "opponent_hand" | "last_drawn"
 *   - pool: "ally:hand" | "ally:board" etc. (required when target is "pool")
 *
 * INVARIANTS UNDER TEST:
 * - Cost reduction modifies card cost correctly
 * - Cost cannot go below 0
 * - Cost changes target correct cards
 * - Spellboost cost reduction
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHand,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { getHand } from "../../src/core/playerHelpers.js";
import {
  pickEnhanceTiers,
  getEffectiveCost,
  resolvePlayCost,
} from "../../src/logic/core/playCard/cost.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import type { CardInstance } from "../../src/core/types/index.js";

describe("Mechanic Contract: cost", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // COST REDUCTION
  // ===========================================================================

  describe("cost reduction", () => {
    it("reduces card cost by specified amount", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "Expensive",
            type: "Follower",
            cost: 5,
            attack: 1,
            defense: 1,
          },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "reduce",
        target: "pool",
        pool: "ally:hand",
        amount: 2,
      };
      whenRunEffects([effect], "first");

      const card = thenHand("first").find((c) => c.name === "Expensive");
      expect(card!.cost).toBe(3);
    });

    it("cost cannot go below 0", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "Cheap", type: "Follower", cost: 2, attack: 1, defense: 1 },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "reduce",
        target: "pool",
        pool: "ally:hand",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      const card = thenHand("first").find((c) => c.name === "Cheap");
      expect(card!.cost).toBeGreaterThanOrEqual(0);
    });

    it("reduces all matching cards in hand", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "A", type: "Follower", cost: 5, attack: 1, defense: 1 },
          { name: "B", type: "Follower", cost: 4, attack: 1, defense: 1 },
          { name: "C", type: "Follower", cost: 3, attack: 1, defense: 1 },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "reduce",
        target: "pool",
        pool: "ally:hand",
        amount: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      expect(hand.find((c) => c.name === "A")!.cost).toBe(4);
      expect(hand.find((c) => c.name === "B")!.cost).toBe(3);
      expect(hand.find((c) => c.name === "C")!.cost).toBe(2);
    });

    it("does NOT affect enemy hand", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "Ally", type: "Follower", cost: 5, attack: 1, defense: 1 },
        ])
        .withSecondHand([
          { name: "Enemy", type: "Follower", cost: 5, attack: 1, defense: 1 },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "reduce",
        target: "pool",
        pool: "ally:hand",
        amount: 2,
      };
      whenRunEffects([effect], "first");

      expect(thenHand("first")[0].cost).toBe(3);
      expect(thenHand("second")[0].cost).toBe(5);
    });
  });

  // ===========================================================================
  // COST SET
  // ===========================================================================

  describe("cost set", () => {
    it("sets cost to exact value", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "Target", type: "Follower", cost: 8, attack: 1, defense: 1 },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "set",
        target: "pool",
        pool: "ally:hand",
        amount: 1,
      };
      whenRunEffects([effect], "first");

      expect(thenHand("first")[0].cost).toBe(1);
    });

    it("can set cost to 0", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "Target", type: "Follower", cost: 5, attack: 1, defense: 1 },
        ])
        .build();

      const effect = {
        op: "cost" as const,
        mode: "set",
        target: "pool",
        pool: "ally:hand",
        amount: 0,
      };
      whenRunEffects([effect], "first");

      expect(thenHand("first")[0].cost).toBe(0);
    });
  });

  // ===========================================================================
  // PURE READ PATHS (pickEnhanceTiers must not write enhanceTiers onto cards)
  // ===========================================================================

  describe("pickEnhanceTiers is pure on read paths", () => {
    beforeEach(() => {
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
    });

    function snapshotCard(card: CardInstance): string {
      return JSON.stringify(card);
    }

    it("does not add enhanceTiers when inspecting a card without Enhance", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstPP(5, 5)
        .withFirstHand([
          {
            name: "PlainFollower",
            type: "Follower",
            cost: 3,
            attack: 2,
            defense: 2,
            keywords: [{ name: "Rush" }],
          },
        ])
        .build();

      const card = getHand(state, "first")[0]!;
      const hashBefore = hashGameState(state);
      const cardBefore = snapshotCard(card);

      pickEnhanceTiers(card, 5);
      getEffectiveCost(card);
      resolvePlayCost(card, 5);
      canPlayCard(card, "first");

      expect("enhanceTiers" in card).toBe(false);
      expect(snapshotCard(card)).toBe(cardBefore);
      expect(hashGameState(state)).toBe(hashBefore);
    });

    it("returns tiers from Enhance keyword without mutating the card", () => {
      const raise = [
        { op: "stat" as const, target: "self", attack: 2, defense: 0 },
      ];
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstPP(7, 7)
        .withFirstHand([
          {
            name: "EnhanceFollower",
            type: "Follower",
            cost: 3,
            attack: 2,
            defense: 2,
            keywords: [{ name: "Enhance", cost: 5, effects: raise }],
          },
        ])
        .build();

      const card = getHand(state, "first")[0]!;
      const cardBefore = snapshotCard(card);

      const tiers = pickEnhanceTiers(card, 7);
      canPlayCard(card, "first");

      expect(tiers).toEqual([{ cost: 5, effects: raise }]);
      expect("enhanceTiers" in card).toBe(false);
      expect(snapshotCard(card)).toBe(cardBefore);
    });
  });

  // ===========================================================================
  // SPELLBOOST (canonical format: target: "ally:hand")
  // ===========================================================================

  describe("spellboost", () => {
    it("increments spellboost counter on card", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "SpellboostCard",
            type: "Spell",
            cost: 10,
            keywords: [{ name: "Spellboost" }],
            spellboostCount: 0,
          },
        ])
        .build();

      const effect = {
        op: "spellboost" as const,
        target: "ally:hand",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const card = thenHand("first")[0];
      expect(card.spellboostCount).toBe(1);
    });

    it("spellboost reduces cost (if card has cost reduction per boost)", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "SpellboostCard",
            type: "Spell",
            cost: 10,
            keywords: [{ name: "Spellboost", reduceCostBy: 1, minCost: 0 }],
            spellboostCount: 0,
          },
        ])
        .build();

      const card = thenHand("first")[0];
      applyKeywordsFromList(card);

      const effect = {
        op: "spellboost" as const,
        target: "ally:hand",
        count: 3,
      };
      whenRunEffects([effect], "first");

      // Cost should reduce by 3 (1 per boost)
      expect(card.cost).toBe(7);
    });
  });
});
