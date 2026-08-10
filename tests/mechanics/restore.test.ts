/**
 * @file Mechanic Contract Test: restore (heal)
 *
 * DESIGN: Tests the restore operation for healing followers and leaders.
 *
 * INVARIANTS UNDER TEST:
 * - Restore increases defense/HP by exact amount
 * - Restore cannot exceed max HP/defense
 * - Restore targets correct player
 * - Restore 0 is a no-op
 * - Full HP restore doesn't create bugs
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHP,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: restore", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // LEADER RESTORE
  // ===========================================================================

  describe("leader restore", () => {
    it("restores leader HP by exact amount", () => {
      givenGameState({ seed: 1 }).withFirstHP(15).build();

      const effect = {
        op: "restore" as const,
        target: "ally:leader",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      expect(thenHP("first")).toBe(20);
    });

    it("restore does NOT exceed max HP (20)", () => {
      givenGameState({ seed: 1 }).withFirstHP(18).build();

      const effect = {
        op: "restore" as const,
        target: "ally:leader",
        amount: 10,
      };
      whenRunEffects([effect], "first");

      // Should cap at 20
      expect(thenHP("first")).toBeLessThanOrEqual(20);
    });

    it("restore at full HP does nothing", () => {
      givenGameState({ seed: 1 }).withFirstHP(20).build();

      const effect = {
        op: "restore" as const,
        target: "ally:leader",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      expect(thenHP("first")).toBe(20);
    });

    it("restores ally leader, not enemy", () => {
      givenGameState({ seed: 1 }).withFirstHP(10).withSecondHP(10).build();

      const effect = {
        op: "restore" as const,
        target: "ally:leader",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      // First player healed
      expect(thenHP("first")).toBe(15);
      // Second player unchanged
      expect(thenHP("second")).toBe(10);
    });

    it("can restore enemy leader when targeted", () => {
      givenGameState({ seed: 1 }).withSecondHP(10).build();

      const effect = {
        op: "restore" as const,
        target: "enemy:leader",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(15);
    });
  });

  // ===========================================================================
  // FOLLOWER RESTORE
  // ===========================================================================

  describe("follower restore", () => {
    it("restores follower defense", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Damaged",
            type: "Follower",
            attack: 3,
            defense: 2,
            peak_defense: 5,
          },
        ])
        .build();

      const effect = {
        op: "restore" as const,
        target: "ally:follower",
        amount: 3,
      };
      whenRunEffects([effect], "first");

      const card = findOnBoard("first", "Damaged");
      expect(card!.defense).toBe(5);
    });

    it("restore does NOT exceed original defense", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Damaged",
            type: "Follower",
            attack: 3,
            defense: 4,
            peak_defense: 5,
          },
        ])
        .build();

      const effect = {
        op: "restore" as const,
        target: "ally:follower",
        amount: 10,
      };
      whenRunEffects([effect], "first");

      const card = findOnBoard("first", "Damaged");
      // Should not exceed maxDefense
      expect(card!.defense).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("edge cases", () => {
    it("restore 0 does nothing", () => {
      givenGameState({ seed: 1 }).withFirstHP(10).build();

      const effect = {
        op: "restore" as const,
        target: "ally:leader",
        amount: 0,
      };
      whenRunEffects([effect], "first");

      expect(thenHP("first")).toBe(10);
    });
  });
});
