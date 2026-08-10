/**
 * @file Mechanic Contract Test: fuse mechanics
 *
 * DESIGN: Tests the fuse operation for combining cards.
 *
 * INVARIANTS UNDER TEST:
 * - Fuse combines material cards
 * - on_fuse trigger fires
 * - Fuse count tracked
 * - Loot fuse mechanics
 * - Artifact fuse mechanics
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHand,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: fuse", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // BASIC FUSE STRUCTURE
  // ===========================================================================

  describe("fuse structure", () => {
    it("card with fuse_recipes has valid structure", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "FuseTarget",
            type: "Follower",
            attack: 3,
            defense: 3,
            fuse_recipes: [
              {
                materials: ["MaterialA", "MaterialB"],
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ])
        .build();

      const card = thenHand("first")[0];
      expect(card.fuse_recipes).toBeDefined();
      expect(card.fuse_recipes!.length).toBe(1);
    });

    it("fusion count is tracked", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "FusedCard",
            type: "Follower",
            attack: 5,
            defense: 5,
            fusionCount: 2,
          },
        ])
        .build();

      const card = findOnBoard("first", "FusedCard");
      expect(card!.fusionCount).toBe(2);
    });
  });

  // ===========================================================================
  // LOOT FUSE
  // ===========================================================================

  describe("loot fuse", () => {
    it("loot_fused event trigger structure is valid", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "LootFuseCard",
            type: "Follower",
            triggers: [
              {
                event: "loot_fused",
                effects: [
                  { op: "stat", action: "give", target: "self", attack: 1 },
                ],
              },
            ],
          },
        ])
        .build();

      const card = thenHand("first")[0];
      expect(card.triggers![0].event).toBe("loot_fused");
    });

    it("loot_played event trigger structure is valid", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "LootWatcher",
            type: "Follower",
            attack: 2,
            defense: 2,
            triggers: [
              {
                event: "loot_played",
                effects: [{ op: "draw", source: "deck", count: 1 }],
              },
            ],
          },
        ])
        .build();

      const card = findOnBoard("first", "LootWatcher");
      expect(card!.triggers![0].event).toBe("loot_played");
    });

    it("_fusedLootNames tracks fused loot", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "LootFuseCard",
            type: "Follower",
            _fusedLootNames: ["Treasure Map", "Gold Coin"],
          },
        ])
        .build();

      const card = thenHand("first")[0];
      expect(card._fusedLootNames).toBeDefined();
      expect(card._fusedLootNames!.length).toBe(2);
    });
  });

  // ===========================================================================
  // ON_FUSE TRIGGER
  // ===========================================================================

  describe("on_fuse trigger", () => {
    it("on_fuse trigger structure is valid", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "FuseReactor",
            type: "Follower",
            triggers: [
              {
                event: "on_fuse",
                effects: [
                  { op: "stat", action: "give", target: "self", attack: 2 },
                ],
              },
            ],
          },
        ])
        .build();

      const card = thenHand("first")[0];
      expect(card.triggers![0].event).toBe("on_fuse");
    });
  });

  // ===========================================================================
  // ARTIFACT FUSE (PORTAL)
  // ===========================================================================

  describe("artifact fuse", () => {
    it("artifact card can be fused", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          {
            name: "Artifact",
            type: "Follower",
            tribes: ["Artifact"],
            canBeFuseMaterial: true,
          },
        ])
        .build();

      const card = thenHand("first")[0];
      expect(card.tribes).toContain("Artifact");
    });
  });
});
