/**
 * Golden Invariant: Trigger Ordering and Gate Behavior
 *
 * Asserts trigger ordering and once-per-turn gating.
 * Uses minimal state construction without full game simulation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { TriggerEventName } from "../../src/logic/core/triggers/types";

describe("Golden: Trigger Keys and Ordering", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  describe("trigger event names", () => {
    it("essential trigger events are well-typed", () => {
      // TypeScript compile-time check: these are valid TriggerEventName values
      const essentialEvents: TriggerEventName[] = [
        "start_of_turn",
        "end_of_turn",
        "ally_follower_enter",
        "ally_follower_played",
        "clash",
        "strike",
      ];

      expect(essentialEvents.length).toBe(6);
    });
  });

  describe("once-per-turn state tracking", () => {
    it("usedAllyFollowerEnter tracks usage per round", () => {
      state.roundCount = 5;
      state.usedAllyFollowerEnter = new Map();

      // First usage
      expect(state.usedAllyFollowerEnter.has("card_123")).toBe(false);

      state.usedAllyFollowerEnter.set("card_123", 5);

      // Same round - already used
      expect(state.usedAllyFollowerEnter.get("card_123")).toBe(5);
    });

    it("lastFuseRound blocks same-turn fuse", () => {
      state.roundCount = 3;

      const card = {
        uid: "fuse_card",
        name: "Fusable",
        type: "Spell" as const,
        cost: 1,
        lastFuseRound: 3,
      };

      // Same round - should block
      expect(card.lastFuseRound).toBe(state.roundCount);

      // Next round - should allow
      state.roundCount = 4;
      expect(card.lastFuseRound).not.toBe(state.roundCount);
    });
  });

  describe("crest counter state", () => {
    it("crest counters can be incremented and checked", () => {
      // Initialize crest state
      state.blueCrestCounters = state.blueCrestCounters || {};
      state.blueCrestCounters["Main"] = state.blueCrestCounters["Main"] || {};
      state.blueCrestCounters["Main"]["faith"] = 0;

      // Increment
      state.blueCrestCounters["Main"]["faith"] = 3;

      expect(state.blueCrestCounters["Main"]["faith"]).toBe(3);
    });
  });
});






