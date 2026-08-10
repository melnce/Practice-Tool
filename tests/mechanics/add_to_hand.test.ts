// tests/mechanics/add_to_hand.test.ts
// Tests for the add_to_hand operation
// - source: "named" (default) - token generation
// - source: "copy" - copy existing card with type filter

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHand,
  thenBoard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";

describe("Mechanic Contract: add_to_hand", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // =========================================================================
  // SOURCE: NAMED (TOKEN GENERATION)
  // Creates cards from the card database by name
  // =========================================================================
  describe("source: named (token generation)", () => {
    it("adds named token to hand", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      expect(hand.length).toBe(1);
      expect(hand[0].name).toBe("Fairy");
    });

    it("adds multiple named tokens", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 2,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      expect(hand.length).toBe(2);
      expect(hand.every((c) => c.name === "Fairy")).toBe(true);
    });

    it("named token has correct zone (hand)", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 1,
      };
      whenRunEffects([effect], "first");

      expect(thenHand("first")[0].zone).toBe("hand");
    });

    it("named token has correct owner", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 1,
      };
      whenRunEffects([effect], "second");

      expect(thenHand("second")[0].owner).toBe("second");
    });

    it("each named token has unique UID", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 3,
      };
      whenRunEffects([effect], "first");

      const uids = thenHand("first").map((c) => c.uid);
      const uniqueUids = new Set(uids);
      expect(uniqueUids.size).toBe(3);
    });

    it("does not thin deck (no deck interaction)", () => {
      givenGameState({ seed: 1 }).build();

      // Add cards to deck directly
      state.players.first.deck.push({ uid: "d1", name: "Water Fairy" } as any);
      state.players.first.deck.push({
        uid: "d2",
        name: "Elf Child May",
      } as any);
      const deckSizeBefore = state.players.first.deck.length;

      const effect = {
        op: "add_to_hand" as const,
        name: "Fairy",
        count: 2,
      };
      whenRunEffects([effect], "first");

      // Deck should be unchanged
      expect(state.players.first.deck.length).toBe(deckSizeBefore);
    });

    it("throws error if name is missing", () => {
      givenGameState({ seed: 1 }).build();

      const effect = {
        op: "add_to_hand" as const,
        count: 1,
      };

      expect(() => whenRunEffects([effect as any], "first")).toThrow(/name/);
    });
  });

  // =========================================================================
  // SOURCE: COPY (CARD DUPLICATION)
  // Copies an existing card with explicit type filter for AI training
  // =========================================================================
  describe("source: copy (card duplication)", () => {
    it("copies selected follower to hand", () => {
      givenGameState({ seed: 1 }).build();

      // Place a follower on the board to be selected
      const board = thenBoard("first");
      const follower = {
        uid: "test-follower-1",
        name: "Water Fairy",
        type: "Follower",
        owner: "first" as const,
        zone: "board" as const,
        attack: 1,
        defense: 1,
        cost: 1,
      };
      state.players.first.board.push(follower as any);
      state.lastSelected = [follower as any];

      const effect = {
        op: "add_to_hand" as const,
        source: "copy",
        target: "selected:follower",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      expect(hand.length).toBe(1);
      expect(hand[0].name).toBe("Water Fairy");
    });

    it("copied card has new UID (is a distinct instance)", () => {
      givenGameState({ seed: 1 }).build();

      const follower = {
        uid: "original-uid-123",
        name: "Water Fairy",
        type: "Follower",
        owner: "first" as const,
        zone: "board" as const,
        attack: 1,
        defense: 1,
        cost: 1,
      };
      state.players.first.board.push(follower as any);
      state.lastSelected = [follower as any];

      const effect = {
        op: "add_to_hand" as const,
        source: "copy",
        target: "selected:follower",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      expect(hand[0].uid).not.toBe("original-uid-123");
    });

    it("copies last_drawn card to hand", () => {
      givenGameState({ seed: 1 }).build();

      const drawnCard = {
        uid: "drawn-card-1",
        name: "Elf Child May",
        type: "Follower",
        owner: "first" as const,
        zone: "hand" as const,
        attack: 1,
        defense: 1,
        cost: 2,
      };
      state.lastDrawnCards = [drawnCard as any];

      const effect = {
        op: "add_to_hand" as const,
        source: "copy" as const,
        target: "last_drawn:any",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      // Should have the copy (original drawn card location is irrelevant to this test)
      const copies = hand.filter((c) => c.name === "Elf Child May");
      expect(copies.length).toBeGreaterThanOrEqual(1);
    });

    it("throws error if type filter is missing (bare target)", () => {
      givenGameState({ seed: 1 }).build();

      const follower = {
        uid: "test-1",
        name: "Water Fairy",
        type: "Follower",
        owner: "first" as const,
        zone: "board" as const,
      };
      state.lastSelected = [follower as any];

      const effect = {
        op: "add_to_hand" as const,
        source: "copy",
        target: "selected", // Missing type filter - should fail
        count: 1,
      };

      expect(() => whenRunEffects([effect as any], "first")).toThrow(
        /ambiguous/i,
      );
    });

    it("selected:any allows any card type", () => {
      givenGameState({ seed: 1 }).build();

      const spell = {
        uid: "test-spell-1",
        name: "Nature's Guidance",
        type: "Spell",
        owner: "first" as const,
        zone: "hand" as const,
        cost: 1,
      };
      state.lastSelected = [spell as any];

      const effect = {
        op: "add_to_hand" as const,
        source: "copy" as const,
        target: "selected:any",
        count: 1,
      };
      whenRunEffects([effect], "first");

      const hand = thenHand("first");
      const copies = hand.filter((c) => c.name === "Nature's Guidance");
      expect(copies.length).toBeGreaterThanOrEqual(1);
    });

    it("copy into hand resets skybound witnesses and board combat state", () => {
      givenGameState({ seed: 1 }).build();

      const follower = {
        uid: "enemy-board-1",
        name: "Water Fairy",
        type: "Follower",
        owner: "second" as const,
        zone: "board" as const,
        attack: 1,
        defense: 1,
        peak_defense: 3,
        cost: 1,
        skyboundArtEvolvesWitnessed: 5,
        hasAttacked: true,
        attacks_left: 0,
        attacks_used_this_turn: 1,
        justPlayed: false,
        can_attack: false,
        isDamaged: true,
        insertionTs: 42,
        __onceByTurn: { foo: 1 },
        __uiSelectable: true,
        __uiFlashBarrier: true,
      };
      state.players.second.board.push(follower as any);
      state.lastSelected = [follower as any];

      whenRunEffects(
        [
          {
            op: "add_to_hand" as const,
            source: "copy",
            target: "selected:follower",
            count: 1,
          },
        ],
        "first",
      );

      const copy = thenHand("first")[0]!;
      expect(copy.name).toBe("Water Fairy");
      expect(copy.uid).not.toBe("enemy-board-1");
      expect(copy.owner).toBe("first");
      expect(copy.zone).toBe("hand");
      // Bible: evolves before the card entered hand do not increase the witness counter.
      expect(copy.skyboundArtEvolvesWitnessed ?? 0).toBe(0);
      // Board combat / ephemeral runtime must not leak onto a hand card.
      expect(copy.hasAttacked ?? false).toBe(false);
      expect(copy.attacks_left).toBeUndefined();
      expect(copy.attacks_used_this_turn).toBeUndefined();
      expect(copy.justPlayed).toBeUndefined();
      expect(copy.can_attack).toBeUndefined();
      expect(copy.isDamaged ?? false).toBe(false);
      expect(copy.defense).toBe(3); // damage undone via peak_defense
      expect(copy.insertionTs).toBeUndefined();
      expect(copy.__onceByTurn).toBeUndefined();
      expect(copy.__uiSelectable).toBeUndefined();
      expect(copy.__uiFlashBarrier).toBeUndefined();
    });
  });

  describe("source: named still fresh (no witness leak from template path)", () => {
    it("named token starts at 0 skybound witnesses", () => {
      givenGameState({ seed: 1 }).build();

      whenRunEffects(
        [{ op: "add_to_hand" as const, name: "Fairy", count: 1 }],
        "first",
      );

      const hand = thenHand("first");
      expect(hand).toHaveLength(1);
      expect(hand[0]!.name).toBe("Fairy");
      expect(hand[0]!.skyboundArtEvolvesWitnessed ?? 0).toBe(0);
      expect(hand[0]!.zone).toBe("hand");
    });
  });
});
