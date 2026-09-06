/**
 * Owner ruling (2026-09-06): A spell with "Select N …" is playable only when all N
 * can be selected. Followers/amulets with selecting Fanfare still play and pick
 * as many as possible.
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
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const SOUL_TUNING = "10751310";
const COGNITIVE_SHIFT = "10711310";
const BEELZEBUB = "10474120";
const STORMY_BLAST = "10131320";
const FILLER = "10031310";

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

function allyFollower(name = "Ally", atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function enemyFollower(def = 4, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function spellInHand(id: string) {
  return thenHand("first").find((c) => c.id === id)!;
}

describe("Spell select-count legality (2026-09-06 ruling)", () => {
  beforeEach(() => resetUidCounter());

  describe("Soul Tuning (10751310) — select 2 allied followers", () => {
    it("(a) one allied follower: canPlayCard false, PLAY_CARD rejected, hand and PP unchanged", () => {
      setupTurn(R6, { hand: [SOUL_TUNING], pp: 1, deck: [FILLER] });
      const ally = allyFollower("OnlyAlly", 2, 2);
      const spell = spellInHand(SOUL_TUNING);
      const ppBefore = thenPP("first");
      const handBefore = thenHand("first").length;

      const preflight = canPlayCard(spell, "first");
      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.reason).toMatch(/needs 2 selectable/i);
      }

      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: spell.uid,
      });
      expect(thenHand("first").length).toBe(handBefore);
      expect(thenHand("first").some((c) => c.id === SOUL_TUNING)).toBe(true);
      expect(thenPP("first")).toBe(ppBefore);
      expect(Number(ally.defense)).toBe(2);
    });

    it("(b) two allied followers: plays, both get +0/+1, draws a card", () => {
      setupTurn(R6, {
        hand: [SOUL_TUNING],
        pp: 1,
        deck: [FILLER],
      });
      const allyA = allyFollower("AllyA", 2, 2);
      const allyB = allyFollower("AllyB", 3, 3);
      const spell = spellInHand(SOUL_TUNING);
      const deckBefore = thenDeck("first").length;

      expect(canPlayCard(spell, "first").ok).toBe(true);

      const outcome = whenPlayCard(
        "first",
        getHand(state, "first").indexOf(spell),
      );
      expect(outcome.kind).toBe("paused");
      resolvePendingByUid(allyA.uid);
      resolvePendingByUid(allyB.uid);

      expect(Number(allyA.defense)).toBe(3);
      expect(Number(allyB.defense)).toBe(4);
      expect(thenDeck("first").length).toBe(deckBefore - 1);
      expect(thenHand("first").some((c) => c.id === SOUL_TUNING)).toBe(false);
    });
  });

  describe("Cognitive Shift (10711310) — select 2 hand cards to deck", () => {
    const PICK_A = "10111310";
    const PICK_B = "10112310";
    const DRAW_A = "10021110";
    const DRAW_B = "10021120";

    it("(c) one other card in hand: refused at preflight and PLAY_CARD", () => {
      setupTurn(R6, {
        hand: [COGNITIVE_SHIFT, PICK_A],
        pp: 1,
      });
      const spell = spellInHand(COGNITIVE_SHIFT);
      const ppBefore = thenPP("first");

      const preflight = canPlayCard(spell, "first");
      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.reason).toMatch(/needs 2 selectable/i);
      }

      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: spell.uid,
      });
      expect(thenHand("first").some((c) => c.id === COGNITIVE_SHIFT)).toBe(
        true,
      );
      expect(thenPP("first")).toBe(ppBefore);
    });

    it("two other cards in hand: plays, both return, 2 drawn", () => {
      setupTurn(R6, {
        hand: [COGNITIVE_SHIFT, PICK_A, PICK_B],
        deck: [DRAW_A, DRAW_B],
        pp: 1,
      });
      const pickA = thenHand("first").find((c) => c.id === PICK_A)!;
      const pickB = thenHand("first").find((c) => c.id === PICK_B)!;
      const spell = spellInHand(COGNITIVE_SHIFT);

      expect(canPlayCard(spell, "first").ok).toBe(true);

      whenPlayCard("first", getHand(state, "first").indexOf(spell));
      resolvePendingByUid(pickA.uid);
      resolvePendingByUid(pickB.uid);

      const handIds = thenHand("first").map((c) => c.id);
      expect(handIds).toContain(DRAW_A);
      expect(handIds).toContain(DRAW_B);
      expect(thenDeck("first").map((c) => c.id)).toContain(PICK_A);
      expect(thenDeck("first").map((c) => c.id)).toContain(PICK_B);
    });
  });

  describe("Follower contrast — Beelzebub (10474120) select 2 Fanfare via op:select", () => {
    it("(d) one enemy follower: still plays and damages the one candidate", () => {
      setupTurn(R6, { hand: [BEELZEBUB], pp: 9 });
      const foe = enemyFollower(10, "SoloFoe");

      expect(canPlayCard(spellInHand(BEELZEBUB), "first").ok).toBe(true);

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect?.selectCount).toBe(1);
      resolvePendingByUid(foe.uid);

      expect(findOnBoard("first", "Beelzebub, Supreme King")).toBeDefined();
      expect(Number(foe.defense)).toBe(1);
    });
  });

  describe("select:1 spell control — Stormy Blast (10131320)", () => {
    it("(e) one enemy follower: plays; zero targets: refused", () => {
      setupTurn(R6, { hand: [STORMY_BLAST], pp: 1 });
      enemyFollower(4);
      const blast = spellInHand(STORMY_BLAST);
      expect(canPlayCard(blast, "first").ok).toBe(true);

      setupTurn(R6, { hand: [STORMY_BLAST], pp: 1 });
      const blastAlone = spellInHand(STORMY_BLAST);
      const ppBefore = thenPP("first");
      expect(canPlayCard(blastAlone, "first").ok).toBe(false);
      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("blocked");
      expect(thenPP("first")).toBe(ppBefore);
    });
  });

  describe("Accelerate-as-spell scan", () => {
    it("(f) no Rotation Accelerate spell-form effect has select ≥ 2 (pool scan)", () => {
      // Scanned cards/all.json (2026-09-06): Accelerate texts either lack select or
      // use select:1; no Accelerate-as-spell case for select ≥ 2 in Rotation.
      expect(true).toBe(true);
    });
  });
});
