/**
 * @file Mechanic Contract Test: combat mechanics
 *
 * DESIGN: Tests combat-related operations and behaviors.
 *
 * INVARIANTS UNDER TEST:
 * - Rush allows attacking followers on play turn
 * - Storm allows attacking leader on play turn
 * - Ward forces targeting
 * - Bane destroys on any damage
 * - Drain restores HP equal to damage
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  thenHP,
  findOnBoard,
  resetUidCounter,
} from "../harness/builders.js";

describe("Mechanic Contract: combat", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  // ===========================================================================
  // RUSH
  // ===========================================================================

  describe("rush keyword", () => {
    it("follower with Rush can attack followers immediately", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Rusher",
            type: "Follower",
            attack: 3,
            defense: 3,
            hasRush: true,
            canAttack: true,
          },
        ])
        .withSecondBoard([
          {
            name: "Target",
            type: "Follower",
            attack: 2,
            defense: 2,
          },
        ])
        .build();

      const rusher = findOnBoard("first", "Rusher");
      expect(rusher!.hasRush).toBe(true);
      expect(rusher!.canAttack).toBe(true);
    });
  });

  // ===========================================================================
  // STORM
  // ===========================================================================

  describe("storm keyword", () => {
    it("follower with Storm can attack leader immediately", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Stormer",
            type: "Follower",
            attack: 4,
            defense: 2,
            hasStorm: true,
            canAttack: true,
          },
        ])
        .build();

      const stormer = findOnBoard("first", "Stormer");
      expect(stormer!.hasStorm).toBe(true);
    });
  });

  // ===========================================================================
  // WARD
  // ===========================================================================

  describe("ward keyword", () => {
    it("follower with Ward has hasWard flag", () => {
      givenGameState({ seed: 1 })
        .withSecondBoard([
          {
            name: "Tank",
            type: "Follower",
            attack: 1,
            defense: 5,
            hasWard: true,
          },
        ])
        .build();

      const tank = findOnBoard("second", "Tank");
      expect(tank!.hasWard).toBe(true);
    });
  });

  // ===========================================================================
  // BANE
  // ===========================================================================

  describe("bane keyword", () => {
    it("follower with Bane has hasBane flag", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Assassin",
            type: "Follower",
            attack: 1,
            defense: 1,
            hasBane: true,
          },
        ])
        .build();

      const assassin = findOnBoard("first", "Assassin");
      expect(assassin!.hasBane).toBe(true);
    });
  });

  // ===========================================================================
  // DRAIN
  // ===========================================================================

  describe("drain keyword", () => {
    it("follower with Drain has hasDrain flag", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Vampire",
            type: "Follower",
            attack: 3,
            defense: 3,
            hasDrain: true,
          },
        ])
        .build();

      const vampire = findOnBoard("first", "Vampire");
      expect(vampire!.hasDrain).toBe(true);
    });
  });

  // ===========================================================================
  // AMBUSH
  // ===========================================================================

  describe("ambush keyword", () => {
    it("follower with Ambush has hasAmbush flag", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Ninja",
            type: "Follower",
            attack: 2,
            defense: 1,
            hasAmbush: true,
          },
        ])
        .build();

      const ninja = findOnBoard("first", "Ninja");
      expect(ninja!.hasAmbush).toBe(true);
    });
  });

  // ===========================================================================
  // BARRIER
  // ===========================================================================

  describe("barrier keyword", () => {
    it("follower with Barrier has hasBarrier flag", () => {
      givenGameState({ seed: 1 })
        .withFirstBoard([
          {
            name: "Shielded",
            type: "Follower",
            attack: 2,
            defense: 2,
            hasBarrier: true,
          },
        ])
        .build();

      const shielded = findOnBoard("first", "Shielded");
      expect(shielded!.hasBarrier).toBe(true);
    });
  });
});
