/**
 * whose_turn must compare against state.activePlayer for every trigger event,
 * not the fireTrigger routing argument (restored/damaged/buffed owner slot).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getHP, getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

function setupTurn(active: "first" | "second" = "first", round = 8) {
  resetUidCounter();
  givenGameState({ seed: 1, activePlayer: active, roundCount: round })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

describe("whose_turn — leader_restored (Follower of the Tenets 10961110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: leader restore evolves this follower", () => {
    const tenets = createCard("10961110", "board", "first");
    tenets.peak_defense = tenets.defense;
    state.players.first.board = [tenets];
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(tenets.hasEvolved).toBe(true);
  });

  it("opponent's turn: leader restore does not evolve this follower", () => {
    setupTurn("second");
    const tenets = createCard("10961110", "board", "first");
    tenets.peak_defense = tenets.defense;
    state.players.first.board = [tenets];
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(tenets.hasEvolved).toBeFalsy();
  });
});

describe("whose_turn — leader_restored (Saint of Rehabilitation 10563110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: leader restore summons Fox of Purity", () => {
    const saint = createCard("10563110", "board", "first");
    saint.peak_defense = saint.defense;
    state.players.first.board = [saint];
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(
      getBoard(state, "first").some((c) => c.name === "Fox of Purity"),
    ).toBe(true);
  });

  it("opponent's turn: leader restore does not summon Fox of Purity", () => {
    setupTurn("second");
    const saint = createCard("10563110", "board", "first");
    saint.peak_defense = saint.defense;
    state.players.first.board = [saint];
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(
      getBoard(state, "first").some((c) => c.name === "Fox of Purity"),
    ).toBe(false);
  });
});

describe("whose_turn — self_damaged (Azurifrit 10344110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: non-lethal damage deals 1 to enemy leader", () => {
    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;
    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(19);
  });

  it("opponent's turn: non-lethal damage does not hit enemy leader", () => {
    setupTurn("second");
    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;
    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(20);
  });
});

describe("whose_turn — self_buffed_up (Ruflet 10812110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: buff summons a Fairy", () => {
    const ruflet = createCard("10812110", "board", "first");
    ruflet.peak_defense = ruflet.defense;
    state.players.first.board = [ruflet];
    runEffects(
      [{ op: "stat", action: "give", target: "self", attack: 1, defense: 1 }],
      "first",
      ruflet,
    );
    expect(getBoard(state, "first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("opponent's turn: buff does not summon a Fairy", () => {
    setupTurn("second");
    const ruflet = createCard("10812110", "board", "first");
    ruflet.peak_defense = ruflet.defense;
    state.players.first.board = [ruflet];
    runEffects(
      [{ op: "stat", action: "give", target: "self", attack: 1, defense: 1 }],
      "first",
      ruflet,
    );
    expect(getBoard(state, "first").some((c) => c.name === "Fairy")).toBe(
      false,
    );
  });
});
