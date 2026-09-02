/**
 * Owner rulings 2026-09-02 — Accelerate / Crystallize alternate-form behaviour.
 *
 * Pins reachable behaviours that already match the rulings but had no test:
 *   1. Accelerate play spellboosts the hand (and resolves Accelerate text).
 *   2. Normal-cost play of the same follower does NOT spellboost.
 *   3. In hand, an Accelerate card keeps printed type (not a spell for filters).
 *   4. Accelerate corpse stays a spell — Reanimate skips it (owner ruling; do not "fix").
 *   5. Crystallize play stays an amulet; follower enter/Fanfare side does not run.
 *
 * Real cards only; exact expected values; driven through the real play path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
  thenHand,
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getGraveyard,
  getHand,
  getHP,
  setPP,
} from "../../src/core/playerHelpers.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import "../../src/logic/core/effects/index.js";

const JAILOR = "10901110"; // Neutral Follower — Accelerate (1)
const STORMY_BLAST = "10131320"; // Runecraft Spellboost spell
const YEARNFUL = "10652110"; // Abysscraft — Enhance (8): Reanimate (9)
const AMOROUS = "10052120"; // Abysscraft Follower cost 4 — eligible Reanimate corpse
const SMOKE_BEAUTY = "10521120"; // Swordcraft — Fanfare if ≥2 spells in hand
const PROSTRATING = "10661110"; // Havencraft — Crystallize (2)

function setupTurn(
  round: number,
  opts: {
    hand?: Array<string | ReturnType<typeof createCard>>;
    pp?: number;
    deck?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as string[]);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function spellboostCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}): number {
  return Number(
    card.keywordState?.spellboostCount ?? card.spellboostCount ?? 0,
  );
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending).not.toBeNull();
  const poolLen = pending!.poolUids?.length ?? pending!.pool?.length ?? 0;
  expect(poolLen).toBe(1);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function handIndexById(id: string): number {
  const idx = getHand(state, "first").findIndex((c) => c.id === id);
  expect(idx).not.toBe(-1);
  return idx;
}

describe("Owner rulings 2026-09-02 — Accelerate / Crystallize alternate forms", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  describe("Accelerate spellboosts (Jailor + Stormy Blast)", () => {
    it("Accelerate (1 PP): Stormy Blast spellboostCount goes 0→1 and enemy takes exactly 2", () => {
      setupTurn(6, { hand: [JAILOR, STORMY_BLAST], pp: 1 });
      const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
      expect(spellboostCount(blast)).toBe(0);
      const foe = enemyFollower(2, 5, "AccelTarget");

      const outcome = whenPlayCard("first", handIndexById(JAILOR));
      expect(outcome.kind).toBe("done");

      expect(spellboostCount(blast)).toBe(1);
      expect(Number(foe.defense)).toBe(3);
      expect(thenBoard("first")).toHaveLength(0);
      const jailorGy = getGraveyard(state, "first").filter(
        (c) => c.id === JAILOR,
      );
      expect(jailorGy).toHaveLength(1);
      expect(jailorGy[0]!.type).toBe("Spell");
      expect(thenPP("first")).toBe(0);
    });

    it("normal cost (6 PP): follower play does NOT spellboost Stormy Blast", () => {
      setupTurn(6, { hand: [JAILOR, STORMY_BLAST], pp: 6 });
      const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
      expect(spellboostCount(blast)).toBe(0);
      const foe = enemyFollower(2, 8, "FanfareWall");

      const outcome = whenPlayCard("first", handIndexById(JAILOR));
      expect(outcome.kind).toBe("paused");
      resolveFirstPending();

      expect(spellboostCount(blast)).toBe(0);
      expect(Number(foe.defense)).toBe(2);
      const jailor = findOnBoard("first", "Jailor of Antiquity");
      expect(jailor).not.toBeNull();
      expect(jailor!.type).toBe("Follower");
      expect(Number(jailor!.attack)).toBe(6);
      expect(Number(jailor!.defense)).toBe(6);
      expect(thenPP("first")).toBe(0);
    });
  });

  describe("In hand, Accelerate card keeps printed type", () => {
    it("Smoke-Shrouded Beauty: Jailor + 1 spell does not satisfy ≥2 spells (Jailor is Follower)", () => {
      // Real card whose Fanfare gates on hand_matches type Spell count ≥ 2.
      // Jailor is Neutral → legal beside Swordcraft. If Jailor wrongly counted
      // as a spell, Beauty would become 4/4; printed is 3/3 and must stay 3/3.
      setupTurn(6, {
        hand: [SMOKE_BEAUTY, JAILOR, STORMY_BLAST],
        pp: 3,
      });
      const jailor = thenHand("first").find((c) => c.id === JAILOR)!;
      expect(jailor.type).toBe("Follower");

      whenPlayCard("first", handIndexById(SMOKE_BEAUTY));
      const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
      expect(beauty.type).toBe("Follower");
      expect(Number(beauty.attack)).toBe(3);
      expect(Number(beauty.defense)).toBe(3);
      expect(Boolean(beauty.hasWard)).toBe(false);
    });
  });

  describe("Accelerate cemetery corpse stays a spell — Reanimate skips it", () => {
    // Owner ruling 2026-09-02: an Accelerate-played follower stays a spell in
    // the cemetery and is NOT reanimatable. Do not "fix" this filter.
    it("Yearnful Necromancer Enhance(8) Reanimate(9) raises the Follower corpse, not Jailor", () => {
      setupTurn(10, { hand: [JAILOR, YEARNFUL], pp: 1 });
      // Real-card corpse: Reanimate recreates from the DB, so synthetic cards
      // silently no-op. Cost 4 < Jailor's printed 6 so a broken type-filter
      // that admitted Jailor would prefer Jailor and summon nothing.
      getGraveyard(state, "first").push(
        createCard(AMOROUS, "graveyard", "first"),
      );
      enemyFollower(2, 5, "AccelPing");

      // Accelerate Jailor → GY as Spell (cost still 6, higher than Amorous).
      expect(whenPlayCard("first", handIndexById(JAILOR)).kind).toBe("done");
      const jailorInGy = getGraveyard(state, "first").find(
        (c) => c.id === JAILOR,
      )!;
      expect(jailorInGy.type).toBe("Spell");
      expect(Number(jailorInGy.cost)).toBe(6);

      // Enhance (8): Reanimate (9) — must pick the Follower corpse, skip Jailor.
      setPP(state, "first", 8);
      expect(whenPlayCard("first", handIndexById(YEARNFUL)).kind).toBe("done");

      const board = thenBoard("first");
      expect(board).toHaveLength(2);
      expect(
        board.filter((c) => c.name === "Yearnful Necromancer"),
      ).toHaveLength(1);
      expect(board.filter((c) => c.id === AMOROUS)).toHaveLength(1);
      expect(
        board.filter((c) => c.name === "Amorous Necromancer"),
      ).toHaveLength(1);
      expect(board.filter((c) => c.id === JAILOR)).toHaveLength(0);
      expect(
        board.filter((c) => c.name === "Jailor of Antiquity"),
      ).toHaveLength(0);

      const gyJailor = getGraveyard(state, "first").filter(
        (c) => c.id === JAILOR,
      );
      expect(gyJailor).toHaveLength(1);
      expect(gyJailor[0]!.type).toBe("Spell");
    });
  });

  describe("Crystallize keeps its amulet form", () => {
    it("Prostrating Coward Crystallize (2): Amulet 0/0 Countdown(3); enter heal does not run", () => {
      setupTurn(6, { hand: [PROSTRATING], pp: 2 });
      state.players.first.hp = 15;
      state.players.first.maxHP = 20;

      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );

      expect(thenBoard("first")).toHaveLength(1);
      const amulet = thenBoard("first")[0]!;
      expect(amulet.name).toBe("Prostrating Coward");
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.attack)).toBe(0);
      expect(Number(amulet.defense)).toBe(0);
      expect(Number(amulet.countdown)).toBe(3);
      expect(Boolean(amulet.hasWard)).toBe(false);
      expect(Boolean(amulet.hasBane)).toBe(false);
      // Follower-side enter heal ("restore 2") must not have fired.
      expect(getHP(state, "first")).toBe(15);
      expect(
        thenBoard("first").filter(
          (c) => c.name === "Prostrating Coward" && c.type === "Follower",
        ),
      ).toHaveLength(0);
    });
  });
});
