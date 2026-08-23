/**
 * Red-first regression tests: discard triggers + enemy:all leader targeting.
 *
 * BUG 1 — discard effects must fire once (on_discard only, never spell).
 * BUG 2 — restore/damage from discard follow the discarded card's controller.
 * BUG 3 — enemy:all direct damage must include the enemy leader.
 */
import { describe, it, expect, beforeEach } from "vitest";
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
import "../../src/logic/core/effects/index.js";

const DEPTHS = "90044330";
const LUMIORE = "10844120";
const SAGATSUMATSU = "10644110";
const ADVENT = "10641310";
const KIT = "10142110";
const BEHEADING = "10643310";

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

  describe("BUG 1 — discard effects fire once (on_discard only)", () => {
    it("Depths via Sagatsumatsu deals exactly 1 to enemy leader (not spell+on_discard)", () => {
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect).toBeTruthy();
      discardHandCard("first", "Depths");
      expect(thenHP("second")).toBe(19);
    });

    it("second player discarding Depths via Sagatsumatsu deals exactly 1", () => {
      setupMain("second", {
        firstHP: 20,
        secondHP: 15,
        hand: [SAGATSUMATSU, DEPTHS],
        pp: 7,
      });
      whenPlayCard("second", 0);
      discardHandCard("second", "Depths");
      expect(thenHP("first")).toBe(19);
    });

    it("Advent of Eld Blades discard does not also run spell (+2/+2)", () => {
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

  describe("BUG 2 — restore follows discarded card controller", () => {
    it("first (blue) player: Depths discard restores own damaged leader", () => {
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

    it("Beheading Eld Blades discard uses discarded card for self_cost gate", () => {
      setupMain("first", {
        hand: [SAGATSUMATSU, BEHEADING],
        pp: 7,
      });
      whenPlayCard("first", 0);
      discardHandCard("first", "Beheading");
      const hand = getHand(state, "first");
      expect(hand.some((c) => c.name === "Beheading Eld Blades")).toBe(true);
      const added = hand.find(
        (c) => c.name === "Beheading Eld Blades" && c.cost === 5,
      );
      expect(added).toBeTruthy();
    });

    it("second (red) player: Depths discard restores own damaged leader", () => {
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
      const hand = getHand(state, "first");
      const depths = hand.filter((c) => c.name.includes("Depths"));
      resolvePendingTarget(depths[0]!.uid);
      expect(state.pendingTargetEffect).toBeTruthy();
      resolvePendingTarget(depths[1]!.uid);
      // 20 - 4 (Lumiore all enemies) - 1 - 1 (two Depths discards) = 14
      expect(thenHP("second")).toBe(14);
      const follower = thenBoard("second").find(
        (c) => c.name === "EnemyFollower",
      );
      expect(follower!.defense).toBe(1);
    });
  });

  describe("cross-check — Lumiore + 2 Depths = 6 enemy leader damage", () => {
    it("enemy leader takes 6 total (4 + 1 + 1) and restores discarding leader twice", () => {
      setupMain("first", {
        firstHP: 15,
        secondHP: 20,
        hand: [LUMIORE, DEPTHS, DEPTHS],
        pp: 8,
      });
      whenPlayCard("first", 0);
      const hand = getHand(state, "first");
      const depths = hand.filter((c) => c.name.includes("Depths"));
      resolvePendingTarget(depths[0]!.uid);
      resolvePendingTarget(depths[1]!.uid);
      expect(thenHP("second")).toBe(14);
      expect(thenHP("first")).toBe(17);
    });
  });
});
