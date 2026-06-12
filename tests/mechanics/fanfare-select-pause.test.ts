/**
 * Fanfare select must pause playFollower before enter triggers (regression).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { dispatch } from "../../src/engine.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";

describe("Fanfare select pause", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("Marion fanfare select: CHOOSE_TARGET buffs ally after pause", () => {
    givenGameState({ seed: 3, activePlayer: "first" })
      .withFirstHand(["10142140"])
      .withFirstPP(10, 10)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_on_board";
    ally.peak_defense = Number(ally.defense);
    state.players.first.board = [ally];

    const hand = getHand(state, "first");
    const outcome = playCardNoRender(hand, "first", 0);
    expect(outcome.kind).toBe("paused");
    expect(state.pendingTargetEffect).toBeDefined();

    const marion = getBoard(state, "first").find((c) => c.name?.includes("Marion"));
    expect(marion).toBeDefined();

    dispatch(state, { type: "CHOOSE_TARGET", target: { type: "card", uid: ally.uid } });

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(ally.attack)).toBeGreaterThan(1);
    expect(Number(ally.defense)).toBeGreaterThan(2);
  });
});
