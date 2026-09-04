/**
 * Smoke-Shrouded Beauty (10521120) — Fanfare gated +1/+1 and Ward.
 *
 * Printed: "Fanfare: If you have at least 2 spells in your hand, give this
 * follower +1/+1 and Ward."
 *
 * PR #180 (l2-rotation-swordcraft.test.ts) pending — tests live here until merge.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import "../../src/logic/core/effects/index.js";

const SMOKE_BEAUTY = "10521120";
const SPELL_A = "10111310"; // Fairy Convocation
const SPELL_B = "10131320"; // Stormy Blast
const FILLER = "10122130"; // Luminous Lancetrooper (Follower)

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
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
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function handIndexById(id: string): number {
  const hand = state.players.first.hand;
  const idx = hand.findIndex((c) => c.id === id);
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx;
}

describe("Smoke-Shrouded Beauty (10521120)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("with ≥2 spells in hand: becomes 4/4 with Ward", () => {
    setupTurn(6, {
      hand: [SMOKE_BEAUTY, SPELL_A, SPELL_B],
      pp: 3,
    });
    whenPlayCard("first", handIndexById(SMOKE_BEAUTY));
    const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
    expect(Number(beauty.attack)).toBe(4);
    expect(Number(beauty.defense)).toBe(4);
    expect(beauty.hasWard).toBe(true);
  });

  it("with 1 spell in hand: stays 3/3 without Ward", () => {
    setupTurn(6, {
      hand: [SMOKE_BEAUTY, SPELL_A, FILLER],
      pp: 3,
    });
    whenPlayCard("first", handIndexById(SMOKE_BEAUTY));
    const beauty = findOnBoard("first", "Smoke-Shrouded Beauty")!;
    expect(Number(beauty.attack)).toBe(3);
    expect(Number(beauty.defense)).toBe(3);
    expect(beauty.hasWard).toBeFalsy();
  });
});
