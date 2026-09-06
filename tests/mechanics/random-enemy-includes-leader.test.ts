/**
 * Sandalphon SSA (10404110): "random enemy" includes the enemy leader.
 * Official Q&A: each of 5×2-damage hits picks uniformly among live enemy
 * followers and the enemy leader.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  thenBoard,
  thenHP,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const SANDALPHON = "10404110";

function playSandalphonSSA(seed: number) {
  resetUidCounter();
  givenGameState({ seed, activePlayer: "first", roundCount: 10 })
    .withFirstHand([SANDALPHON])
    .withFirstPP(6)
    .build();
  state.gameStarted = true;
  const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
  sand.skyboundArtEvolvesWitnessed = 15;
  whenPlayCard("first", 0);
}

describe("Sandalphon SSA — random enemy includes leader (10404110)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("one 1/1 enemy follower: follower dead, leader took exactly 8", () => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstHand([SANDALPHON])
      .withFirstPP(6)
      .withSecondBoard([
        { name: "Fairy", type: "Follower", attack: 1, defense: 1 },
      ])
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
    sand.skyboundArtEvolvesWitnessed = 15;
    whenPlayCard("first", 0);

    expect(thenBoard("second").length).toBe(0);
    expect(thenHP("second")).toBe(12);
  });

  it("empty enemy board: leader takes all 10 damage", () => {
    playSandalphonSSA(1);
    expect(thenBoard("second").length).toBe(0);
    expect(thenHP("second")).toBe(10);
  });

  it("2/20 wall (seed 42): wall damage + leader damage = 10 with pinned split", () => {
    resetUidCounter();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstHand([SANDALPHON])
      .withFirstPP(6)
      .withSecondBoard([
        { name: "Wall", type: "Follower", attack: 2, defense: 20 },
      ])
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
    sand.skyboundArtEvolvesWitnessed = 15;
    whenPlayCard("first", 0);

    const wall = findOnBoard("second", "Wall");
    expect(wall).toBeDefined();
    expect(Number(wall!.defense)).toBe(16);
    expect(thenHP("second")).toBe(14);
  });
});
