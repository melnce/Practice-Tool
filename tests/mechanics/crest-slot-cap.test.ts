/**
 * @file Mechanic Contract Test: crest slot cap (owner ruling 2026-09-05)
 *
 * Crests / faith slots are capped at 5. A sixth distinct crest bounces (ignored).
 * A duplicate crest bounces without refreshing countdown.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  whenPlayCard,
  whenEndTurn,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { tickCrests } from "../../src/logic/effects/crest.js";
import { getCrests, getHP } from "../../src/core/playerHelpers.js";

const R6 = 6;

function gainCrest(
  owner: "first" | "second",
  name: string,
  extra: Record<string, unknown> = {},
) {
  whenRunEffects(
    [{ op: "crest" as const, action: "gain", name, ...extra }],
    owner,
  );
}

function fillerCrestNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Filler Crest ${i + 1}`);
}

describe("Mechanic Contract: crest slot cap", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  describe("sixth distinct crest bounces", () => {
    it("keeps exactly five crests; sixth name absent; sixth trigger never fires", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
        .withFirstBoard([{ name: "Probe Follower", attack: 1, defense: 1 }])
        .build();
      state.players.first.crests = [];

      for (const name of fillerCrestNames(5)) {
        gainCrest("first", name);
      }
      expect(getCrests(state, "first").length).toBe(5);

      gainCrest("first", "Sixth Crest", {
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "buff",
                target: "ally:all",
                attack: 1,
                defense: 1,
              },
            ],
          },
        ],
      });

      expect(getCrests(state, "first").length).toBe(5);
      expect(
        getCrests(state, "first").some((c) => c.name === "Sixth Crest"),
      ).toBe(false);

      const follower = state.players.first.board[0]!;
      expect(follower.attack).toBe(1);
      expect(follower.defense).toBe(1);

      whenEndTurn();

      expect(follower.attack).toBe(1);
      expect(follower.defense).toBe(1);
    });
  });

  describe("duplicate crest bounces without refreshing countdown", () => {
    it("re-gaining same crest leaves one copy at current countdown", () => {
      givenGameState({ seed: 1, activePlayer: "first" }).build();
      state.players.first.crests = [];

      gainCrest("first", "Countdown Crest", { countdown: 4 });
      expect(getCrests(state, "first").length).toBe(1);
      expect(getCrests(state, "first")[0]!.countdown).toBe(4);

      tickCrests("first");
      tickCrests("first");
      tickCrests("first");
      expect(getCrests(state, "first").length).toBe(1);
      expect(getCrests(state, "first")[0]!.countdown).toBe(1);

      gainCrest("first", "Countdown Crest", { countdown: 4 });

      expect(getCrests(state, "first").length).toBe(1);
      expect(getCrests(state, "first")[0]!.countdown).toBe(1);
    });
  });

  describe("Maddening Benison (10263310) at crest cap", () => {
    function setupMaddeningPlay(existingCrests: number) {
      givenGameState({
        seed: 1,
        activePlayer: "first",
        roundCount: R6,
      })
        .withFirstHP(5, 20)
        .withFirstPP(4, R6)
        .withFirstHand(["10263310"])
        .build();
      state.players.first.crests = [];

      for (const name of fillerCrestNames(existingCrests)) {
        gainCrest("first", name);
      }
    }

    it("with five crests already: heals to 15, crest bounces, no LW damage after two turn starts", () => {
      setupMaddeningPlay(5);
      whenPlayCard("first", 0);

      expect(getHP(state, "first")).toBe(15);
      expect(getCrests(state, "first").length).toBe(5);
      expect(
        getCrests(state, "first").some((c) => c.name === "Maddening Benison"),
      ).toBe(false);

      tickCrests("first");
      expect(getHP(state, "first")).toBe(15);

      tickCrests("first");
      expect(getHP(state, "first")).toBe(15);
    });

    it("with four crests: heals to 15, gains crest, LW deals 10 on second owner turn start", () => {
      setupMaddeningPlay(4);
      whenPlayCard("first", 0);

      expect(getHP(state, "first")).toBe(15);
      expect(getCrests(state, "first").length).toBe(5);
      const crest = getCrests(state, "first").find(
        (c) => c.name === "Maddening Benison",
      )!;
      expect(crest.countdown).toBe(2);

      tickCrests("first");
      expect(getHP(state, "first")).toBe(15);
      expect(crest.countdown).toBe(1);

      tickCrests("first");
      expect(getHP(state, "first")).toBe(5);
      expect(
        getCrests(state, "first").some((c) => c.name === "Maddening Benison"),
      ).toBe(false);
    });
  });
});
