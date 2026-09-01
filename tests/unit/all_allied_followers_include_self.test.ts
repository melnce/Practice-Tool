/**
 * Tia, Eternal Crystalian (10814120) — Enhance (4) "all allied followers"
 * must include the source (no "other" in printed text).
 *
 * Defect: ally:follower self-excludes in applyFilters unless include_self.
 * Enhance runs after Tia is on board → she was filtered out → no self buff,
 * so self_buffed_up never fires and Eve is not added.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import "../../src/logic/core/effects/index.js";

const TIA = "10814120";
const FILLER = "10111310";
const EVE_NAME = "Eve, Blade of Crystalia";

function setupEnhancePlay(): void {
  const max = 4;
  givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: 4,
  })
    .withFirstPP(4, max)
    .withFirstHand([TIA])
    .withFirstDeck([FILLER, FILLER, FILLER, FILLER])
    .build();

  const ally = createCard(
    { name: "Ally1", type: "Follower", cost: 1, attack: 1, defense: 1 },
    "board",
    "first",
  );
  ally.peak_defense = 1;
  state.players.first.board.push(ally);

  state.gameStarted = true;
  state.phase = "main";
}

describe("Tia Enhance — all allied followers includes self (10814120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Enhance (4): buffs other ally +1/+1, buffs Tia +1/+1, adds one Eve", () => {
    setupEnhancePlay();

    const allyBefore = state.players.first.board[0]!;
    expect(Number(allyBefore.attack)).toBe(1);
    expect(Number(allyBefore.defense)).toBe(1);

    whenPlayCard("first", 0);

    const ally = state.players.first.board.find((c) => c.name === "Ally1")!;
    const tia = findOnBoard("first", "Tia, Eternal Crystalian")!;
    const eveCount = thenHand("first").filter(
      (c) => c.name === EVE_NAME,
    ).length;

    // Printed for the PR / sabotage runs
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ally_atk: Number(ally.attack),
        ally_def: Number(ally.defense),
        tia_atk: Number(tia.attack),
        tia_def: Number(tia.defense),
        eve_in_hand: eveCount,
      }),
    );

    expect(Number(ally.attack)).toBe(2);
    expect(Number(ally.defense)).toBe(2);
    expect(Number(tia.attack)).toBe(3);
    expect(Number(tia.defense)).toBe(3);
    expect(eveCount).toBe(1);
  });
});
