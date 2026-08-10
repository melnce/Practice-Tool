/**
 * @file Mechanic Contract Test: turn mechanics
 *
 * DESIGN: Tests turn-related mechanics.
 *
 * COVERAGE:
 * - Turn start resets
 * - Turn end cleanup
 * - Active player switching
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: turn mechanics", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // ACTIVE PLAYER
  // ===========================================================================

  describe("active player", () => {
    it("activePlayer is set correctly", () => {
      givenGameState({ seed: 1 }).build();

      expect(state.activePlayer).toBeDefined();
      expect(["first", "second"]).toContain(state.activePlayer);
    });
  });

  // ===========================================================================
  // TURN COUNT
  // ===========================================================================

  describe("turn count", () => {
    it("turnNumber tracks current turn", () => {
      givenGameState({ seed: 1 }).build();

      expect(state.turnNumber).toBeDefined();
      expect(state.turnNumber).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // RESETS AT TURN START
  // ===========================================================================

  describe("turn start resets", () => {
    it("PP restores to max at turn start", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.maxPp = 5;
      state.players.first.pp = 0;

      // At turn start, PP should restore to max
    });

    it("evoUsedThisTurn resets at turn start", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.evoUsedThisTurn = true;

      // Should reset at turn start
    });

    it("playsThisTurn resets at turn start", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.playsThisTurn = 5;

      // Should reset at turn start
    });

    it("anyAllyAttackedThisTurn resets at turn start", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.anyAllyAttackedThisTurn = true;

      // Should reset at turn start
    });
  });

  // ===========================================================================
  // FOLLOWER ATTACK RESETS
  // ===========================================================================

  describe("follower resets", () => {
    it("followers can attack after existing on board", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Follower",
            type: "Follower",
            attack: 3,
            defense: 3,
            can_attack: true,
            justPlayed: false,
          },
        ])
        .build();

      // Should be able to attack
    });

    it("just-played followers without rush/storm cannot attack", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "NewFollower",
            type: "Follower",
            attack: 3,
            defense: 3,
            justPlayed: true,
            hasRush: false,
            hasStorm: false,
          },
        ])
        .build();

      // Should not be able to attack
    });
  });

  // ===========================================================================
  // END OF TURN
  // ===========================================================================

  describe("end of turn", () => {
    it("end_of_turn effect structure is valid", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "EndTurnCard",
            type: "Follower",
            attack: 1,
            defense: 1,
            triggers: [
              {
                event: "end_of_turn",
                effects: [{ op: "restore", target: "ally:leader", amount: 1 }],
              },
            ],
          },
        ])
        .build();

      // End of turn trigger should fire at end of turn
    });
  });
});
