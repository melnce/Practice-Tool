/**
 * @file Mechanic Contract Test: all actions
 *
 * DESIGN: Tests canonical action types used in effects.
 *
 * GOAL: Find engine bugs, not just make tests pass!
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import type { CardInstance } from "../../src/core/types/index.js";

describe("Mechanic Contract: all actions", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // STAT ACTIONS
  // Canonical: { op: "stat", action: "give", target: "self", attack: N, defense: N }
  // ===========================================================================

  describe("stat actions", () => {
    it("stat action:give adds stats to self", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Target", type: "Follower", attack: 2, defense: 2 },
        ])
        .build();

      const card = findOnBoard("first", "Target");

      // Canonical schema from card JSONs
      const effect = {
        op: "stat" as const,
        action: "give", // Required per card JSON patterns
        target: "self",
        attack: 2,
        defense: 1,
      };
      whenRunEffects([effect], "first", card);

      // After buff: attack = 2+2=4, defense = 2+1=3
      expect(card!.attack).toBe(4);
      expect(card!.defense).toBe(3);
    });

    it("stat action:set overrides stats", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          { name: "Target", type: "Follower", attack: 5, defense: 5 },
        ])
        .build();

      const card = findOnBoard("first", "Target");

      const effect = {
        op: "stat" as const,
        action: "set",
        target: "self",
        attack: 1,
        defense: 1,
      };
      whenRunEffects([effect], "first", card);

      expect(card!.attack).toBe(1);
      expect(card!.defense).toBe(1);
    });
  });

  // ===========================================================================
  // PP ACTIONS
  // ===========================================================================

  describe("pp actions", () => {
    it("pp action:recover restores PP", () => {
      givenGameState({ seed: 1 }).build();
      state.players.first.pp = 3;
      state.players.first.maxPP = 10; // Correct property

      const effect = {
        op: "pp" as const,
        action: "recover",
        amount: 2,
      };
      whenRunEffects([effect], "first");

      expect(state.players.first.pp).toBe(5);
    });
  });

  // ===========================================================================
  // COUNTDOWN ACTIONS
  // ===========================================================================

  describe("countdown actions", () => {
    it("countdown action:advance reduces countdown", () => {
      givenGameState({ seed: 1 }).build();

      const amulet: CardInstance = {
        uid: "test-1",
        name: "CountdownAmulet",
        type: "Amulet",
        countdown: 5,
        hasCountdown: true,
        owner: "first",
        zone: "board",
      } as CardInstance;
      state.players.first.board.push(amulet);

      const effect = {
        op: "countdown" as const,
        action: "advance" as const,
        amount: 2,
        target: "self",
      };
      whenRunEffects([effect], "first", amulet);

      expect(amulet.countdown).toBe(3);
    });

    it("countdown action:delay increases countdown", () => {
      givenGameState({ seed: 1 }).build();

      const amulet: CardInstance = {
        uid: "test-1",
        name: "CountdownAmulet",
        type: "Amulet",
        countdown: 3,
        hasCountdown: true,
        owner: "first",
        zone: "board",
      } as CardInstance;
      state.players.first.board.push(amulet);

      const effect = {
        op: "countdown" as const,
        action: "delay" as const,
        amount: 2,
        target: "self",
      };
      whenRunEffects([effect], "first", amulet);

      expect(amulet.countdown).toBe(5);
    });
  });
});
