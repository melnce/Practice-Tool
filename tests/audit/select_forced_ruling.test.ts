/**
 * Owner ruling (2026-08-16): "Select" clauses are mandatory while a legal target
 * exists — no decline, no cancel. Empty zone → play succeeds, selection fizzles.
 * "If you selected one, …" follow-ups run only when something was selected.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenDeck,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHand, getGraveyard } from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function setupTurn(
  round: number,
  opts: {
    hand?: (string | object)[];
    pp?: number;
    deck?: (string | object)[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

function allyFollower(name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: 1, defense: 1 },
    "board",
    "first",
  );
  c.peak_defense = 1;
  state.players.first.board.push(c);
  return c;
}

describe("Owner ruling — select is forced", () => {
  beforeEach(() => resetUidCounter());

  describe("Field Scientist (10372120) — hand discard select", () => {
    it("with 2 other cards: play pauses on mandatory discard; resolve discards chosen card and draws 3", () => {
      setupTurn(R6, {
        hand: [
          "10372120",
          { name: "KeepA", type: "Spell", cost: 1 },
          { name: "DiscardMe", type: "Spell", cost: 1 },
        ],
        pp: 5,
        deck: [
          { name: "Draw1", type: "Follower", cost: 1, attack: 1, defense: 1 },
          { name: "Draw2", type: "Follower", cost: 1, attack: 1, defense: 1 },
          { name: "Draw3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        ],
      });
      const deckBefore = thenDeck("first").length;
      const handAfterPlay = getHand(state, "first");
      const toDiscard = handAfterPlay.find((c) => c.name === "DiscardMe")!;
      expect(toDiscard).toBeTruthy();

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("paused");
      expect(findOnBoard("first", "Field Scientist")).toBeDefined();
      expect(state.pendingTargetEffect).toBeTruthy();
      expect(poolUids().length).toBeGreaterThan(0);
      // Draw 3 must not run until discard is resolved.
      expect(thenDeck("first").length).toBe(deckBefore);
      expect(
        thenHand("first")
          .map((c) => c.name)
          .sort(),
      ).toEqual(["DiscardMe", "KeepA"].sort());

      resolvePendingTarget(toDiscard.uid);
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(
        getGraveyard(state, "first").some((c) => c.name === "DiscardMe"),
      ).toBe(true);
      expect(getHand(state, "first").some((c) => c.name === "KeepA")).toBe(
        true,
      );
      expect(thenDeck("first").length).toBe(deckBefore - 3);
      expect(
        thenHand("first").filter((c) =>
          ["Draw1", "Draw2", "Draw3"].includes(c.name),
        ).length,
      ).toBe(3);
    });

    it("alone in hand: plays successfully, no discard, still draws 3", () => {
      setupTurn(R6, {
        hand: ["10372120"],
        pp: 5,
        deck: [
          { name: "Draw1", type: "Follower", cost: 1, attack: 1, defense: 1 },
          { name: "Draw2", type: "Follower", cost: 1, attack: 1, defense: 1 },
          { name: "Draw3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        ],
      });
      const deckBefore = thenDeck("first").length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Field Scientist")).toBeDefined();
      expect(getGraveyard(state, "first").length).toBe(0);
      expect(thenDeck("first").length).toBe(deckBefore - 3);
      expect(
        thenHand("first").filter((c) =>
          ["Draw1", "Draw2", "Draw3"].includes(c.name),
        ).length,
      ).toBe(3);
    });
  });

  describe("Ruby, Greedy Cherub (10101110) — optional empty-hand fizzle", () => {
    it("empty remaining hand: plays, no return, still draws 1", () => {
      setupTurn(R6, {
        hand: ["10101110"],
        pp: 2,
        deck: [{ name: "DeckCard", type: "Follower", attack: 1, defense: 1 }],
      });
      const deckBefore = thenDeck("first").length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Ruby, Greedy Cherub")).toBeDefined();
      expect(thenDeck("first").length).toBe(deckBefore - 1);
      expect(thenHand("first").some((c) => c.name === "DeckCard")).toBe(true);
    });

    it("with cards in hand: selection pending and mandatory; resolve returns chosen card and draws 1", () => {
      setupTurn(R6, {
        hand: ["10101110", { name: "ToReturn", type: "Spell", cost: 1 }],
        pp: 2,
        deck: [{ name: "DeckCard", type: "Follower", attack: 1, defense: 1 }],
      });
      const deckBefore = thenDeck("first").length;
      const toReturn = getHand(state, "first").find(
        (c) => c.name === "ToReturn",
      )!;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect).toBeTruthy();
      expect(poolUids()).toContain(toReturn.uid);
      expect(thenDeck("first").length).toBe(deckBefore);

      resolvePendingTarget(toReturn.uid);
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(thenDeck("first").some((c) => c.name === "ToReturn")).toBe(true);
      expect(thenDeck("first").length).toBe(deckBefore);
      expect(thenHand("first").some((c) => c.name === "DeckCard")).toBe(true);
    });
  });

  describe("Wasteland of Destruction (10372210) — conditional then", () => {
    it("no other allied card: plays; destroy and draw 2 do not happen", () => {
      setupTurn(R6, {
        hand: ["10372210"],
        pp: 2,
        deck: [
          {
            name: "WouldDraw1",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
          {
            name: "WouldDraw2",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
        ],
      });
      const deckBefore = thenDeck("first").length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Wasteland of Destruction")).toBeDefined();
      expect(thenDeck("first").length).toBe(deckBefore);
      expect(thenHand("first").length).toBe(0);
    });

    it("with one other allied card: selection mandatory; resolve destroys ally and draws 2", () => {
      setupTurn(R6, {
        hand: ["10372210"],
        pp: 2,
        deck: ["10171320", "10171310"],
      });
      const ally = allyFollower("Token");
      const deckBefore = thenDeck("first").length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect).toBeTruthy();
      expect(poolUids()).toContain(ally.uid);
      expect(thenDeck("first").length).toBe(deckBefore);

      resolvePendingTarget(ally.uid);
      cleanupDead();
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Token")).toBeFalsy();
      expect(thenDeck("first").length).toBe(deckBefore - 2);
      expect(thenHand("first").length).toBe(2);
    });
  });

  describe("Supplicant of Destruction (10372110) — board select spot check", () => {
    it("with legal target: selection cannot be bypassed; resolve destroys ally and deals 2 damage", () => {
      setupTurn(R6, { hand: ["10372110"], pp: 2 });
      const ally = allyFollower();
      const foe = createCard(
        { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "second",
      );
      foe.peak_defense = 5;
      state.players.second.board.push(foe);
      const deckBefore = thenDeck("first").length;

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect).toBeTruthy();
      const source = findOnBoard("first", "Supplicant of Destruction")!;
      expect(poolUids()).toContain(ally.uid);
      expect(poolUids()).not.toContain(source.uid);
      expect(thenDeck("first").length).toBe(deckBefore);

      resolvePendingTarget(ally.uid);
      cleanupDead();
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Ally")).toBeFalsy();
      expect(Number(foe.defense)).toBeLessThan(5);
    });
  });
});
