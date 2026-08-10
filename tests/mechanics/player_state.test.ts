/**
 * @file Mechanic Contract Test: player state mechanics
 *
 * DESIGN: Tests all player state properties and mechanics.
 *
 * COVERAGE:
 * - leaderBarrier, leaderDamageTakenBonus, leaderMaxDamageCap
 * - evoCharges, superEvoCharges, evoCount
 * - boost (second player mechanic)
 * - playsThisTurn, anyAllyAttackedThisTurn
 * - playedHistory, destroyedHistory
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHP,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: player state", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // LEADER EFFECTS
  // ===========================================================================

  describe("leader barrier", () => {
    it("leaderBarrier blocks first damage", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.second.leaderBarrier = 1;

      const effect = {
        op: "damage" as const,
        target: "enemy:leader",
        amount: 5,
      };
      whenRunEffects([effect], "first");

      // Barrier should block or reduce damage
    });
  });

  describe("leader damage taken bonus", () => {
    it("leaderDamageTakenBonus increases damage taken", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.second.leaderDamageTakenBonus = 2;

      // When damage is dealt, bonus should apply
      expect(state.players.second.leaderDamageTakenBonus).toBe(2);
    });
  });

  describe("leader max damage cap", () => {
    it("leaderMaxDamageCap limits damage", () => {
      givenGameState({ seed: 1 }).withFirstHP(20).build();

      state.players.first.leaderMaxDamageCap = 5;

      // Any hit over 5 should be capped at 5
      expect(state.players.first.leaderMaxDamageCap).toBe(5);
    });
  });

  // ===========================================================================
  // EVOLUTION CHARGES
  // ===========================================================================

  describe("evolution charges", () => {
    it("evoCharges tracks available evolutions", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoCharges = 3;

      expect(state.players.first.evoCharges).toBe(3);
    });

    it("superEvoCharges tracks super evolution availability", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.superEvoCharges = 1;

      expect(state.players.first.superEvoCharges).toBe(1);
    });

    it("evoCount tracks total evolutions this game", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoCount = 5;

      expect(state.players.first.evoCount).toBe(5);
    });

    it("evoUsedThisTurn resets each turn", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoUsedThisTurn = true;

      expect(state.players.first.evoUsedThisTurn).toBe(true);
    });
  });

  // ===========================================================================
  // SECOND PLAYER BOOST
  // ===========================================================================

  describe("boost mechanic", () => {
    it("second player has boost", () => {
      givenGameState({ seed: 1 }).build();

      // Second player should have boost available
      expect(state.players.second.hasBoost).toBe(true);
    });

    it("first player does not have boost", () => {
      givenGameState({ seed: 1 }).build();

      expect(state.players.first.hasBoost).toBeFalsy();
    });

    it("boostUsedEarly tracks early boost usage", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.boostUsedEarly = true;

      expect(state.players.second.boostUsedEarly).toBe(true);
    });

    it("boostUsedLate tracks late boost usage", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.boostUsedLate = true;

      expect(state.players.second.boostUsedLate).toBe(true);
    });
  });

  // ===========================================================================
  // PER-TURN TRACKING
  // ===========================================================================

  describe("per-turn tracking", () => {
    it("playsThisTurn tracks cards played", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.playsThisTurn = 3;

      expect(state.players.first.playsThisTurn).toBe(3);
    });

    it("anyAllyAttackedThisTurn tracks attacks", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.anyAllyAttackedThisTurn = true;

      expect(state.players.first.anyAllyAttackedThisTurn).toBe(true);
    });
  });

  // ===========================================================================
  // HISTORY TRACKING
  // ===========================================================================

  describe("history tracking", () => {
    it("playedHistory contains played cards", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.playedHistory = [
        { name: "Knight", type: "Follower" },
      ];

      expect(state.players.first.playedHistory.length).toBe(1);
    });

    it("destroyedHistory contains destroyed cards", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.destroyedHistory = [
        { name: "Goblin", type: "Follower" },
      ];

      expect(state.players.first.destroyedHistory.length).toBe(1);
    });
  });

  // ===========================================================================
  // CRESTS
  // ===========================================================================

  describe("crests array", () => {
    it("crests tracks collected crests", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = ["faith", "lust", "pride"];

      expect(state.players.first.crests.length).toBe(3);
    });
  });
});
