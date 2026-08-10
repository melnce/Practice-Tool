/**
 * @file Regression Test: Opulent Rose Queen
 * UNVERIFIED — owner to audit card-text correctness post-overhaul.
 * Tests the transform filter cost_lte functionality.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "../mechanics/setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";

describe("Regression: Opulent Rose Queen", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe("transform cost_lte filter", () => {
    it("only transforms cards costing 2 or less", () => {
      // Setup: Hand with Forestcraft cards of varying costs
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "LowCost1", type: "Spell", cost: "1", class: "Forestcraft" },
          {
            name: "LowCost2",
            type: "Follower",
            cost: "2",
            class: "Forestcraft",
          },
          { name: "MidCost", type: "Spell", cost: "3", class: "Forestcraft" },
          {
            name: "HighCost",
            type: "Follower",
            cost: "5",
            class: "Forestcraft",
          },
          { name: "OtherClass", type: "Spell", cost: "1", class: "Swordcraft" },
        ])
        .build();

      const sourceCard = {
        name: "Opulent Rose Queen",
        type: "Follower",
        uid: "test-orq",
      } as any;

      // The Opulent Rose Queen effect
      const effects = [
        {
          op: "transform" as const,
          target: "ally:hand",
          filter: {
            class: "Forestcraft",
            cost_lte: 2,
          },
          into: "Bramble Burst",
        },
      ];

      runEffects(effects as any, "first", sourceCard, { variables: {} });

      const hand = state.players.first.hand;

      // Should have 5 cards still
      expect(hand.length).toBe(5);

      // LowCost1 and LowCost2 should be transformed to Bramble Burst
      const brambleBursts = hand.filter((c) => c.name === "Bramble Burst");
      expect(brambleBursts.length).toBe(2);

      // MidCost, HighCost, and OtherClass should NOT be transformed
      expect(hand.some((c) => c.name === "MidCost")).toBe(true);
      expect(hand.some((c) => c.name === "HighCost")).toBe(true);
      expect(hand.some((c) => c.name === "OtherClass")).toBe(true);
    });
  });
});
