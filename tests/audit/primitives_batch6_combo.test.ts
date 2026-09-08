/**
 * Batch 6 — Combo primitive (Forestcraft audit).
 *
 * Combo = cards played this turn (`playsThisTurn`), incremented when a card leaves hand
 * via `playCardCore` before fanfare/spell resolve (Batch 1 owner: May triggers on 3rd card played).
 * Rulebook has no dedicated Combo section; threshold gates use `plays >= count` in `handleComboGate`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleComboGate } from "../../src/logic/effects/gates/combo.js";
import {
  getPlaysThisTurn,
  setPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310"; // Fairy Convocation (1 PP)
const FAY = "10111110";
const GRASSHOPPER = "10111140";

describe("Foundations — Combo (playsThisTurn)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("handleComboGate: plays < threshold runs else; plays >= threshold runs effects", () => {
    setPlaysThisTurn(state, "first", 2);
    const queue: any[] = [];
    handleComboGate(
      { count: 3, effects: [{ op: "draw", source: "deck", count: 1 }] },
      { owner: "first", queue },
    );
    expect(queue.length).toBe(0);

    setPlaysThisTurn(state, "first", 3);
    handleComboGate(
      { count: 3, effects: [{ op: "draw", source: "deck", count: 1 }] },
      { owner: "first", queue },
    );
    expect(queue.length).toBe(1);
  });

  it("Fay — Combo (3) on 3rd card played buffs other allies", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstHand([FILLER, FILLER, FAY])
      .withFirstPP(10, 10)
      .build();

    const ally = {
      name: "Ally",
      type: "Follower" as const,
      cost: 1,
      attack: 1,
      defense: 1,
    };
    const boardAlly = createCard(ally, "board", "first");
    boardAlly.peak_defense = 1;
    state.players.first.board = [boardAlly];

    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    expect(getPlaysThisTurn(state, "first")).toBe(2);
    whenPlayCard("first", 0);
    expect(getPlaysThisTurn(state, "first")).toBe(3);
    expect(boardAlly.attack).toBe(2);
    expect(boardAlly.defense).toBe(2);
    expect(findOnBoard("first", "Fay Twinkletoes")!.attack).toBe(2);
  });

  it("Workin' Grasshopper (10111140) — Fanfare draws follower costing X = Combo", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstHand([FILLER, FILLER, GRASSHOPPER])
      .withFirstDeck(["10113140", "10113140", "10113140"])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const drawn = thenHand("first").find(
      (c) => c.name === "Killer Rhinoceroach",
    );
    expect(drawn).toBeTruthy();
  });
});
