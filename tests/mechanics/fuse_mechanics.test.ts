/**
 * @file Mechanic Contract Test: Fuse: Cards (generic fuse)
 *
 * Owner rulings:
 * - No recipe whitelist — any hand card may be fused to a Fuse: Cards host
 * - Once per turn per card instance (lastFuseRound on the host)
 * - Persistent isFused flag survives hand → field
 * - Sephie: on fuse, spend 2 PP to summon Obsessed Test Subject (if PP available)
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
import { state } from "../../src/core/gameState.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { fuse_finalize_cards } from "../../src/logic/effects/ops/fuse/fuse.cards.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
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
}

describe("Mechanic Contract: Fuse: Cards", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    (globalThis as any).HEADLESS = true;
  });

  describe("Sephie, Maven Convict — on-fuse summon", () => {
    it("with 2+ PP: fusing summons Obsessed Test Subject and spends 2 PP", () => {
      setupFuseTurn([SEPHIE, FILLER], 4);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(sephie.lastFuseRound).toBe(state.roundCount);
      expect(thenHand("first").some((c) => c.uid === material.uid)).toBe(false);
      expect(
        thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
          .length,
      ).toBe(1);
      expect(getPP(state, "first")).toBe(ppBefore - 2);
    });

    it("with fewer than 2 PP: fuse still marks isFused but does not summon", () => {
      setupFuseTurn([SEPHIE, FILLER], 1);
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");

      fuseToInitiator(sephie.uid, material.uid);

      expect(sephie.isFused).toBe(true);
      expect(
        thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
          .length,
      ).toBe(0);
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
      onEvolve(scholarOnBoard, "first", "super");

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

    it("super-evolved without fuse grants no extra drain selection", () => {
      setupFuseTurn([SCHOLAR], 6);
      whenPlayCard("first", 0);
      const subject = createCard(TEST_SUBJECT, "board", "first");
      state.players.first.board.push(subject);

      const scholarOnBoard = findOnBoard("first", "Ecstatic Scholar")!;
      scholarOnBoard.peak_defense = scholarOnBoard.defense;
      state.players.first.superEvoPoints = 1;
      onEvolve(scholarOnBoard, "first", "super");

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
