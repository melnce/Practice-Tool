/**
 * @file Mechanic Contract Test: enhance
 *
 * DESIGN: Tests the enhance mechanic structure.
 *
 * NOTE: Enhance is evaluated during card play (playCard flow), not as a standalone
 * effect operation or gate condition. Gate evaluation happens at play time when
 * there's enough PP.
 *
 * INVARIANTS UNDER TEST:
 * - Cards can have enhance object with cost and effects
 * - Cards can have multiple enhanceTiers
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: enhance", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // ENHANCE STRUCTURE
  // ===========================================================================

  describe("enhance structure", () => {
    it("card with enhance has correct structure", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "EnhanceCard",
            type: "Follower",
            attack: 2,
            defense: 2,
            cost: 3,
            enhance: {
              cost: 7,
              effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
            },
          },
        ])
        .build();

      const card = findOnBoard("first", "EnhanceCard");
      expect(card!.enhance).toBeDefined();
      expect(card!.enhance!.cost).toBe(7);
      expect(card!.enhance!.effects).toBeDefined();
    });
  });

  // ===========================================================================
  // MULTIPLE ENHANCE LEVELS (enhanceTiers)
  // ===========================================================================

  describe("multiple enhance levels", () => {
    it("card can have multiple enhance tiers", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "MultiEnhance",
            type: "Follower",
            attack: 1,
            defense: 1,
            cost: 2,
            enhanceTiers: [
              {
                cost: 5,
                effects: [
                  { op: "stat", target: "self", attack: 2, defense: 0 },
                ],
              },
              {
                cost: 8,
                effects: [
                  { op: "stat", target: "self", attack: 5, defense: 0 },
                ],
              },
            ],
          },
        ])
        .build();

      const card = findOnBoard("first", "MultiEnhance");
      expect(card!.enhanceTiers).toBeDefined();
      expect(card!.enhanceTiers!.length).toBe(2);
      expect(card!.enhanceTiers![0].cost).toBe(5);
      expect(card!.enhanceTiers![1].cost).toBe(8);
    });
  });
});
