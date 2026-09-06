/**
 * name-keyed filter/condition on targeted select pools must reach evaluateCardCondition.
 *
 * Bug: applyFilters built sharedCond from an allowlist that omitted `name`, so
 * Enamored Researcher / Ecstatic Scholar / Reaved Order offered every allied
 * follower. Printed card text is the spec.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
  thenHand,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import {
  resolvePendingTarget,
  forceCompleteOrFizzlePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

const RESEARCHER = "10932110";
const SCHOLAR = "10933110";
const REAVED_ORDER = "10632310";
const TEST_SUBJECT = "10931110";
const CRYSTALSPAWN = "10631110";
const FILLER = "10111310";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
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
}

function allyFollower(name: string, stats = { attack: 1, defense: 3 }) {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: stats.attack,
      defense: stats.defense,
    },
    "board",
    "first",
  );
  c.peak_defense = stats.defense;
  state.players.first.board.push(c);
  return c;
}

function putNamedOnBoard(cardId: string): CardInstance {
  const c = createCard(cardId, "board", "first");
  c.peak_defense = Number(c.defense) || 1;
  state.players.first.board.push(c);
  return c;
}

function poolNames(): string[] {
  const pending = state.pendingTargetEffect;
  const pool = pending?.pool ?? [];
  return pool.map((c) => String(c.name));
}

function hasKeyword(
  card: CardInstance | undefined | null,
  kw: string,
): boolean {
  if (!card) return false;
  const flag = `has${kw}` as keyof CardInstance;
  if ((card as any)[flag]) return true;
  if (
    card.keywords?.some(
      (k) => (typeof k === "string" ? k : (k as any)?.name) === kw,
    )
  )
    return true;
  return !!(card as any).keywordState?.[`has${kw}`];
}

function fuseToInitiator(initiatorUid: string, partnerUid: string) {
  startFuseFromHand("first", initiatorUid);
  resolvePendingTarget(partnerUid);
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
}

describe("name filter on targeted selection pools", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe("10932110 Enamored Researcher — Evolve give Bane", () => {
    it("selection pool is only Obsessed Test Subject (not unrelated allies)", () => {
      setupTurn(7, { hand: [RESEARCHER], pp: 4 });
      whenPlayCard("first", 0);
      // Fanfare summons 2 Test Subjects; add an unrelated ally.
      const unrelated = allyFollower("Unrelated Ally");
      const subjects = thenBoard("first").filter(
        (c) => c.name === "Obsessed Test Subject",
      );
      expect(subjects.length).toBeGreaterThanOrEqual(1);

      const researcher = findOnBoard("first", "Enamored Researcher")!;
      state.players.first.evoCharges = 2;
      whenEvolve(researcher, "first");

      const names = poolNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((n) => n === "Obsessed Test Subject")).toBe(true);
      expect(names).not.toContain("Unrelated Ally");
      expect(names).not.toContain(unrelated.name);
    });

    it("with no Obsessed Test Subject on board, Evolve gives Bane to nothing", () => {
      setupTurn(7, { hand: [RESEARCHER], pp: 4 });
      // Place researcher alone without playing (avoids fanfare summons).
      const researcher = putNamedOnBoard(RESEARCHER);
      const unrelated = allyFollower("Unrelated Ally");
      // Strip any accidental subjects.
      state.players.first.board = state.players.first.board.filter(
        (c) => c.name !== "Obsessed Test Subject",
      );
      expect(
        thenBoard("first").some((c) => c.name === "Obsessed Test Subject"),
      ).toBe(false);

      state.players.first.evoCharges = 2;
      whenEvolve(researcher, "first");

      expect(state.pendingTargetEffect).toBeFalsy();
      expect(hasKeyword(unrelated, "Bane")).toBe(false);
      expect(thenBoard("first").some((c) => hasKeyword(c, "Bane"))).toBe(false);
    });
  });

  describe("10933110 Ecstatic Scholar — Super-Evolve give Drain", () => {
    it("selection pool is only Obsessed Test Subject after fuse", () => {
      setupTurn(7, {
        hand: [SCHOLAR, FILLER],
        pp: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      fuseToInitiator(scholar.uid, material.uid);
      expect(scholar.isFused).toBe(true);

      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );
      // Fanfare already summons one subject; add unrelated ally.
      const unrelated = allyFollower("Unrelated Ally");
      const subjects = thenBoard("first").filter(
        (c) => c.name === "Obsessed Test Subject",
      );
      expect(subjects.length).toBeGreaterThanOrEqual(1);

      const onBoard = findOnBoard("first", "Ecstatic Scholar")!;
      onBoard.peak_defense = Number(onBoard.defense);
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(onBoard, "first");

      const names = poolNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((n) => n === "Obsessed Test Subject")).toBe(true);
      expect(names).not.toContain("Unrelated Ally");
      expect(names).not.toContain(unrelated.name);
    });

    it("with no Obsessed Test Subject, Super-Evolve gives Drain to nothing", () => {
      setupTurn(7, {
        hand: [SCHOLAR, FILLER],
        pp: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      fuseToInitiator(scholar.uid, material.uid);

      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );
      // Remove fanfare-summoned subjects; leave unrelated ally.
      state.players.first.board = state.players.first.board.filter(
        (c) => c.name !== "Obsessed Test Subject",
      );
      const unrelated = allyFollower("Unrelated Ally");
      expect(
        thenBoard("first").some((c) => c.name === "Obsessed Test Subject"),
      ).toBe(false);

      const onBoard = findOnBoard("first", "Ecstatic Scholar")!;
      onBoard.peak_defense = Number(onBoard.defense);
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(onBoard, "first");

      expect(state.pendingTargetEffect).toBeFalsy();
      expect(hasKeyword(unrelated, "Drain")).toBe(false);
      expect(thenBoard("first").some((c) => hasKeyword(c, "Drain"))).toBe(
        false,
      );
    });
  });

  describe("10632310 Reaved Order — destroy allied Crystalspawn", () => {
    it("selection pool is only Crystalspawn (not unrelated allies)", () => {
      setupTurn(5, {
        hand: [REAVED_ORDER],
        pp: 1,
        deck: ["10131110", "10132110", "10131120", "10132120", FILLER, FILLER],
      });
      const spawn = putNamedOnBoard(CRYSTALSPAWN);
      const unrelated = allyFollower("Unrelated Ally");

      whenPlayCard("first", 0);

      const names = poolNames();
      expect(names).toEqual(["Crystalspawn"]);
      expect(names).not.toContain("Unrelated Ally");
      expect(poolNames().every((n) => n === "Crystalspawn")).toBe(true);

      resolvePendingTarget(spawn.uid);
      expect(findOnBoard("first", "Crystalspawn")).toBeFalsy();
      expect(findOnBoard("first", "Unrelated Ally")).toBeTruthy();
      expect(unrelated.defense).toBe(3);
    });

    it("with no Crystalspawn on board, destroys nothing and does not prompt", () => {
      setupTurn(5, {
        hand: [REAVED_ORDER],
        pp: 1,
        deck: ["10131110", "10132110", "10131120", "10132120", FILLER, FILLER],
      });
      const unrelated = allyFollower("Unrelated Ally");
      const handBeforeCards = getHand(state, "first").map((c) => c.uid);
      const handBeforeLen = handBeforeCards.length;

      const outcome = whenPlayCard("first", 0);

      // Rulebook (docs/svwb_rulebook_formatted.md §playing-cards): if no valid
      // target exists, SVWB blocks the play rather than letting it fizzle. So
      // the destroy clause never runs, and neither does Draw 2 Runecraft
      // followers — the spell stays in hand unspent.
      expect(outcome.kind).toBe("blocked");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Unrelated Ally")).toBeTruthy();
      expect(Number(unrelated.defense)).toBe(3);

      const handAfter = getHand(state, "first");
      expect(handAfter.length).toBe(handBeforeLen);
      expect(handAfter.map((c) => c.uid)).toEqual(handBeforeCards);
      expect(handAfter.some((c) => c.id === REAVED_ORDER)).toBe(true);
      // Draw did not happen: no new Runecraft followers entered hand.
      const drawnRunecraft = handAfter.filter(
        (c) =>
          !handBeforeCards.includes(c.uid) &&
          c.type === "Follower" &&
          String((c as any).class ?? (c as any).cardClass) === "Runecraft",
      );
      expect(drawnRunecraft).toEqual([]);
    });

    it("draws the top 2 deck cards (not Runecraft-follower search)", () => {
      // Deck bottom → top: Runecraft followers deeper, non-Runecraft on top.
      // Old data (search) would add 10131110 + 10132110; Aug 28 patch draws
      // 10111310 then 10102110 (top of deck).
      const deckBottomToTop = [
        FILLER,
        "10131110", // Runeblade Conductor — Runecraft follower
        "10132110", // Ms. Miranda — Runecraft follower
        "10102110", // Apollo — Neutral follower (2nd from top)
        "10111310", // Fairy Convocation — Forestcraft spell (top)
      ];
      setupTurn(5, {
        hand: [REAVED_ORDER],
        pp: 1,
        deck: deckBottomToTop,
      });
      const spawn = putNamedOnBoard(CRYSTALSPAWN);

      whenPlayCard("first", 0);
      resolvePendingTarget(spawn.uid);

      expect(findOnBoard("first", "Crystalspawn")).toBeFalsy();

      const drawnIds = getHand(state, "first").map((c) => c.id);
      expect(drawnIds).toContain("10111310");
      expect(drawnIds).toContain("10102110");
      expect(drawnIds).not.toContain("10131110");
      expect(drawnIds).not.toContain("10132110");
    });
  });
});
