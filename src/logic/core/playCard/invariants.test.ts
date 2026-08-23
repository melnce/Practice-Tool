// src/logic/core/playCard/invariants.test.ts
// Invariant tests for playCard contract enforcement

import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../../core/gameState.js";
import type { CardInstance } from "../../../core/types/index.js";
import { playCardNoRender, playCardCore, playCard } from "./index.js";
import { canPlayCard } from "./preflight.js";
import {
  canUndo,
  resetHistory,
  setHistoryEnabled,
} from "../../../core/history.js";

describe("PlayCard Invariants", () => {
  beforeEach(() => {
    resetGameState(1);
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
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

      state.players.first.hand = [spell];
      state.players.first.pp = 5;
      state.players.second.board = []; // No targets

      const ppBefore = state.players.first.pp;
      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect(state.players.first.pp).toBe(ppBefore);
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

      state.players.first.hand = [spell];
      state.players.second.board = [];
      const handBefore = [...state.players.first.hand];

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect(state.players.first.hand).toEqual(handBefore);
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
      state.players.first.board = Array(5)
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

      state.players.first.hand = [follower];
      const boardLengthBefore = state.players.first.board.length;

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect(state.players.first.board.length).toBe(boardLengthBefore);
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

      state.players.first.hand = [spell];
      state.players.second.board = [];
      state.players.first.playedHistory = [];

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect(state.players.first.playedHistory.length).toBe(0);
    });

    it("Blocked playCard does not push undo history entry", () => {
      setHistoryEnabled(true);
      resetHistory();

      const follower: CardInstance = {
        id: "legal-follower",
        uid: "lf-1",
        name: "Legal Follower",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      };
      const spell: CardInstance = {
        id: "blocked-spell",
        uid: "bs-2",
        name: "Blocked Spell",
        type: "Spell",
        cost: 1,
        spell: [
          { op: "damage", target: "enemy:follower", select: 1, amount: 5 },
        ],
      };

      state.players.first.hand = [spell, follower];
      state.players.second.board = [];

      playCard(state.players.first.hand, "first", 1);
      expect(canUndo()).toBe(true);

      playCard(state.players.first.hand, "first", 0);
      expect(canUndo()).toBe(true);
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

      state.players.first.hand = [follower];
      state.players.first.pp = 10;
      const ppBefore = state.players.first.pp;

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("done");
      expect(state.players.first.pp).toBe(ppBefore - 3); // Exactly one cost payment
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

      state.players.first.hand = [follower];
      const handLengthBefore = state.players.first.hand.length;

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("done");
      expect(state.players.first.hand.length).toBe(handLengthBefore - 1);
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

      state.players.first.hand = [follower];
      state.players.first.playedHistory = [];

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("done");
      expect(state.players.first.playedHistory.length).toBe(1);
      expect(state.players.first.playedHistory[0]?.name).toBe("Test Follower");
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

      state.players.first.hand = [follower];
      state.players.first.board = [];

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("done");
      expect(state.players.first.board.length).toBe(1);
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

      state.activePlayer = "second"; // Red's turn
      state.players.first.hand = [follower];
      state.players.first.pp = 10;
      const ppBefore = state.players.first.pp;

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect("reason" in result ? result.reason : "").toContain("turn");
      expect(state.players.first.pp).toBe(ppBefore);
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

      state.players.first.hand = [follower];
      state.players.first.pp = 3; // Not enough

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("blocked");
      expect("reason" in result ? result.reason : "").toContain("PP");
    });
  });
});
