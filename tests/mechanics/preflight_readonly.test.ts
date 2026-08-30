/**
 * Preflight must not mutate game state — canPlayCard is called from UI glow/tooltip
 * paths and must remain a pure read.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import {
  getHand,
  getBoard,
  getDeck,
  getGraveyard,
  getCrests,
  getPP,
  getShadows,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

type PlayerSnapshot = {
  shadows: number;
  pp: number;
  handLen: number;
  boardLen: number;
  deckLen: number;
  graveyardLen: number;
  crestCount: number;
};

function snapshotPlayer(player: "first" | "second"): PlayerSnapshot {
  return {
    shadows: getShadows(state, player),
    pp: getPP(state, player),
    handLen: getHand(state, player).length,
    boardLen: getBoard(state, player).length,
    deckLen: getDeck(state, player).length,
    graveyardLen: getGraveyard(state, player).length,
    crestCount: getCrests(state, player).length,
  };
}

function snapshotBoth(): Record<"first" | "second", PlayerSnapshot> {
  return {
    first: snapshotPlayer("first"),
    second: snapshotPlayer("second"),
  };
}

describe("canPlayCard preflight is read-only", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("does not mutate player state when probing Necromancy-gated and Soulforge cards", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(5, 5)
      .withFirstHand(["10651310", "10973310", "10031310"])
      .withFirstDeck([
        "10631110",
        "10631110",
        "10631110",
        "10631110",
        "10031310",
        "10031310",
      ])
      .build();

    state.players.first.shadows = 6;
    state.players.first.hp = 15;

    const hand = getHand(state, "first");
    const before = snapshotBoth();

    for (const card of hand) {
      canPlayCard(card, "first");
    }

    expect(snapshotBoth()).toEqual(before);
    expect(getShadows(state, "first")).toBe(6);
  });
});
