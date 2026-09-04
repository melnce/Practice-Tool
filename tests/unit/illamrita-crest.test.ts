/**
 * Illamrita crest (10704110) — Countdown (2) Last Words summons and evolves.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getCrests } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const ILLAMRITA = "10704110";
const R8 = 8;

function setupTurn(round: number, opts: { hand?: string[]; pp?: number } = {}) {
  resetUidCounter();
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
}

function crestNamed(fragment: string) {
  return getCrests(state, "first").find((c) => c.name.includes(fragment));
}

function illamritaOnBoard(): ReturnType<typeof thenBoard> {
  return thenBoard("first").filter((c) => c.id === ILLAMRITA);
}

describe("Illamrita crest (10704110)", () => {
  const crestPrinted =
    "Countdown (2)\nLast Words: Summon an Illamrita, Designated Target and evolve it.";

  beforeEach(() => {
    setupTurn(R8, { pp: 10 });
  });

  function gainCrestByDestroyingIllamrita() {
    const illamrita = createCard(ILLAMRITA, "board", "first");
    state.players.first.board.push(illamrita);
    illamrita.defense = 0;
    cleanupDead();
    return illamrita;
  }

  it("crest Last Words at countdown 0 summons exactly one evolved Illamrita", () => {
    gainCrestByDestroyingIllamrita();
    expect(crestNamed("Illamrita")).toBeTruthy();
    expect(Number(crestNamed("Illamrita")!.countdown)).toBe(2);
    expect(illamritaOnBoard()).toHaveLength(0);

    // Opponent turn-start: countdown does not tick
    whenEndTurn();
    expect(crestNamed("Illamrita")).toBeTruthy();
    expect(Number(crestNamed("Illamrita")!.countdown)).toBe(2);
    expect(illamritaOnBoard()).toHaveLength(0);

    // Owner turn-start: tick to 1, still no summon
    whenEndTurn();
    expect(crestNamed("Illamrita")).toBeTruthy();
    expect(Number(crestNamed("Illamrita")!.countdown)).toBe(1);
    expect(illamritaOnBoard()).toHaveLength(0);

    // Opponent turn-start: countdown still 1
    whenEndTurn();
    expect(crestNamed("Illamrita")).toBeTruthy();
    expect(Number(crestNamed("Illamrita")!.countdown)).toBe(1);
    expect(illamritaOnBoard()).toHaveLength(0);

    // Owner turn-start: crest expires, summons evolved Illamrita
    whenEndTurn();
    expect(crestNamed("Illamrita")).toBeFalsy();
    const summoned = illamritaOnBoard();
    expect(summoned).toHaveLength(1);
    expect(summoned[0]!.hasEvolved || summoned[0]!.isEvolved).toBe(true);
    expect(Number(summoned[0]!.attack)).toBe(3);
    expect(Number(summoned[0]!.defense)).toBe(6);
    expect(crestPrinted).toContain("and evolve it");
  });

  it("gains crest via Last Words when Illamrita is destroyed from play", () => {
    setupTurn(R8, { hand: [ILLAMRITA], pp: 6 });
    whenPlayCard("first", 0);
    const illa = findOnBoard("first", "Illamrita, Designated Target")!;
    illa.defense = 0;
    cleanupDead();
    expect(crestNamed("Illamrita, Designated Target")).toBeTruthy();
    expect(Number(crestNamed("Illamrita, Designated Target")!.countdown)).toBe(
      2,
    );
  });
});
