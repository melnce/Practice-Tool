/**
 * Japanese cost-model spec (2026-09-06): accumulation below 0, set discards prior
 * changes, halve ceil-of-current, until-EOT expiry in hand/deck restores previous cost.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { getHand } from "../../src/core/playerHelpers.js";
import {
  captureSnapshot,
  undo,
  redo,
  setHistoryEnabled,
  resetHistory,
  beginAction,
  commitAction,
  canUndo,
} from "../../src/core/history.js";
import { handleHalveDeckCost } from "../../src/logic/effects/cost.js";
import "../../src/logic/core/effects/index.js";

const ARA = "10534120";
const ILLUSORY = "10333310";
const FENNIE = "10244120";
const MARI = "10441120";
const LIU = "10143120";
const HIEN = "10914120";
const ELVEN_TRAPPER = "10711120";
const FILLER = "10111310";

const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
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
}

function boostCard(card: { uid: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

describe("Cost model spec (Japanese rules 2026-09-06)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("(a) accumulation below 0 — Ara + Illusory Conjuration", () => {
    it("12 spellboosts → 0; +1 → still 0; another spellboost → 0", () => {
      setupTurn(R10, { hand: [ARA], pp: 10 });
      const ara = thenHand("first").find((c) => c.id === ARA)!;
      boostCard(ara, 12);
      expect(getEffectiveCost(ara)).toBe(0);

      setupTurn(R10, { hand: [ILLUSORY, ARA], pp: 10 });
      const ara2 = thenHand("first").find((c) => c.id === ARA)!;
      boostCard(ara2, 12);
      expect(getEffectiveCost(ara2)).toBe(0);
      whenPlayCard("first", 0);
      const pending = state.pendingTargetEffect;
      expect(pending).toBeTruthy();
      resolvePendingTarget(ara2.uid);
      expect(getEffectiveCost(ara2)).toBe(0);

      boostCard(ara2, 1);
      expect(getEffectiveCost(ara2)).toBe(0);
    });
  });

  describe("(b) spellboost after +1 restores accumulated value", () => {
    it("9 spellboosts → 1; +1 → 2; another spellboost → 1", () => {
      setupTurn(R10, { hand: [ARA], pp: 10 });
      const ara = thenHand("first").find((c) => c.id === ARA)!;
      boostCard(ara, 9);
      expect(getEffectiveCost(ara)).toBe(1);

      whenRunEffects(
        [
          {
            op: "cost",
            mode: "increase",
            target: "self",
            amount: 1,
          },
        ],
        "first",
        ara,
      );
      expect(getEffectiveCost(ara)).toBe(2);

      boostCard(ara, 1);
      expect(getEffectiveCost(ara)).toBe(1);
    });
  });

  describe("(c) set discards earlier changes", () => {
    it("+1 then set to 1 → 1; set to 1 then +1 → 2", () => {
      givenGameState({ seed: 1 })
        .withFirstHand([
          { name: "Fairy", type: "Follower", cost: 2, attack: 1, defense: 1 },
        ])
        .build();

      const fairy = thenHand("first")[0]!;
      whenRunEffects(
        [
          {
            op: "cost",
            mode: "modify",
            target: "pool",
            pool: "ally:hand",
            amount: 1,
          },
        ],
        "first",
      );
      expect(getEffectiveCost(fairy)).toBe(3);

      whenRunEffects(
        [
          {
            op: "cost",
            mode: "set",
            target: "pool",
            pool: "ally:hand",
            amount: 1,
          },
        ],
        "first",
      );
      expect(getEffectiveCost(fairy)).toBe(1);

      givenGameState({ seed: 2 })
        .withFirstHand([
          { name: "Fairy2", type: "Follower", cost: 2, attack: 1, defense: 1 },
        ])
        .build();
      const fairy2 = thenHand("first")[0]!;
      whenRunEffects(
        [
          {
            op: "cost",
            mode: "set",
            target: "pool",
            pool: "ally:hand",
            amount: 1,
          },
        ],
        "first",
      );
      expect(getEffectiveCost(fairy2)).toBe(1);
      whenRunEffects(
        [
          {
            op: "cost",
            mode: "modify",
            target: "pool",
            pool: "ally:hand",
            amount: 1,
          },
        ],
        "first",
      );
      expect(getEffectiveCost(fairy2)).toBe(2);
    });
  });

  describe("(d) until-EOT set restores previous halved cost", () => {
    it("Fennie halve → draw Mari → super-evolve set 0 → EOT restores halved cost", () => {
      setupTurn(R7, {
        hand: [FENNIE],
        deck: [MARI],
        pp: 8,
      });
      whenPlayCard("first", 0);
      const mariInDeck = thenDeck("first").find((c) => c.id === MARI)!;
      expect(getEffectiveCost(mariInDeck)).toBe(1);

      mariInDeck.zone = "hand";
      getHand(state, "first").push(mariInDeck);
      thenDeck("first").splice(thenDeck("first").indexOf(mariInDeck), 1);

      const liu = createCard(LIU, "board", "first");
      liu.peak_defense = liu.defense;
      state.players.first.board.push(liu);
      whenSuperEvolve(liu, "first");
      expect(getEffectiveCost(mariInDeck)).toBe(0);

      whenEndTurn();
      expect(getEffectiveCost(mariInDeck)).toBe(1);
    });
  });

  describe("(e) until-EOT expiry in deck", () => {
    it("Hien reduced in hand, returned to deck, expires at EOT", () => {
      setupTurn(R10, {
        hand: [HIEN, ELVEN_TRAPPER, FILLER, FILLER, FILLER],
        pp: 10,
      });
      const hien = thenHand("first").find((c) => c.id === HIEN)!;
      for (let i = 0; i < 3; i++) {
        const fillerIdx = getHand(state, "first").findIndex(
          (c) => c.id === FILLER,
        );
        whenPlayCard("first", fillerIdx);
      }
      expect(getEffectiveCost(hien)).toBe(6);

      const trapperIdx = getHand(state, "first").findIndex(
        (c) => c.id === ELVEN_TRAPPER,
      );
      whenPlayCard("first", trapperIdx);
      resolvePendingTarget(hien.uid);

      const hienInDeck = thenDeck("first").find((c) => c.id === HIEN)!;
      expect(hienInDeck).toBeTruthy();
      expect(getEffectiveCost(hienInDeck)).toBe(6);

      whenEndTurn();
      expect(getEffectiveCost(hienInDeck)).toBe(9);
    });

    it("until-EOT reduction in hand still expires at EOT", () => {
      setupTurn(R10, { hand: [HIEN, FILLER, FILLER], pp: 10 });
      const hien = thenHand("first").find((c) => c.id === HIEN)!;
      whenPlayCard("first", 1);
      expect(getEffectiveCost(hien)).toBe(8);
      whenEndTurn();
      expect(getEffectiveCost(hien)).toBe(9);
    });
  });

  describe("(f) halve rounds up on current cost", () => {
    it("9 → 5 → 3; 1 stays 1", () => {
      givenGameState({ seed: 1 })
        .withFirstDeck([
          { name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 },
          { name: "One", type: "Spell", cost: 1, attack: 0, defense: 0 },
        ])
        .build();

      handleHalveDeckCost("first");
      const nine = thenDeck("first").find((c) => c.name === "Nine")!;
      const one = thenDeck("first").find((c) => c.name === "One")!;
      expect(getEffectiveCost(nine)).toBe(5);
      expect(getEffectiveCost(one)).toBe(1);

      handleHalveDeckCost("first");
      expect(getEffectiveCost(nine)).toBe(3);
      expect(getEffectiveCost(one)).toBe(1);
    });
  });

  describe("(g) undo/redo preserves cost state", () => {
    beforeEach(() => {
      setHistoryEnabled(true);
      resetHistory();
    });

    it("undo/redo around spellboost + cost increase", () => {
      setupTurn(R10, { hand: [ARA], pp: 10 });
      const ara = thenHand("first").find((c) => c.id === ARA)!;
      beginAction("boost");
      boostCard(ara, 9);
      commitAction({ autoRender: false });
      expect(getEffectiveCost(ara)).toBe(1);
      beginAction("increase");
      whenRunEffects(
        [{ op: "cost", mode: "increase", target: "self", amount: 1 }],
        "first",
        ara,
      );
      commitAction({ autoRender: false });
      expect(getEffectiveCost(ara)).toBe(2);
      expect(canUndo()).toBe(true);
      const araUid = ara.uid;
      const snap = captureSnapshot();
      expect(undo({ autoRender: false })).toBe(true);
      const araAfterUndo = thenHand("first").find((c) => c.uid === araUid)!;
      expect(getEffectiveCost(araAfterUndo)).toBe(1);
      expect(redo({ autoRender: false })).toBe(true);
      const araAfterRedo = thenHand("first").find((c) => c.uid === araUid)!;
      expect(getEffectiveCost(araAfterRedo)).toBe(2);
      expect(captureSnapshot()).toEqual(snap);
    });

    it("undo/redo around Fennie halve + Mari until-EOT set", () => {
      setupTurn(R7, { hand: [FENNIE], deck: [MARI], pp: 8 });
      beginAction("fennie");
      whenPlayCard("first", 0);
      commitAction({ autoRender: false });
      const mari = thenDeck("first").find((c) => c.id === MARI)!;
      mari.zone = "hand";
      getHand(state, "first").push(mari);
      thenDeck("first").splice(thenDeck("first").indexOf(mari), 1);
      const liu = createCard(LIU, "board", "first");
      liu.peak_defense = liu.defense;
      state.players.first.board.push(liu);
      beginAction("super-evolve");
      whenSuperEvolve(liu, "first");
      commitAction({ autoRender: false });
      expect(getEffectiveCost(mari)).toBe(0);
      whenEndTurn();
      expect(getEffectiveCost(mari)).toBe(1);
      expect(canUndo()).toBe(true);
      const mariUid = mari.uid;
      const snap = captureSnapshot();
      expect(undo({ autoRender: false })).toBe(true);
      const mariAfterUndo =
        thenHand("first").find((c) => c.uid === mariUid) ?? mari;
      expect(getEffectiveCost(mariAfterUndo)).toBe(0);
      expect(redo({ autoRender: false })).toBe(true);
      const mariAfterRedo =
        thenHand("first").find((c) => c.uid === mariUid) ?? mari;
      expect(getEffectiveCost(mariAfterRedo)).toBe(1);
      expect(captureSnapshot()).toEqual(snap);
    });
  });
});
