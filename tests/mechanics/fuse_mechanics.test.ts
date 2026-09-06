/**
 * @file Mechanic Contract Test: Fuse: Cards (generic fuse)
 *
 * Owner rulings:
 * - No recipe whitelist — any hand card may be fused to a Fuse: Cards host
 * - Once per turn per card instance (lastFuseRound on the host)
 * - Persistent isFused flag survives hand → field
 * - Sephie: on-fuse spends 2 PP and summons only when PP ≥ 2 at fuse time
 * - Fuse is always legal regardless of PP; material always consumed; isFused always set
 * - Ecstatic Scholar: super-evolve drain only when fused in hand
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  resolvePendingTarget,
  forceCompleteOrFizzlePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { fuse_finalize_cards } from "../../src/logic/effects/ops/fuse/fuse.cards.js";

import { getPP } from "../../src/core/playerHelpers.js";
import {
  undo,
  redo,
  beginAction,
  commitAction,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const FILLER = "10111310";
const SEPHIE = "10934110";
const SCHOLAR = "10933110";
const TEST_SUBJECT = "10931110";

function setupFuseTurn(
  hand: string[],
  pp: number,
  round: number = R6,
  deck: string[] = [FILLER, FILLER, FILLER],
) {
  const max = Math.min(round, 10);
  givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withFirstHand(hand)
    .withFirstDeck(deck)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function fuseToInitiator(initiatorUid: string, partnerUid: string) {
  startFuseFromHand("first", initiatorUid);
  resolvePendingTarget(partnerUid);
  // Fuse: Cards uses multi-select + confirm; force-complete with selected targets.
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
}

function subjectCount(): number {
  return thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
    .length;
}

function summonedSubjects() {
  return thenBoard("first").filter((c) => c.name === "Obsessed Test Subject");
}

function expectRealTestSubjectToken() {
  const subjects = summonedSubjects();
  expect(subjects.length).toBeGreaterThan(0);
  for (const s of subjects) {
    expect(s.id).toBe(TEST_SUBJECT);
  }
}

function scholarDrainPayoff(scholarOnBoard: ReturnType<typeof findOnBoard>) {
  const subject = createCard(TEST_SUBJECT, "board", "first");
  state.players.first.board.push(subject);
  scholarOnBoard!.peak_defense = scholarOnBoard!.defense;
  state.players.first.superEvoPoints = 1;
  whenSuperEvolve(scholarOnBoard!, "first");

  const pending = state.pendingTargetEffect;
  expect(pending).toBeDefined();
  const uid =
    pending!.poolUids?.find((id) => id === subject.uid) ??
    pending!.pool?.find((c) => c.uid === subject.uid)?.uid;
  expect(uid).toBeTruthy();
  resolvePendingTarget(String(uid));

  const updated = state.players.first.board.find((c) => c.uid === subject.uid)!;
  const hasDrain =
    updated.hasDrain ||
    updated.keywords?.some(
      (k) => (typeof k === "string" ? k : k?.name) === "Drain",
    ) ||
    updated.keywordState?.hasDrain;
  return hasDrain;
}

describe("Mechanic Contract: Fuse: Cards", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    (globalThis as any).HEADLESS = true;
  });

  describe("Sephie, Maven Convict — on-fuse summon", () => {
    it("with 0 PP: material consumed, isFused set, no spend, no token, fuse slot used", () => {
      setupFuseTurn([SEPHIE, FILLER, FILLER], 0);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const [mat1, mat2] = thenHand("first").filter((c) => c.id === FILLER);

      fuseToInitiator(sephie.uid, mat1.uid);

      expect(sephie.isFused).toBe(true);
      expect(sephie.lastFuseRound).toBe(state.roundCount);
      expect(thenHand("first").some((c) => c.uid === mat1.uid)).toBe(false);
      expect(getPP(state, "first")).toBe(0);
      expect(subjectCount()).toBe(0);

      fuseToInitiator(sephie.uid, mat2.uid);
      expect(thenHand("first").some((c) => c.uid === mat2.uid)).toBe(true);
    });

    it("with exactly 2 PP: PP drops by exactly 2 and token is summoned", () => {
      setupFuseTurn([SEPHIE, FILLER], 2);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
      expect(getPP(state, "first")).toBe(0);
      expect(subjectCount()).toBe(1);
      expectRealTestSubjectToken();
    });

    it("with 1 PP: material consumed, PP unchanged, no token", () => {
      setupFuseTurn([SEPHIE, FILLER], 1);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
      expect(getPP(state, "first")).toBe(1);
      expect(subjectCount()).toBe(0);
    });

    it("with 2+ PP: fusing summons Obsessed Test Subject and spends 2 PP", () => {
      setupFuseTurn([SEPHIE, FILLER], 4);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(sephie.lastFuseRound).toBe(state.roundCount);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
      expect(subjectCount()).toBe(1);
      expect(getPP(state, "first")).toBe(ppBefore - 2);
      expectRealTestSubjectToken();
    });

    it("with fewer than 2 PP: fuse still consumes material and marks isFused", () => {
      setupFuseTurn([SEPHIE, FILLER], 1);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
      expect(subjectCount()).toBe(0);
      expect(getPP(state, "first")).toBe(ppBefore);
    });

    it("blocks a second fuse to the same Sephie in the same turn", () => {
      setupFuseTurn([SEPHIE, FILLER, FILLER], 6);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const [mat1, mat2] = thenHand("first").filter((c) => c.id === FILLER);

      fuseToInitiator(sephie.uid, mat1.uid);
      const subjectsAfterFirst = thenBoard("first").filter(
        (c) => c.name === "Obsessed Test Subject",
      ).length;

      fuseToInitiator(sephie.uid, mat2.uid);

      expect(thenHand("first").some((c) => c.uid === mat2.uid)).toBe(true);
      expect(
        thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
          .length,
      ).toBe(subjectsAfterFirst);
    });

    it("allows fusing a different Sephie copy in the same turn", () => {
      setupFuseTurn([SEPHIE, SEPHIE, FILLER, FILLER], 6);
      const sephies = thenHand("first").filter((c) => c.id === SEPHIE);
      const materials = thenHand("first").filter((c) => c.id === FILLER);
      expect(sephies.length).toBe(2);

      fuseToInitiator(sephies[0]!.uid, materials[0]!.uid);
      fuseToInitiator(sephies[1]!.uid, materials[1]!.uid);

      expect(sephies[0]!.isFused).toBe(true);
      expect(sephies[1]!.isFused).toBe(true);
      expect(
        thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
          .length,
      ).toBe(2);
      expectRealTestSubjectToken();
    });

    it("multi-select consumes all partners once and summons once at ≥2 PP", () => {
      setupFuseTurn([SEPHIE, FILLER, FILLER, FILLER], 4);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const mats = thenHand("first").filter((c) => c.id === FILLER);
      expect(mats.length).toBe(3);

      startFuseFromHand("first", sephie.uid);
      const pending = state.pendingTargetEffect;
      expect(pending?.requiresConfirmation).toBe(true);
      expect(pending?.selectCount).toBe(3);

      resolvePendingTarget(mats[0]!.uid);
      resolvePendingTarget(mats[1]!.uid);
      expect(state.pendingTargetEffect?.targetUids?.length).toBe(2);
      forceCompleteOrFizzlePendingTarget();

      expect(sephie.isFused).toBe(true);
      expect(thenHand("first").some((c) => c.uid === mats[0]!.uid)).toBe(false);
      expect(thenHand("first").some((c) => c.uid === mats[1]!.uid)).toBe(false);
      expect(thenHand("first").some((c) => c.uid === mats[2]!.uid)).toBe(true);
      expect(subjectCount()).toBe(1);
      expect(getPP(state, "first")).toBe(2);
      expect(sephie._fusedCards?.length).toBe(2);
    });
  });

  describe("Ecstatic Scholar — fused super-evolve drain", () => {
    it("super-evolved after fuse grants Drain to a selected Test Subject", () => {
      setupFuseTurn([SCHOLAR, FILLER], 6, R6, [FILLER, FILLER, FILLER]);
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;

      fuseToInitiator(scholar.uid, material.uid);
      expect(scholar.isFused).toBe(true);

      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );
      const subject = createCard(TEST_SUBJECT, "board", "first");
      state.players.first.board.push(subject);

      const scholarOnBoard = findOnBoard("first", "Ecstatic Scholar")!;
      scholarOnBoard.peak_defense = scholarOnBoard.defense;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(scholarOnBoard, "first");

      const pending = state.pendingTargetEffect;
      expect(pending).toBeDefined();
      const uid =
        pending!.poolUids?.find((id) => id === subject.uid) ??
        pending!.pool?.find((c) => c.uid === subject.uid)?.uid;
      expect(uid).toBeTruthy();
      resolvePendingTarget(String(uid));

      const updated = state.players.first.board.find(
        (c) => c.uid === subject.uid,
      )!;
      const hasDrain =
        updated.hasDrain ||
        updated.keywords?.some(
          (k) => (typeof k === "string" ? k : k?.name) === "Drain",
        ) ||
        updated.keywordState?.hasDrain;
      expect(hasDrain).toBe(true);
    });

    it("fused at 0 PP still grants Drain on super-evolve", () => {
      setupFuseTurn([SCHOLAR, FILLER], 0, R6, [FILLER, FILLER, FILLER]);
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;

      fuseToInitiator(scholar.uid, material.uid);
      expect(scholar.isFused).toBe(true);
      expect(getPP(state, "first")).toBe(0);

      state.players.first.pp = 6;
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );

      const scholarOnBoard = findOnBoard("first", "Ecstatic Scholar")!;
      expect(scholarDrainPayoff(scholarOnBoard)).toBe(true);
    });

    it("super-evolved without fuse grants no extra drain selection", () => {
      setupFuseTurn([SCHOLAR], 6);
      whenPlayCard("first", 0);
      const subject = createCard(TEST_SUBJECT, "board", "first");
      state.players.first.board.push(subject);

      const scholarOnBoard = findOnBoard("first", "Ecstatic Scholar")!;
      scholarOnBoard.peak_defense = scholarOnBoard.defense;
      state.players.first.superEvoPoints = 1;
      whenSuperEvolve(scholarOnBoard, "first");

      expect(state.pendingTargetEffect).toBeUndefined();
      const updated = state.players.first.board.find(
        (c) => c.uid === subject.uid,
      )!;
      const hasDrain =
        updated.hasDrain ||
        updated.keywords?.some(
          (k) => (typeof k === "string" ? k : k?.name) === "Drain",
        ) ||
        updated.keywordState?.hasDrain;
      expect(hasDrain).toBeFalsy();
    });

    it("isFused survives playing the card from hand", () => {
      setupFuseTurn([SCHOLAR, FILLER], 6);
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      fuseToInitiator(scholar.uid, material.uid);

      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );
      const onBoard = findOnBoard("first", "Ecstatic Scholar")!;
      expect(onBoard.isFused).toBe(true);
    });
  });

  describe("undo/redo restores fuse flags in snapshotted state", () => {
    it("undo restores lastFuseRound and isFused; redo reapplies", () => {
      setupFuseTurn([SEPHIE, FILLER], 4);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;

      beginAction("Fuse test");
      fuse_finalize_cards("first", sephie.uid, [material]);
      commitAction({ autoRender: false });

      expect(sephie.isFused).toBe(true);
      expect(sephie.lastFuseRound).toBe(state.roundCount);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);

      undo({ autoRender: false });
      const sephieAfterUndo = thenHand("first").find(
        (c) => c.uid === sephie.uid,
      )!;
      const materialAfterUndo = thenHand("first").find(
        (c) => c.uid === material.uid,
      );
      expect(sephieAfterUndo.isFused).not.toBe(true);
      expect(sephieAfterUndo.lastFuseRound).not.toBe(state.roundCount);
      expect(materialAfterUndo).toBeDefined();

      const redid = redo({ autoRender: false });
      expect(redid).toBe(true);
      const sephieAfterRedo = thenHand("first").find(
        (c) => c.uid === sephie.uid,
      )!;
      expect(sephieAfterRedo.isFused).toBe(true);
      expect(sephieAfterRedo.lastFuseRound).toBe(state.roundCount);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
    });
  });
});
