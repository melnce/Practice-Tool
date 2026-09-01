/**
 * Gelt (10222110) and Slaus (10574110) — printed "all allied followers"
 * (no "other") must include the source on real turn-boundary triggers.
 *
 * Engine default: applyFilters excludes source from ally:* unless include_self.
 * Card data must opt back in per op (same spelling as Tia / Michelle / Anthuria).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runStartOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import "../../src/logic/core/effects/index.js";

const GELT = "10222110";
const SLAUS = "10574110";
const FILLER = "10111310";

function setupBoard(seed = 1, round = 5): void {
  givenGameState({
    seed,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(Math.min(round, 10), Math.min(round, 10))
    .withFirstDeck([FILLER, FILLER, FILLER, FILLER])
    .withSecondDeck([FILLER, FILLER, FILLER, FILLER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

describe("Gelt EOT — all allied followers includes self (10222110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("EOT with super-evolved ally: other ally and Gelt each get exactly +1/+1", () => {
    setupBoard(1, 5);
    const gelt = createCard(GELT, "board", "first");
    gelt.peak_defense = Number(gelt.defense);
    const ally = createCard(
      { name: "Ally1", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    ally.hasEvolved = true;
    ally.evoType = "super";
    state.players.first.board = [gelt, ally];

    const geltAtkBefore = Number(gelt.attack);
    const geltDefBefore = Number(gelt.defense);
    const allyAtkBefore = Number(ally.attack);
    const allyDefBefore = Number(ally.defense);

    whenEndTurn();

    const geltAfter = state.players.first.board.find(
      (c) => c.name === "Gelt, Intrepid Vice-Captain",
    )!;
    const allyAfter = state.players.first.board.find(
      (c) => c.name === "Ally1",
    )!;

    // Printed for the PR / sabotage runs
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: "gelt_with_super",
        ally_atk: Number(allyAfter.attack),
        ally_def: Number(allyAfter.defense),
        gelt_atk: Number(geltAfter.attack),
        gelt_def: Number(geltAfter.defense),
        expected_ally: [allyAtkBefore + 1, allyDefBefore + 1],
        expected_gelt: [geltAtkBefore + 1, geltDefBefore + 1],
      }),
    );

    expect(Number(allyAfter.attack)).toBe(allyAtkBefore + 1);
    expect(Number(allyAfter.defense)).toBe(allyDefBefore + 1);
    expect(Number(geltAfter.attack)).toBe(geltAtkBefore + 1);
    expect(Number(geltAfter.defense)).toBe(geltDefBefore + 1);
  });

  it("EOT with no super-evolved ally: nobody is buffed", () => {
    setupBoard(2, 5);
    const gelt = createCard(GELT, "board", "first");
    gelt.peak_defense = Number(gelt.defense);
    const ally = createCard(
      { name: "Ally1", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    // evolved but not super — gate must not fire
    ally.hasEvolved = true;
    ally.evoType = "normal";
    state.players.first.board = [gelt, ally];

    const geltAtkBefore = Number(gelt.attack);
    const geltDefBefore = Number(gelt.defense);
    const allyAtkBefore = Number(ally.attack);
    const allyDefBefore = Number(ally.defense);

    whenEndTurn();

    const geltAfter = state.players.first.board.find(
      (c) => c.name === "Gelt, Intrepid Vice-Captain",
    )!;
    const allyAfter = state.players.first.board.find(
      (c) => c.name === "Ally1",
    )!;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: "gelt_no_super",
        ally_atk: Number(allyAfter.attack),
        ally_def: Number(allyAfter.defense),
        gelt_atk: Number(geltAfter.attack),
        gelt_def: Number(geltAfter.defense),
      }),
    );

    expect(Number(allyAfter.attack)).toBe(allyAtkBefore);
    expect(Number(allyAfter.defense)).toBe(allyDefBefore);
    expect(Number(geltAfter.attack)).toBe(geltAtkBefore);
    expect(Number(geltAfter.defense)).toBe(geltDefBefore);
  });
});

describe("Slaus SOT mode 2 — all allied followers includes self (10574110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("start of turn mode 2: other ally and Slaus each get exactly +2/+2", () => {
    setupBoard(3, 4);
    const slaus = createCard(SLAUS, "board", "first");
    slaus.peak_defense = Number(slaus.defense);
    // Force mode index 1 (+2/+2): mark modes 0 and 2 used so random_unused picks 1.
    (slaus as { usedModeIndices?: number[] }).usedModeIndices = [0, 2];
    const ally = createCard(
      { name: "Ally1", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 1;
    state.players.first.board = [slaus, ally];

    const slausAtkBefore = Number(slaus.attack);
    const slausDefBefore = Number(slaus.defense);
    const allyAtkBefore = Number(ally.attack);
    const allyDefBefore = Number(ally.defense);

    runStartOfTurnBoundary("first");

    const slausAfter = state.players.first.board.find((c) =>
      c.name.includes("Slaus"),
    )!;
    const allyAfter = state.players.first.board.find(
      (c) => c.name === "Ally1",
    )!;
    const used = (slausAfter as { usedModeIndices?: number[] }).usedModeIndices;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: "slaus_mode2",
        usedModeIndices: used,
        ally_atk: Number(allyAfter.attack),
        ally_def: Number(allyAfter.defense),
        slaus_atk: Number(slausAfter.attack),
        slaus_def: Number(slausAfter.defense),
        expected_ally: [allyAtkBefore + 2, allyDefBefore + 2],
        expected_slaus: [slausAtkBefore + 2, slausDefBefore + 2],
      }),
    );

    expect(used).toEqual([0, 2, 1]);
    expect(Number(allyAfter.attack)).toBe(allyAtkBefore + 2);
    expect(Number(allyAfter.defense)).toBe(allyDefBefore + 2);
    expect(Number(slausAfter.attack)).toBe(slausAtkBefore + 2);
    expect(Number(slausAfter.defense)).toBe(slausDefBefore + 2);
  });
});
