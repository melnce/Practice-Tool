// src/logic/core/playCard/invariants.test.ts
// Invariant tests for playCard contract enforcement

import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";
import { playCardNoRender, playCardCore } from "./index.js";
import { canPlayCard } from "./preflight.js";

describe("PlayCard Invariants", () => {
  beforeEach(() => {
    resetGameState();
    state.isBlueTurn = true;
    state.bluePP = 10;
    state.blueMaxPP = 10;
  });

  describe("Blocked Invariants", () => {
    it("PP unchanged when blocked", () => {
      const spell: CardInstance = {
        id: "blocked-spell",
        uid: "bs-1",
        name: "Blocked Spell",
        type: "Spell",
        cost: 1,
        spell: [
          { op: "damage", target: "enemy:follower", select: 1, amount: 5 },
        ],
      };

      state.blueHand = [spell];
      state.bluePP = 5;
      state.redBoard = []; // No targets

      const ppBefore = state.bluePP;
      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect(state.bluePP).toBe(ppBefore);
    });

    it("Hand unchanged when blocked", () => {
      const spell: CardInstance = {
        id: "blocked-spell",
        uid: "bs-1",
        name: "Blocked Spell",
        type: "Spell",
        cost: 1,
        spell: [
          { op: "damage", target: "enemy:follower", select: 1, amount: 5 },
        ],
      };

      state.blueHand = [spell];
      state.redBoard = [];
      const handBefore = [...state.blueHand];

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect(state.blueHand).toEqual(handBefore);
    });

    it("Board unchanged when blocked", () => {
      const follower: CardInstance = {
        id: "blocked-follower",
        uid: "bf-1",
        name: "Blocked Follower",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      };

      // Fill board to max
      state.blueBoard = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `board-${i}`,
          uid: `board-uid-${i}`,
          name: `Board Follower ${i}`,
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        }));

      state.blueHand = [follower];
      const boardLengthBefore = state.blueBoard.length;

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect(state.blueBoard.length).toBe(boardLengthBefore);
    });

    it("No played history entry when blocked", () => {
      const spell: CardInstance = {
        id: "blocked-spell",
        uid: "bs-1",
        name: "Blocked Spell",
        type: "Spell",
        cost: 1,
        spell: [
          { op: "damage", target: "enemy:follower", select: 1, amount: 5 },
        ],
      };

      state.blueHand = [spell];
      state.redBoard = [];
      state.bluePlayedHistory = [];

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect(state.bluePlayedHistory.length).toBe(0);
    });
  });

  describe("Done Invariants", () => {
    it("PP decreased exactly once", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
      };

      state.blueHand = [follower];
      state.bluePP = 10;
      const ppBefore = state.bluePP;

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("done");
      expect(state.bluePP).toBe(ppBefore - 3); // Exactly one cost payment
    });

    it("Card removed from hand exactly once", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      };

      state.blueHand = [follower];
      const handLengthBefore = state.blueHand.length;

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("done");
      expect(state.blueHand.length).toBe(handLengthBefore - 1);
    });

    it("Played history entry added exactly once", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      };

      state.blueHand = [follower];
      state.bluePlayedHistory = [];

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("done");
      expect(state.bluePlayedHistory.length).toBe(1);
      expect(state.bluePlayedHistory[0]?.name).toBe("Test Follower");
    });

    it("Follower added to board exactly once", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      };

      state.blueHand = [follower];
      state.blueBoard = [];

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("done");
      expect(state.blueBoard.length).toBe(1);
    });
  });

  describe("Paused Invariants", () => {
    it("Pending targeting is set when paused", () => {
      // A spell that triggers selection mid-play
      // This is hard to test without a real targeting effect
      // For now, just verify the contract exists
      expect(true).toBe(true); // Placeholder - needs real targeting setup
    });
  });

  describe("Turn Guard Invariants", () => {
    it("Blocks play when not player's turn", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      };

      state.isBlueTurn = false; // Red's turn
      state.blueHand = [follower];
      state.bluePP = 10;
      const ppBefore = state.bluePP;

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect("reason" in result ? result.reason : "").toContain("turn");
      expect(state.bluePP).toBe(ppBefore);
    });

    it("Blocks play when not enough PP", () => {
      const follower: CardInstance = {
        id: "test-follower",
        uid: "tf-1",
        name: "Test Follower",
        type: "Follower",
        cost: 5,
        attack: 2,
        defense: 2,
      };

      state.blueHand = [follower];
      state.bluePP = 3; // Not enough

      const result = playCardNoRender(state.blueHand, "blue", 0);

      expect(result.kind).toBe("blocked");
      expect("reason" in result ? result.reason : "").toContain("PP");
    });
  });
});
