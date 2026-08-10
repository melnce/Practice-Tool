/**
 * @file Mechanic Contract Test: gate (STRENGTHENED)
 *
 * DESIGN: Tests the gate operation with various conditions.
 * Gates control conditional effect execution based on game state.
 *
 * INVARIANTS UNDER TEST:
 * - Effects fire ONLY when condition is met
 * - Effects do NOT fire when condition is not met
 * - Multiple gate conditions work
 * - Boundary conditions are handled correctly
 * - Gate checks correct player's state
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenBoard,
  thenHP,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: gate", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // COMBO CONDITION
  // ===========================================================================

  describe("combo condition", () => {
    it("fires effects when combo count meets threshold", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Target", type: "Follower", attack: 1, defense: 5 },
        ])
        .build();

      state.players.first.playsThisTurn = 3;

      const effect = {
        op: "gate" as const,
        condition: "combo",
        count: 3,
        effects: [
          {
            op: "damage" as const,
            target: "ally:follower",
            amount: 2,
          },
        ],
      };
      whenRunEffects([effect], "first");

      const target = findOnBoard("first", "Target");
      expect(target!.defense).toBe(3);
    });

    it("does NOT fire effects when combo count is below threshold", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Target", type: "Follower", attack: 1, defense: 5 },
        ])
        .build();

      state.players.first.playsThisTurn = 2;

      const effect = {
        op: "gate" as const,
        condition: "combo",
        count: 3,
        effects: [
          {
            op: "damage" as const,
            target: "ally:follower",
            amount: 2,
          },
        ],
      };
      whenRunEffects([effect], "first");

      const target = findOnBoard("first", "Target");
      expect(target!.defense).toBe(5);
    });

    it("fires at exact threshold boundary", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Target", type: "Follower", attack: 1, defense: 10 },
        ])
        .build();

      state.players.first.playsThisTurn = 5;

      const effect = {
        op: "gate" as const,
        condition: "combo",
        count: 5,
        effects: [
          {
            op: "damage" as const,
            target: "ally:follower",
            amount: 3,
          },
        ],
      };
      whenRunEffects([effect], "first");

      const target = findOnBoard("first", "Target");
      expect(target!.defense).toBe(7);
    });

    it("combo checks the CASTER's play count, not opponent's", () => {
      // Critical: combo should use owner's plays, not opponent's
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      // First player has 1 play
      state.players.first.playsThisTurn = 1;
      // Second player has 5 plays
      state.players.second.playsThisTurn = 5;

      const effect = {
        op: "gate" as const,
        condition: "combo",
        count: 3,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 5,
          },
        ],
      };
      whenRunEffects([effect], "first");

      // Should NOT fire because first player only has 1 play
      expect(thenHP("second")).toBe(20);
    });

    it("combo(1) always fires if card is played", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.playsThisTurn = 1;

      const effect = {
        op: "gate" as const,
        condition: "combo",
        count: 1,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 3,
          },
        ],
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(17);
    });
  });

  // ===========================================================================
  // RALLY CONDITION
  // ===========================================================================

  describe("rally condition", () => {
    it("fires when rally count meets threshold", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.rally = 10;

      const effect = {
        op: "gate" as const,
        condition: "rally",
        count: 10,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 5,
          },
        ],
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(15);
    });

    it("does NOT fire when rally is below threshold", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.rally = 9;

      const effect = {
        op: "gate" as const,
        condition: "rally",
        count: 10,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 5,
          },
        ],
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(20);
    });
  });

  // ===========================================================================
  // NECROMANCY CONDITION
  // ===========================================================================

  describe("necromancy condition", () => {
    it("fires and consumes shadows when shadows >= cost", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.shadows = 6;

      const effect = {
        op: "gate" as const,
        condition: "necromancy",
        cost: 6,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 4,
          },
        ],
      };
      whenRunEffects([effect], "first");

      // Effect should fire
      expect(thenHP("second")).toBe(16);
      // Shadows should be consumed
      expect(state.players.first.shadows).toBe(0);
    });

    it("does NOT fire when shadows < cost", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.shadows = 5;

      const effect = {
        op: "gate" as const,
        condition: "necromancy",
        cost: 6,
        effects: [
          {
            op: "damage" as const,
            target: "enemy:leader",
            amount: 4,
          },
        ],
      };
      whenRunEffects([effect], "first");

      // Effect should NOT fire
      expect(thenHP("second")).toBe(20);
      // Shadows should NOT be consumed
      expect(state.players.first.shadows).toBe(5);
    });
  });
});
