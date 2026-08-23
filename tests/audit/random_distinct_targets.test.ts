/**
 * Rulebook randomness — "N random followers" picks distinct targets sequentially.
 * Group B ("do this N times: deal X to a random follower") keeps random_hits.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
  whenRunEffects,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHP, getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("Rulebook — random_distinct damage (N random followers)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Erntz unevolved EOT — one 8/10 enemy follower takes 8 once and survives at 8/2", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .build();

    const erntz = createCard("10544110", "board", "first");
    erntz.hasEvolved = false;
    state.players.first.board = [erntz];

    const lone = createCard(
      { name: "Solo", type: "Follower", cost: 5, attack: 8, defense: 10 },
      "board",
      "second",
    );
    lone.peak_defense = 10;
    state.players.second.board = [lone];

    whenEndTurn();

    expect(Number(lone.defense)).toBe(2);
    expect(thenBoard("second")).toHaveLength(1);
  });

  it("random_distinct — first hit kills a follower, second hits a different survivor", () => {
    givenGameState({ seed: 42, activePlayer: "first" }).build();

    const fragile = createCard(
      { name: "Fragile", type: "Follower", cost: 1, attack: 1, defense: 3 },
      "board",
      "second",
    );
    const tank = createCard(
      { name: "Tank", type: "Follower", cost: 5, attack: 1, defense: 10 },
      "board",
      "second",
    );
    fragile.peak_defense = 3;
    tank.peak_defense = 10;
    state.players.second.board = [fragile, tank];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 5,
          count: 2,
          distribution: "random_distinct",
        },
      ] as any,
      "first",
    );

    const board = thenBoard("second");
    const fragileOnBoard = board.find((c) => c.name === "Fragile");
    const tankOnBoard = board.find((c) => c.name === "Tank");

    expect(fragileOnBoard).toBeUndefined();
    expect(Number(tankOnBoard?.defense)).toBe(5);
  });

  it("random_distinct — fewer targets than hits leaves survivors with at most one hit each", () => {
    givenGameState({ seed: 7, activePlayer: "first" }).build();

    const only = createCard(
      { name: "Only", type: "Follower", cost: 2, attack: 2, defense: 10 },
      "board",
      "second",
    );
    only.peak_defense = 10;
    state.players.second.board = [only];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 3,
          count: 3,
          distribution: "random_distinct",
        },
      ] as any,
      "first",
    );

    expect(Number(only.defense)).toBe(7);
  });
});

describe("Group B — random_hits (do this N times) unchanged", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Oluon evolved EOT — same follower can be hit twice (with replacement)", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 9 }).build();

    const oluon = createCard("10524110", "board", "first");
    oluon.hasEvolved = true;
    state.players.first.board = [oluon];

    const tank = createCard(
      { name: "Tank", type: "Follower", cost: 5, attack: 1, defense: 20 },
      "board",
      "second",
    );
    tank.peak_defense = 20;
    state.players.second.board = [tank];

    whenEndTurn();

    const remaining = Number(getBoard(state, "second")[0]?.defense ?? 0);
    expect(20 - remaining).toBeGreaterThanOrEqual(14);
  });

  it("Cupitan effect-evolve — 7×1 random follower damage (random_hits)", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 7 })
      .withFirstHand(["10413110"])
      .withFirstPP(7, 7)
      .build();

    const cupitan = createCard("10413110", "board", "first");
    cupitan.hasEvolved = false;
    state.players.first.board = [cupitan];

    const a = createCard(
      { name: "A", type: "Follower", cost: 1, attack: 1, defense: 10 },
      "board",
      "second",
    );
    const b = createCard(
      { name: "B", type: "Follower", cost: 1, attack: 1, defense: 10 },
      "board",
      "second",
    );
    a.peak_defense = 10;
    b.peak_defense = 10;
    state.players.second.board = [a, b];

    whenRunEffects(cupitan.evolve ?? [], "first", cupitan);

    const totalRemaining = thenBoard("second").reduce(
      (sum, c) => sum + (Number(c.defense) || 0),
      0,
    );
    expect(totalRemaining).toBe(13);
  });
});
