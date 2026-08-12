/**
 * @file Mechanic Contract Test: Crystallize / Accelerate
 *
 * Rulebook: docs/svwb_rulebook_formatted.md (Crystallize / Accelerate).
 * Play path: resolvePlayCost → playSpell (Accelerate) / playAmulet (Crystallize).
 *
 * INVARIANTS:
 * - Normal play preferred when effective cost is affordable
 * - Alternate activates only when PP < effective cost and PP >= alternate cost
 * - Highest payable alternate wins
 * - Accelerate ignores board fullness; Crystallize needs a slot
 * - Spellboost / cost_mod change which form is payable via effective cost
 * - Bonus PP can unlock normal vs alternate mid-turn
 * - Crystallize amulet Countdown → Last Words summons the follower
 * - Alternate play does not increment Rally for the played card itself
 *   (Owner ruling — Rally 2026-08-12: only a follower successfully entering
 *   the field counts; Crystallize/Accelerate alternate forms are amulet/spell)
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { resolvePlayCost } from "../../src/logic/core/playCard/cost.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { useSecondPlayerPPBoost } from "../../src/logic/boosts.js";
import {
  getBoard,
  getHand,
  getGraveyard,
  getPP,
  getRally,
  getShadows,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { previewHandStats } from "../../src/helpers/enhance.js";

const CRYSTALLIZE_IDS = ["10662110", "10661110", "10663110"] as const;
const ACCELERATE_IDS = [
  "10672110",
  "10671110",
  "10673110",
  "10844120",
] as const;

describe("Crystallize / Accelerate", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  describe("coverage classifier", () => {
    it("reports all seven Apocalypse/Chronicle alternate-form cards as implemented", () => {
      for (const id of [...CRYSTALLIZE_IDS, ...ACCELERATE_IDS]) {
        const card = getCardById(id);
        expect(card, id).toBeTruthy();
        expect(getImplementationStatus(card!), id).toBe("implemented");
      }
    });
  });

  describe("cost resolution", () => {
    it("prefers normal follower play when PP covers the effective cost", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10662110"])
        .withFirstPP(4, 4)
        .build();

      const card = getHand(state, "first")[0]!;
      const plan = resolvePlayCost(card, 4);
      expect(plan.mode).toBe("normal");
      expect(plan.cost).toBe(4);

      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      const onBoard = getBoard(state, "first")[0]!;
      expect(onBoard.type).toBe("Follower");
      expect(onBoard.name).toBe("Venerating Dyer");
      expect(getPP(state, "first")).toBe(0);
    });

    it("Crystallize when PP is below normal but at/above alternate cost", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10662110"])
        .withFirstPP(2, 4)
        .build();

      const plan = resolvePlayCost(getHand(state, "first")[0]!, 2);
      expect(plan.mode).toBe("crystallize");
      expect(plan.cost).toBe(1);

      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      expect(getPP(state, "first")).toBe(1);
      const amulet = getBoard(state, "first")[0]!;
      expect(amulet.type).toBe("Amulet");
      expect(amulet.hasCountdown).toBe(true);
      expect(Number(amulet.countdown)).toBe(3);
      expect(amulet.hasLastWords).toBe(true);
      expect((amulet as any).playedAs).toBe("crystallize");
    });

    it("Accelerate resolves as a spell: cemetery + shadow, no follower from hand", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10671110"])
        .withFirstPP(3, 6)
        .build();

      const rallyBefore = getRally(state, "first");
      const shadowsBefore = getShadows(state, "first");

      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      expect(getPP(state, "first")).toBe(1);

      // Hand card became a spell and went to cemetery; summon places a copy
      expect(
        getGraveyard(state, "first").some((c) => c.name === "Shoddy Plaything"),
      ).toBe(true);
      expect(getShadows(state, "first")).toBe(shadowsBefore + 1);

      const board = getBoard(state, "first");
      expect(board.some((c) => c.name === "Shoddy Plaything")).toBe(true);
      // Summoned copy increments Rally; the Accelerate play itself does not
      // add an extra Rally beyond summons (Owner ruling — Rally 2026-08-12).
      expect(getRally(state, "first")).toBe(rallyBefore + board.length);
    });

    it("picks the highest payable Accelerate among multiple alternates", () => {
      const card = {
        id: "synthetic-multi",
        uid: "syn-1",
        name: "Multi Alt",
        type: "Follower" as const,
        cost: 8,
        keywords: [
          {
            name: "Accelerate",
            cost: 2,
            effects: [{ op: "draw", count: 1 }],
          },
          {
            name: "Accelerate",
            cost: 4,
            effects: [{ op: "draw", count: 2 }],
          },
          {
            name: "Crystallize",
            cost: 3,
            amuletKeywords: [{ name: "Countdown", turns: 1 }],
          },
        ],
      };

      expect(resolvePlayCost(card as any, 3).mode).toBe("crystallize");
      expect(resolvePlayCost(card as any, 3).cost).toBe(3);
      expect(resolvePlayCost(card as any, 4).mode).toBe("accelerate");
      expect(resolvePlayCost(card as any, 4).cost).toBe(4);
      expect(resolvePlayCost(card as any, 2).cost).toBe(2);
      expect(resolvePlayCost(card as any, 8).mode).toBe("normal");
    });
  });

  describe("board fullness", () => {
    it("blocks Crystallize when the board is full", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10662110"])
        .withFirstPP(1, 4)
        .build();

      state.players.first.board = Array.from({ length: 5 }, (_, i) => {
        const c = createCard("10001110", "board", "first");
        c.uid = `fill-${i}`;
        return c;
      });

      const check = canPlayCard(getHand(state, "first")[0]!, "first");
      expect(check.ok).toBe(false);
      expect("reason" in check ? check.reason : "").toMatch(/full/i);

      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("blocked");
      expect(getHand(state, "first").length).toBe(1);
      expect(getPP(state, "first")).toBe(1);
    });

    it("allows Accelerate on a full board (spell path)", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstHand(["10844120"])
        .withFirstPP(3, 8)
        .build();

      state.players.first.board = Array.from({ length: 5 }, (_, i) => {
        const c = createCard("10001110", "board", "first");
        c.uid = `fill-${i}`;
        return c;
      });
      const permBefore = state.players.first.permPP;

      expect(canPlayCard(getHand(state, "first")[0]!, "first").ok).toBe(true);
      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      expect(getBoard(state, "first").length).toBe(5);
      // gain_max raises permanent PP; maxPP recalculates as roundCount + perm
      expect(state.players.first.permPP).toBe(permBefore + 1);
      expect(
        getGraveyard(state, "first").some((c) => c.name.includes("Lumiore")),
      ).toBe(true);
    });
  });

  describe("Spellboost / cost reduction", () => {
    it("Spellboost lowering effective cost can force normal play instead of Accelerate", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10671110"])
        .withFirstPP(4, 6)
        .build();

      const card = getHand(state, "first")[0]!;
      // Simulate Spellboost cost reduction: effective 6 → 4
      card.cost_mod = -2;
      expect(resolvePlayCost(card, 4).mode).toBe("normal");

      // With only 3 PP, still below effective 4 → Accelerate 2
      expect(resolvePlayCost(card, 3).mode).toBe("accelerate");
      expect(resolvePlayCost(card, 3).cost).toBe(2);
    });

    it("previewHandStats shows Accelerate cost and form label when payable", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10671110"])
        .withFirstPP(3, 6)
        .build();
      const card = getHand(state, "first")[0]!;
      const preview = previewHandStats(card, 3);
      expect(preview.shownCost).toBe(2);
      expect(preview.formLabel).toBe("Accelerate");
      expect(preview.alternate?.kind).toBe("accelerate");
    });
  });

  describe("Bonus PP affordability", () => {
    it("second-player Bonus PP can raise PP enough to prefer normal play", () => {
      givenGameState({
        seed: 1,
        activePlayer: "second",
        roundCount: 4,
      })
        .withSecondHand(["10662110"])
        .withSecondPP(3, 4)
        .build();

      const card = getHand(state, "second")[0]!;
      expect(resolvePlayCost(card, getPP(state, "second")).mode).toBe(
        "crystallize",
      );

      useSecondPlayerPPBoost();
      expect(getPP(state, "second")).toBe(4);
      expect(resolvePlayCost(card, getPP(state, "second")).mode).toBe("normal");
    });
  });

  describe("Crystallize Countdown / Last Words", () => {
    it("Last Words summons the follower when the crystallize amulet is destroyed", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10662110"])
        .withFirstPP(1, 4)
        .build();

      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = getBoard(state, "first")[0]!;
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.countdown)).toBe(3);

      amulet.countdown = 0;
      cleanupDead();

      expect(
        getBoard(state, "first").some(
          (c) => c.name === "Venerating Dyer" && c.type === "Follower",
        ),
      ).toBe(true);
      expect(getBoard(state, "first").some((c) => c.type === "Amulet")).toBe(
        false,
      );
    });
  });

  describe("Rally (Owner ruling — Rally 2026-08-12)", () => {
    it("Crystallize play does not increment Rally; Last Words summon does", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10662110"])
        .withFirstPP(1, 4)
        .build();

      expect(getRally(state, "first")).toBe(0);
      playCardNoRender(getHand(state, "first"), "first", 0);
      // Amulet enter — no Rally
      expect(getRally(state, "first")).toBe(0);

      const amulet = getBoard(state, "first")[0]!;
      amulet.countdown = 0;
      cleanupDead();

      expect(getRally(state, "first")).toBe(1);
    });

    it("Accelerate play with no follower summons does not increment Rally", () => {
      // Lumiore & Argente Accelerate: gain max PP only — no follower entry
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstHand(["10844120"])
        .withFirstPP(3, 8)
        .build();

      expect(getRally(state, "first")).toBe(0);
      playCardNoRender(getHand(state, "first"), "first", 0);
      expect(getBoard(state, "first").every((c) => c.type !== "Follower")).toBe(
        true,
      );
      expect(getRally(state, "first")).toBe(0);
    });

    it("Accelerate play that summons a follower increments Rally for the summon only", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10671110"])
        .withFirstPP(2, 6)
        .build();

      expect(getRally(state, "first")).toBe(0);
      playCardNoRender(getHand(state, "first"), "first", 0);
      const followers = getBoard(state, "first").filter(
        (c) => c.type === "Follower",
      );
      expect(followers.length).toBeGreaterThanOrEqual(1);
      expect(getRally(state, "first")).toBe(followers.length);
    });
  });

  describe("Enhance regression smoke", () => {
    it("Enhance still auto-selects when PP covers the higher tier", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10001110"])
        .withFirstPP(4, 4)
        .build();

      const card = getHand(state, "first")[0]!;
      const plan = resolvePlayCost(card, 4);
      expect(plan.mode).toBe("enhance");
      expect(plan.cost).toBe(4);

      playCardNoRender(getHand(state, "first"), "first", 0);
      const onBoard = getBoard(state, "first")[0]!;
      expect(onBoard.type).toBe("Follower");
      expect(Number(onBoard.attack)).toBeGreaterThanOrEqual(4);
    });
  });
});
