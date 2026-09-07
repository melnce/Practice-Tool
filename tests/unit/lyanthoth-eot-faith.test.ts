/**
 * Lyanthoth, Eld Tome (10664120) — Mar 30 balance: evolve payoff → EOT + Ward.
 * Proves evolving no longer adds Depths; owner's EOT does when faith ≥ 10;
 * opponent's EOT does not.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import { getCrests } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const LYANTHOTH = "10664120";
const DEPTHS = "Depths of the Eld Tome";
const FAITH_CREST = faithCrestNameForCard("Lyanthoth, Eld Tome");

function depthsInHand(player: "first" | "second"): number {
  return thenHand(player).filter((c) => c.name === DEPTHS).length;
}

function setupFaith(owner: "first" | "second", amount: number): void {
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
  crestAddCounter(owner, FAITH_CREST, "faith", amount);
}

describe("Lyanthoth EOT faith payoff (10664120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("evolving Lyanthoth does not add Depths of the Eld Tome", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 9 })
      .withFirstHand([LYANTHOTH])
      .withFirstPP(9, 9)
      .withFirstEvo(2)
      .build();

    setupFaith("first", 10);
    const lyanthoth = createCard(LYANTHOTH, "board", "first");
    lyanthoth.peak_defense = lyanthoth.defense;
    state.players.first.board = [lyanthoth];

    const handBefore = depthsInHand("first");
    whenEvolve(lyanthoth, "first");
    expect(depthsInHand("first")).toBe(handBefore);
  });

  it("owner's EOT adds Depths when faith ≥ 10", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 9 })
      .withFirstHand([LYANTHOTH])
      .withFirstPP(9, 9)
      .build();

    setupFaith("first", 10);
    const lyanthoth = createCard(LYANTHOTH, "board", "first");
    lyanthoth.hasEvolved = true;
    lyanthoth.isEvolved = true;
    lyanthoth.peak_defense = lyanthoth.defense;
    state.players.first.board = [lyanthoth];

    const handBefore = depthsInHand("first");
    runEndOfTurnBoundary("first");
    expect(depthsInHand("first")).toBe(handBefore + 1);
    expect(
      getCrests(state, "first").find((c) => c.name === FAITH_CREST)?.counters
        ?.faith,
    ).toBe(0);
  });

  it("opponent's EOT does not add Depths", () => {
    givenGameState({ seed: 3, activePlayer: "second", roundCount: 9 })
      .withFirstHand([LYANTHOTH])
      .withFirstPP(9, 9)
      .build();

    setupFaith("first", 10);
    const lyanthoth = createCard(LYANTHOTH, "board", "first");
    lyanthoth.hasEvolved = true;
    lyanthoth.isEvolved = true;
    lyanthoth.peak_defense = lyanthoth.defense;
    state.players.first.board = [lyanthoth];

    const handBefore = depthsInHand("first");
    runEndOfTurnBoundary("second");
    expect(depthsInHand("first")).toBe(handBefore);
    expect(
      getCrests(state, "first").find((c) => c.name === FAITH_CREST)?.counters
        ?.faith,
    ).toBe(10);
  });
});
