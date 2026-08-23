/**
 * Regression tests: discard trigger pinning + enemy:all leader targeting.
 *
 * BUG 1 (double on_discard fire): could NOT be reproduced on origin/main — pinning
 * tests assert correct single-fire behaviour. See PR for investigation notes.
 * BUG 3: enemy:all direct damage must include the enemy leader.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenHP,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHand } from "../../src/core/playerHelpers.js";
import * as targeted from "../../src/logic/effects/ops/targeted/index.js";
import * as leaderModule from "../../src/logic/effects/leader.js";
import "../../src/logic/core/effects/index.js";

const DEPTHS = "90044330";
const LUMIORE = "10844120";
const SAGATSUMATSU = "10644110";
const ADVENT = "10641310";
const KIT = "10142110";

function setupMain(
  player: "first" | "second",
  opts: {
    hand?: (string | object)[];
    pp?: number;
    round?: number;
    firstHP?: number;
    secondHP?: number;
    secondBoard?: object[];
    firstBoard?: object[];
  } = {},
) {
  const round = opts.round ?? 8;
  const max = Math.min(round, 10);
  let b = givenGameState({ seed: 42, activePlayer: player, roundCount: round });
  if (opts.firstHP !== undefined) b = b.withFirstHP(opts.firstHP);
  if (opts.secondHP !== undefined) b = b.withSecondHP(opts.secondHP);
  if (opts.firstBoard) b = b.withFirstBoard(opts.firstBoard);
  if (opts.secondBoard) b = b.withSecondBoard(opts.secondBoard);
  if (player === "first") {
    b = b.withFirstPP(opts.pp ?? max, max);
    if (opts.hand) b = b.withFirstHand(opts.hand);
  } else {
    b = b.withSecondPP(opts.pp ?? max, max);
    if (opts.hand) b = b.withSecondHand(opts.hand);
  }
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = player;
}

function discardHandCard(player: "first" | "second", cardNamePart: string) {
  const hand = getHand(state, player);
  const card = hand.find((c) => c.name.includes(cardNamePart));
  if (!card) throw new Error(`Card not found: ${cardNamePart}`);
  resolvePendingTarget(card.uid);
}

describe("discard and leader targets", () => {
  beforeEach(() => resetUidCounter());

  describe("discard on_discard pinning (single fire)", () => {
    it("Sagatsumatsu select-discard: one Depths → 1 enemy damage, 1 ally heal", () => {
      const damageSpy = vi.spyOn(leaderModule, "applyLeaderDamage");
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", "Depths");
      const enemyHits = damageSpy.mock.calls.filter((c) => c[0] === "second");
      expect(enemyHits).toHaveLength(1);
      expect(enemyHits[0]?.[1]).toBe(1);
      expect(thenHP("second")).toBe(19);
      expect(thenHP("first")).toBe(16);
      damageSpy.mockRestore();
    });

    it("Lumiore batch-discard: two Depths → 2 enemy damage, 2 ally heal (plus fanfare)", () => {
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [LUMIORE, DEPTHS, DEPTHS],
        pp: 8,
      });
      whenPlayCard("first", 0);
      const depths = getHand(state, "first").filter((c) =>
        c.name.includes("Depths"),
      );
      resolvePendingTarget(depths[0]!.uid);
      resolvePendingTarget(depths[1]!.uid);
      // After fix: 4 (Lumiore) + 1 + 1 (Depths) = 6 enemy leader damage
      expect(thenHP("second")).toBe(14);
      expect(thenHP("first")).toBe(17);
    });

    it("dispatchTargetedOp routes select-discard through discard op once", () => {
      const ops: string[] = [];
      const orig = targeted.dispatchTargetedOp;
      vi.spyOn(targeted, "dispatchTargetedOp").mockImplementation((ctx) => {
        ops.push(ctx.eff.op);
        return orig(ctx);
      });
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", "Depths");
      expect(ops.filter((op) => op.includes("discard"))).toEqual(["discard"]);
      vi.restoreAllMocks();
    });

    it("Advent discard does not run spell (+2/+2)", () => {
      setupMain("first", {
        hand: [SAGATSUMATSU, ADVENT],
        firstBoard: [
          { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
        ],
        pp: 7,
      });
      const ally = thenBoard("first").find((c) => c.name === "Ally")!;
      whenPlayCard("first", 0);
      discardHandCard("first", "Advent");
      expect(ally.attack).toBe(2);
      expect(ally.defense).toBe(2);
    });

    it("Kit discard still gives +1/+0 once (regression)", () => {
      setupMain("first", {
        hand: [SAGATSUMATSU, KIT],
        firstBoard: [
          { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
        ],
        pp: 7,
      });
      const ally = thenBoard("first").find((c) => c.name === "Ally")!;
      whenPlayCard("first", 0);
      discardHandCard("first", "Kit");
      expect(ally.attack).toBe(3);
    });
  });

  describe("Depths discard restore — pinned (no crest)", () => {
    it("blue (first): +1 heal, -1 enemy damage", () => {
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", "Depths");
      expect(thenHP("first")).toBe(16);
      expect(thenHP("second")).toBe(19);
    });

    it("red (second): +1 heal, -1 enemy damage", () => {
      setupMain("second", {
        firstHP: 20,
        secondHP: 15,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("second", 0);
      discardHandCard("second", "Depths");
      expect(thenHP("second")).toBe(16);
      expect(thenHP("first")).toBe(19);
    });
  });

  describe("BUG 3 — enemy:all includes leader", () => {
    it("Lumiore fanfare deals 4 to enemy leader and followers", () => {
      setupMain("first", {
        firstHP: 20,
        secondHP: 20,
        hand: [LUMIORE, DEPTHS, DEPTHS],
        secondBoard: [
          {
            name: "EnemyFollower",
            type: "Follower",
            cost: 2,
            attack: 2,
            defense: 5,
          },
        ],
        pp: 8,
      });
      whenPlayCard("first", 0);
      const depths = getHand(state, "first").filter((c) =>
        c.name.includes("Depths"),
      );
      resolvePendingTarget(depths[0]!.uid);
      resolvePendingTarget(depths[1]!.uid);
      expect(thenHP("second")).toBe(14);
      const follower = thenBoard("second").find(
        (c) => c.name === "EnemyFollower",
      );
      expect(follower!.defense).toBe(1);
    });
  });
});
