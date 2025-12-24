// src/logic/core/playCard/preflight.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { canPlayCard } from "./preflight.js";
import { playCardNoRender } from "./index.js";
import { state, resetGameState } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";

describe("Preflight System", () => {
  beforeEach(() => {
    resetGameState(1);
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
  });

  describe("Spell with required target", () => {
    it("blocks when no enemy follower exists for targeted spell", () => {
      // Stormy Blast style spell: targets enemy:follower with select
      const spell: CardInstance = {
        id: "test-targeted-spell",
        uid: "spell-1",
        name: "Test Targeted Spell",
        type: "Spell",
        cost: 1,
        spell: [
          {
            op: "damage",
            target: "enemy:follower",
            select: 1,
            amount: 5,
          },
        ],
      };

      state.players.first.hand = [spell];
      state.players.second.board = []; // No enemy followers

      const result = canPlayCard(spell, "first");
      expect(result.ok).toBe(false);
      expect("reason" in result ? result.reason : "").toContain("target");

      // Verify PP unchanged
      expect(state.players.first.pp).toBe(10);
    });

    it("allows when enemy follower exists", () => {
      const spell: CardInstance = {
        id: "test-targeted-spell",
        uid: "spell-1",
        name: "Test Targeted Spell",
        type: "Spell",
        cost: 1,
        spell: [
          {
            op: "damage",
            target: "enemy:follower",
            select: 1,
            amount: 5,
          },
        ],
      };

      const enemyFollower: CardInstance = {
        id: "enemy-1",
        uid: "enemy-f-1",
        name: "Enemy Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      };

      state.players.first.hand = [spell];
      state.players.second.board = [enemyFollower];

      const result = canPlayCard(spell, "first");
      expect(result.ok).toBe(true);
    });
  });

  describe("Radiant Rainbow (spellboost target requirement)", () => {
    it("blocks when no spellboost card in hand", () => {
      const radiantRainbow: CardInstance = {
        id: "10131310", // Actual ID
        uid: "rr-1",
        name: "Radiant Rainbow",
        type: "Spell",
        cost: 2,
        spell: [
          {
            op: "select",
            target: "ally:hand",
            condition: { has_keyword: "Spellboost" },
            select_count: 1,
            effects: [
              { op: "spellboost", target: "self", times: 1 },
              { op: "draw", count: 1 },
            ],
          },
        ],
      };

      // Only the spell itself in hand, no spellboost cards
      state.players.first.hand = [radiantRainbow];

      const result = canPlayCard(radiantRainbow, "first");
      expect(result.ok).toBe(false);
      expect("reason" in result ? result.reason : "").toContain("Spellboost");
    });

    it("allows when spellboost card exists in hand", () => {
      const radiantRainbow: CardInstance = {
        id: "10131310",
        uid: "rr-1",
        name: "Radiant Rainbow",
        type: "Spell",
        cost: 2,
        spell: [
          {
            op: "select",
            target: "ally:hand",
            condition: { has_keyword: "Spellboost" },
            select_count: 1,
            effects: [
              { op: "spellboost", target: "self", times: 1 },
              { op: "draw", count: 1 },
            ],
          },
        ],
      };

      const spellboostCard: CardInstance = {
        id: "sb-card",
        uid: "sb-1",
        name: "Spellboost Card",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
        keywords: [{ name: "Spellboost", effects: [] }],
      };

      state.players.first.hand = [radiantRainbow, spellboostCard];

      const result = canPlayCard(radiantRainbow, "first");
      expect(result.ok).toBe(true);
    });
  });

  describe("Board full check", () => {
    it("blocks permanent when board is full", () => {
      const follower: CardInstance = {
        id: "f-1",
        uid: "f-uid-1",
        name: "Test Follower",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      };

      // Fill board with 5 followers
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

      const result = canPlayCard(follower, "first");
      expect(result.ok).toBe(false);
      expect("reason" in result ? result.reason : "").toContain("full");
    });
  });

  describe("cant_play flag", () => {
    it("blocks card with cant_play flag", () => {
      const card: CardInstance = {
        id: "blocked-card",
        uid: "bc-1",
        name: "Blocked Card",
        type: "Spell",
        cost: 1,
        cant_play: true,
      };

      state.players.first.hand = [card];

      const result = canPlayCard(card, "first");
      expect(result.ok).toBe(false);
      expect("reason" in result ? result.reason : "").toContain(
        "cannot be played",
      );
    });
  });

  describe("Mutation guarantees", () => {
    it("blocked outcome leaves state unchanged", () => {
      // Setup: spell that needs target but none available
      const spell: CardInstance = {
        id: "test-spell",
        uid: "spell-1",
        name: "Test Spell",
        type: "Spell",
        cost: 1,
        spell: [
          {
            op: "damage",
            target: "enemy:follower",
            select: 1,
            amount: 5,
          },
        ],
      };

      state.players.first.hand = [spell];
      state.players.first.pp = 5;
      state.players.second.board = []; // No targets
      const handLengthBefore = state.players.first.hand.length;
      const ppBefore = state.players.first.pp;

      const result = canPlayCard(spell, "first");

      // Preflight should block, state unchanged
      expect(result.ok).toBe(false);
      expect(state.players.first.hand.length).toBe(handLengthBefore);
      expect(state.players.first.pp).toBe(ppBefore);
    });

    it("done outcome mutates state correctly", () => {
      // Import playCardNoRender for this test

      // Setup: simple follower with no targeting
      const follower: CardInstance = {
        id: "test-follower",
        uid: "follower-1",
        name: "Test Follower",
        type: "Follower",
        cost: 2,
        attack: 3,
        defense: 3,
      };

      state.players.first.hand = [follower];
      state.players.first.pp = 5;
      state.players.first.board = [];
      state.activePlayer = "first";

      const ppBefore = state.players.first.pp;
      const handLengthBefore = state.players.first.hand.length;
      const boardLengthBefore = state.players.first.board.length;

      const result = playCardNoRender(state.players.first.hand, "first", 0);

      expect(result.kind).toBe("done");
      expect(state.players.first.pp).toBe(ppBefore - 2); // Cost paid
      expect(state.players.first.hand.length).toBe(handLengthBefore - 1); // Removed from hand
      expect(state.players.first.board.length).toBe(boardLengthBefore + 1); // Added to board
    });
  });
});















