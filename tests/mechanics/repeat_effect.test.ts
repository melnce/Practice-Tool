/**
 * @file Mechanic Contract Test: repeat_effect
 *
 * DESIGN: Tests the repeat_effect operation (loop effects X times dynamically).
 *
 * CANONICAL SCHEMA:
 * - count_source: "count_in_hand" | "crest_count"
 * - filter: { tribe: "..." } (for count_in_hand)
 * - effect: { op: "...", ... } (singular, not effects array)
 *
 * INVARIANTS UNDER TEST:
 * - Effect fires number of times based on count_source
 * - count_in_hand counts matching cards in hand
 * - crest_count counts crests on player
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
import type { Crest } from "../../src/logic/effects/crest.js";

describe("Mechanic Contract: repeat_effect", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // COUNT FROM HAND
  // ===========================================================================

  describe("count_source: count_in_hand", () => {
    it("fires effect once per matching card in hand", () => {
      givenGameState({ seed: 1 })
        .withSecondHP(20)
        .withFirstHand([
          {
            name: "Fairy",
            type: "Follower",
            attack: 1,
            defense: 1,
            tribes: ["Pixie"],
          },
          {
            name: "Fairy2",
            type: "Follower",
            attack: 1,
            defense: 1,
            tribes: ["Pixie"],
          },
          {
            name: "Knight",
            type: "Follower",
            attack: 2,
            defense: 2,
            tribes: ["Officer"],
          },
        ])
        .build();

      const effect = {
        op: "repeat_effect" as const,
        count_source: "count_in_hand",
        filter: { tribe: "Pixie" },
        effect: {
          op: "damage" as const,
          target: "enemy:leader",
          amount: 1,
        },
      };
      whenRunEffects([effect], "first");

      // 2 Pixies in hand = 2 damage
      expect(thenHP("second")).toBe(18);
    });

    it("empty hand fires nothing", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      const effect = {
        op: "repeat_effect" as const,
        count_source: "count_in_hand",
        filter: { tribe: "Pixie" },
        effect: {
          op: "damage" as const,
          target: "enemy:leader",
          amount: 5,
        },
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(20);
    });
  });

  // ===========================================================================
  // COUNT FROM CRESTS
  // ===========================================================================

  describe("count_source: crest_count", () => {
    it("fires effect once per active crest", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.crests = [
        { name: "Crest A", owner: "first" } as Crest,
        { name: "Crest B", owner: "first" } as Crest,
        { name: "Crest C", owner: "first" } as Crest,
      ];

      const effect = {
        op: "repeat_effect" as const,
        count_source: "crest_count",
        effect: {
          op: "damage" as const,
          target: "enemy:leader",
          amount: 2,
        },
      };
      whenRunEffects([effect], "first");

      // 3 crests = 6 damage
      expect(thenHP("second")).toBe(14);
    });

    it("no crests fires nothing", () => {
      givenGameState({ seed: 1 }).withSecondHP(20).build();

      state.players.first.crests = [];

      const effect = {
        op: "repeat_effect" as const,
        count_source: "crest_count",
        effect: {
          op: "damage" as const,
          target: "enemy:leader",
          amount: 5,
        },
      };
      whenRunEffects([effect], "first");

      expect(thenHP("second")).toBe(20);
    });
  });
});
