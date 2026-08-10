/**
 * @file Regression Test: Skullfane of Demise
 * UNVERIFIED — owner to audit card-text correctness post-overhaul.
 *
 * Tests the store_count_as -> amount_source variable propagation between
 * destroy and damage effects in chained fanfare.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "../mechanics/setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";

describe("Regression: Skullfane of Demise", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe("store_count_as -> amount_source variable propagation", () => {
    it("damage effect reads destroy_count from previous destroy effect", () => {
      // Setup: First player has 2 amulets, second has 1 follower (enemy)
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Amulet1", type: "Amulet" },
          { name: "Amulet2", type: "Amulet" },
        ])
        .withSecondBoard([
          { name: "EnemyFollower", type: "Follower", attack: 1, defense: 10 },
        ])
        .build();

      // Create source card for context
      const sourceCard = {
        name: "Skullfane",
        type: "Follower",
        uid: "test-skullfane",
      } as any;

      // The Skullfane fanfare: destroy allied amulets, deal damage = count
      const effects = [
        {
          op: "destroy" as const,
          distribution: "all" as const,
          target: "ally:amulet",
          store_count_as: "destroy_count",
        },
        {
          op: "damage" as const,
          distribution: "all" as const,
          target: "enemy:any",
          amount_source: "context.destroy_count",
        },
      ];

      // Record enemy follower's defense before
      const enemyFollower = state.players.second.board[0];
      const defenseBefore = Number(enemyFollower.defense) || 10;

      // Run effects with shared context (simulating onFanfare)
      const sharedContext = { variables: {} };
      runEffects(effects as any, "first", sourceCard, sharedContext);

      // Verify amulets were destroyed
      const amuletCount = state.players.first.board.filter(
        (c) => c?.type === "Amulet",
      ).length;
      expect(amuletCount).toBe(0);

      // Verify damage was dealt to followers (2 amulets = 2 damage)
      const defenseAfter = Number(enemyFollower.defense) || 0;
      expect(defenseBefore - defenseAfter).toBe(2);

      // Verify damage was also dealt to enemy leader
      const leaderHPAfter =
        (state.players.second as any).leaderHP ??
        (state.players.second as any).hp ??
        20;
      expect(20 - leaderHPAfter).toBe(2);
    });

    it("deals 0 damage when no amulets destroyed", () => {
      // Setup: No amulets, only follower on first board
      givenGameState({ seed: 2 })
        .withFirstBoard([
          { name: "MyFollower", type: "Follower", attack: 2, defense: 2 },
        ])
        .withSecondBoard([
          { name: "EnemyFollower", type: "Follower", attack: 1, defense: 10 },
        ])
        .build();

      const sourceCard = {
        name: "Skullfane",
        type: "Follower",
        uid: "test-skullfane2",
      } as any;

      const effects = [
        {
          op: "destroy" as const,
          distribution: "all",
          target: "ally:amulet",
          store_count_as: "destroy_count",
        },
        {
          op: "damage" as const,
          distribution: "all",
          target: "enemy:follower",
          amount_source: "context.destroy_count",
        },
      ];

      const enemyFollower = state.players.second.board[0];
      const defenseBefore = enemyFollower.defense;

      const sharedContext = { variables: {} };
      runEffects(effects, "first", sourceCard, sharedContext);

      // 0 amulets = 0 damage = defense unchanged
      expect(enemyFollower.defense).toBe(defenseBefore);
    });

    it("context.variables is populated after destroy effect", () => {
      givenGameState({ seed: 3 })
        .withFirstBoard([
          { name: "Amulet1", type: "Amulet" },
          { name: "Amulet2", type: "Amulet" },
          { name: "Amulet3", type: "Amulet" },
        ])
        .build();

      const sourceCard = {
        name: "Test",
        type: "Follower",
        uid: "test-card",
      } as any;

      const effects = [
        {
          op: "destroy" as const,
          distribution: "all",
          target: "ally:amulet",
          store_count_as: "my_count",
        },
      ];

      const sharedContext: { variables: Record<string, number> } = {
        variables: {},
      };
      runEffects(effects, "first", sourceCard, sharedContext);

      // Check that variable was stored
      expect(sharedContext.variables.my_count).toBe(3);
    });
  });
});
