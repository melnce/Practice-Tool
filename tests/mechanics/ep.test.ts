/**
 * @file Mechanic Contract Test: EP (evolution points)
 *
 * DESIGN: Tests evolution point operations.
 *
 * INVARIANTS UNDER TEST:
 * - Recover EP increases count
 * - EP caps at 2
 * - EP is per-player
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: EP", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // RECOVER EP
  // Canonical: { op: "ep", action: "recover", amount: N, player: "self"|"enemy" }
  // ===========================================================================

  describe("ep action: recover", () => {
    it("increases evolution points", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoCharges = 0;

      const effect = {
        op: "ep" as const,
        action: "recover",
        amount: 1,
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.evoCharges).toBe(1);
    });

    it("EP is per-player", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoCharges = 0;
      state.players.second.evoCharges = 1;

      const effect = {
        op: "ep" as const,
        action: "recover",
        amount: 1,
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.evoCharges).toBe(1);
      expect(state.players.second.evoCharges).toBe(1);
    });

    it("EP caps at 2", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoCharges = 1;

      const effect = {
        op: "ep" as const,
        action: "recover",
        amount: 5, // Try to recover more than cap
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.evoCharges).toBeLessThanOrEqual(2);
    });
  });
});
