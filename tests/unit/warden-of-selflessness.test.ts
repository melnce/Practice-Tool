/**
 * Warden of Selflessness (10903110) — Fanfare damage keyed to Neutral cards in hand.
 *
 * Resolution order: add Jailor of Antiquity first, then count Neutral cards in hand
 * (Jailor is Neutral and counts toward X).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { resolveDynamicValue } from "../../src/logic/core/values.js";
import { getPP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const WARDEN = "10903110";
const JAILOR = "10901110";
const NEUTRAL_A = "10001130"; // Quake Goliath
const NEUTRAL_B = "10001210"; // Detective's Lens
const CLASS_SPELL = "10111310"; // Fairy Convocation (Forestcraft)

const R6 = 6;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; evo?: number; seed?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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

describe("Warden of Selflessness (10903110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("resolveDynamicValue {hand_class_count:Class}", () => {
    it("counts Neutral cards in hand at resolution time", () => {
      setupTurn(R6, { hand: [NEUTRAL_A, NEUTRAL_B, CLASS_SPELL], pp: 6 });
      expect(
        resolveDynamicValue("{hand_class_count:Neutral}", { owner: "first" }),
      ).toBe(2);
      expect(
        resolveDynamicValue("{hand_class_count:Forestcraft}", {
          owner: "first",
        }),
      ).toBe(1);
    });

    it("unknown dynamic template resolves to 0", () => {
      setupTurn(R6, { hand: [NEUTRAL_A], pp: 6 });
      expect(
        resolveDynamicValue("{bogus_unknown_template}", { owner: "first" }),
      ).toBe(0);
    });
  });

  it("Fanfare adds Jailor then deals 3 to each of two enemies (2 Neutral + Jailor)", () => {
    setupTurn(R6, {
      hand: [WARDEN, NEUTRAL_A, NEUTRAL_B, CLASS_SPELL],
      pp: 5,
    });
    const e1 = enemyFollower(1, 10, "A");
    const e2 = enemyFollower(1, 10, "B");
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === JAILOR)).toBe(true);
    // X = 2 other Neutral cards in hand + Jailor added by Fanfare = 3 each
    expect(Number(e1.defense)).toBe(7);
    expect(Number(e2.defense)).toBe(7);
  });

  it("Fanfare with no other Neutral cards deals 1 each (Jailor alone)", () => {
    setupTurn(R6, { hand: [WARDEN, CLASS_SPELL], pp: 5 });
    const e1 = enemyFollower(1, 10, "OnlyA");
    const e2 = enemyFollower(1, 10, "OnlyB");
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === JAILOR)).toBe(true);
    expect(Number(e1.defense)).toBe(9);
    expect(Number(e2.defense)).toBe(9);
  });

  it("Fanfare with one enemy follower deals X once", () => {
    setupTurn(R6, { hand: [WARDEN, NEUTRAL_A, CLASS_SPELL], pp: 5 });
    const lone = enemyFollower(1, 10, "Lone");
    whenPlayCard("first", 0);
    // X = NEUTRAL_A + Jailor = 2
    expect(Number(lone.defense)).toBe(8);
    expect(thenBoard("second").length).toBe(1);
  });

  it("Evolve recovers 1 play point", () => {
    setupTurn(R6, { hand: [WARDEN], pp: 5, evo: 1 });
    whenPlayCard("first", 0);
    const ppAfterPlay = getPP(state, "first");
    const warden = findOnBoard("first", "Warden of Selflessness")!;
    whenEvolve(warden, "first");
    expect(getPP(state, "first")).toBe(ppAfterPlay + 1);
  });
});
