// src/logic/core/playCard/specialCases.test.ts
// Tests for special case behaviors that must be preserved

import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../../core/gameState.js";
import type { CardInstance } from "../../../core/types/index.js";
import { canPlayCard } from "./preflight.js";
import { mergeWitchsNewBrewOnPlay } from "./specialCases.js";

describe("Special Cases", () => {
  beforeEach(() => {
    resetGameState(1);
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
  });

  describe("Radiant Rainbow Preflight", () => {
    const RADIANT_RAINBOW_ID = "10131310";

    it("blocks when no spellboost card in hand", () => {
      const radiantRainbow: CardInstance = {
        id: RADIANT_RAINBOW_ID,
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

      state.players.first.hand = [radiantRainbow];

      const result = canPlayCard(radiantRainbow, "first");
      expect(result.ok).toBe(false);
    });

    it("allows when spellboost card exists", () => {
      const radiantRainbow: CardInstance = {
        id: RADIANT_RAINBOW_ID,
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
            effects: [],
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

  describe("Witch's New Brew Merge", () => {
    it("merges counters from existing Brew amulets", () => {
      const existingBrew: CardInstance = {
        id: "brew-1",
        uid: "brew-uid-1",
        name: "Witch's New Brew",
        type: "Amulet",
        cost: 1,
        counters: { earth: 3 },
      } as any;

      const newBrew: CardInstance = {
        id: "brew-2",
        uid: "brew-uid-2",
        name: "Witch's New Brew",
        type: "Amulet",
        cost: 1,
      };

      state.players.first.board = [existingBrew, newBrew];
      state.players.first.graveyard = [];
      state.players.first.shadows = 0;

      mergeWitchsNewBrewOnPlay(newBrew, "first");

      // Existing brew should be removed
      expect(state.players.first.board.length).toBe(1);
      expect(state.players.first.board[0]).toBe(newBrew);

      // Counters should be merged
      expect((newBrew as any).counters.earth).toBe(3);

      // Old brew should be in graveyard
      expect(state.players.first.graveyard.length).toBe(1);
      expect(state.players.first.graveyard[0]).toBe(existingBrew);

      // Shadow should be incremented
      expect(state.players.first.shadows).toBe(1);
    });

    it("merges counters from Magic Sediment", () => {
      const sediment: CardInstance = {
        id: "sediment-1",
        uid: "sediment-uid-1",
        name: "Magic Sediment",
        type: "Amulet",
        cost: 0,
        counters: { earth: 1 },
      } as any;

      const newBrew: CardInstance = {
        id: "brew-2",
        uid: "brew-uid-2",
        name: "Witch's New Brew",
        type: "Amulet",
        cost: 1,
      };

      state.players.first.board = [sediment, newBrew];
      state.players.first.graveyard = [];
      state.players.first.shadows = 0;

      mergeWitchsNewBrewOnPlay(newBrew, "first");

      expect(state.players.first.board.length).toBe(1);
      expect((newBrew as any).counters.earth).toBe(1);
    });

    it("does not merge if no existing Brew/Sediment", () => {
      const otherAmulet: CardInstance = {
        id: "other-1",
        uid: "other-uid-1",
        name: "Other Amulet",
        type: "Amulet",
        cost: 1,
      };

      const newBrew: CardInstance = {
        id: "brew-2",
        uid: "brew-uid-2",
        name: "Witch's New Brew",
        type: "Amulet",
        cost: 1,
      };

      state.players.first.board = [otherAmulet, newBrew];
      state.players.first.graveyard = [];

      mergeWitchsNewBrewOnPlay(newBrew, "first");

      expect(state.players.first.board.length).toBe(2);
      expect(state.players.first.graveyard.length).toBe(0);
    });
  });
});















