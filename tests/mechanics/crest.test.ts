/**
 * @file Mechanic Contract Test: crest (named persistent effects)
 *
 * DESIGN: Tests the crest operations.
 *
 * SEMANTICS:
 * - Crests can be permanent, have countdown (duration), or have triggers
 * - Countdown reaching 0 = DESTRUCTION (not "completion")
 * - Destruction triggers Last Words IF the keyword is present
 * - Effects do NOT fire just because countdown completed
 *
 * INVARIANTS UNDER TEST:
 * - Crest gain creates a crest object
 * - Crest counters can be added/spent
 * - Crest destroy triggers Last Words if present
 * - Countdown reaching 0 destroys crest (triggers Last Words if present)
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
import { destroyCrest, tickCrests } from "../../src/logic/effects/crest.js";
import type { Crest } from "../../src/logic/effects/crest.js";

describe("Mechanic Contract: crest", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // GAIN CREST
  // ===========================================================================

  describe("crest action: gain", () => {
    it("creates a crest object for the player", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [];

      const effect = {
        op: "crest" as const,
        action: "gain",
        name: "Test Crest",
        countdown: 3,
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.crests.length).toBe(1);
      expect(state.players.first.crests[0].name).toBe("Test Crest");
    });

    it("multiple crests can be gained", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [];

      whenRunEffects(
        [
          { op: "crest" as const, action: "gain", name: "Crest A" },
          { op: "crest" as const, action: "gain", name: "Crest B" },
        ],
        "first",
      );

      expect(state.players.first.crests.length).toBe(2);
    });

    it("crests are per-player", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [];
      state.players.second.crests = [];

      whenRunEffects(
        [{ op: "crest" as const, action: "gain", name: "Test" }],
        "first",
      );

      expect(state.players.first.crests.length).toBe(1);
      expect(state.players.second.crests.length).toBe(0);
    });
  });

  // ===========================================================================
  // CREST COUNTERS
  // ===========================================================================

  describe("crest action: add_counter", () => {
    it("adds counter to named crest", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [
        {
          name: "Faith Crest",
          owner: "first",
          counters: { faith: 0 },
        } as Crest,
      ];

      whenRunEffects(
        [
          {
            op: "crest" as const,
            action: "add_counter",
            name: "Faith Crest",
            counter: "faith",
            amount: 2,
          },
        ],
        "first",
      );

      expect(state.players.first.crests[0].counters?.faith).toBe(2);
    });
  });

  // ===========================================================================
  // CREST DESTROY + LAST WORDS
  // ===========================================================================

  describe("crest destroy", () => {
    it("destroyCrest removes crest from player", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [
        { name: "Destroy Me", owner: "first" } as Crest,
      ];

      destroyCrest("first", "Destroy Me");

      expect(state.players.first.crests.length).toBe(0);
    });

    it("destroyCrest triggers Last Words effects if keyword present", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.hp = 20;
      state.players.first.crests = [
        {
          name: "Last Words Crest",
          owner: "first",
          keywords: ["LastWords"],
          effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
        } as Crest,
      ];

      destroyCrest("first", "Last Words Crest");

      expect(state.players.first.crests.length).toBe(0);
      expect(state.players.second.hp).toBe(15); // Damage from Last Words
    });

    it("crest without Last Words does NOT fire effects on destroy", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.hp = 20;
      state.players.first.crests = [
        {
          name: "No Last Words",
          owner: "first",
          effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
        } as Crest,
      ];

      destroyCrest("first", "No Last Words");

      expect(state.players.first.crests.length).toBe(0);
      expect(state.players.second.hp).toBe(20); // No damage - no Last Words keyword
    });
  });

  // ===========================================================================
  // COUNTDOWN = DESTRUCTION (triggers Last Words if present)
  // ===========================================================================

  describe("crest countdown", () => {
    it("countdown reaching 0 destroys the crest", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [
        {
          name: "Timed Crest",
          owner: "first",
          countdown: 1, // Will reach 0 after tick
        } as Crest,
      ];

      tickCrests("first");

      expect(state.players.first.crests.length).toBe(0);
    });

    it("countdown destruction triggers Last Words if keyword present", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.hp = 20;
      state.players.first.crests = [
        {
          name: "Last Words Countdown",
          owner: "first",
          countdown: 1,
          keywords: ["LastWords"],
          effects: [{ op: "damage", target: "enemy:leader", amount: 4 }],
        } as Crest,
      ];

      tickCrests("first");

      expect(state.players.first.crests.length).toBe(0);
      expect(state.players.second.hp).toBe(16); // Last Words fired
    });

    it("countdown destruction does NOT fire effects without Last Words", () => {
      givenGameState({ seed: 1 }).build();
      state.players.second.hp = 20;
      state.players.first.crests = [
        {
          name: "No Keywords",
          owner: "first",
          countdown: 1,
          effects: [{ op: "damage", target: "enemy:leader", amount: 3 }],
        } as Crest,
      ];

      tickCrests("first");

      expect(state.players.first.crests.length).toBe(0);
      expect(state.players.second.hp).toBe(20); // No damage!
    });

    it("countdown not yet 0 does not destroy crest", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.crests = [
        {
          name: "Long Crest",
          owner: "first",
          countdown: 3, // Will become 2 after tick
        } as Crest,
      ];

      tickCrests("first");

      expect(state.players.first.crests.length).toBe(1);
      expect(state.players.first.crests[0].countdown).toBe(2);
    });
  });
});
