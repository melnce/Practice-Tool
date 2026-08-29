/**
 * Gate condition: ally_attacked_leader_last_turn
 *
 * "If an allied follower attacked a leader on your last turn"
 * (Set 10009 — Ripper-Clawed Thief, High-Spirited Marauder, Barren-Earth Tyrant,
 *  Artiglio, Antemaria, Piercing Convict)
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  resetUidCounter,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  getAllyAttackedLeaderLastTurn,
  getAnyAllyAttackedLeaderThisTurn,
} from "../../src/core/playerHelpers.js";
import { attackLeader, attackFollower } from "../../src/logic/core/combat.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import {
  setHistoryEnabled,
  resetHistory,
  undo,
  redo,
} from "../../src/core/history.js";

function stormFollower(name: string) {
  return createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      hasStorm: true,
      can_attack: true,
      attacks_left: 1,
      attacks_per_turn: 1,
      justPlayed: false,
      hasAttacked: false,
    },
    "board",
    "first",
  );
}

function evaluateGate(owner: "first" | "second" = "first"): boolean {
  const effect = {
    op: "gate" as const,
    condition: "ally_attacked_leader_last_turn",
    effects: [
      {
        op: "damage" as const,
        target: "enemy:leader" as const,
        amount: 1,
      },
    ],
  };
  const hpBefore = state.players.second.hp;
  whenRunEffects([effect], owner);
  return state.players.second.hp < hpBefore;
}

describe("Mechanic Contract: ally_attacked_leader_last_turn", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .withFirstDeck(makeFillerDeck("f", 20))
      .withSecondDeck(makeFillerDeck("s", 20))
      .build();
    state.gameStarted = true;
  });

  it("passes on the turn after an allied follower attacked the enemy leader", () => {
    state.players.first.board = [stormFollower("Raider")];

    attackLeader(0, "first", "second");
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(true);

    endTurnBlue();
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(false);
    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(true);

    endTurnRed();

    expect(state.activePlayer).toBe("first");
    expect(evaluateGate("first")).toBe(true);
  });

  it("fails when no allied follower attacked the leader on the owner's previous turn", () => {
    state.players.first.board = [stormFollower("Raider")];

    attackLeader(0, "first", "second");
    endTurnBlue();
    endTurnRed();

    state.players.first.board = [stormFollower("Raider2")];
    attackFollower(0, 0, "first", "second");
    endTurnBlue();
    endTurnRed();

    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(false);
    expect(evaluateGate("first")).toBe(false);
  });

  it("does not count a leader attack on the current turn (only last turn)", () => {
    state.players.first.board = [stormFollower("Raider")];
    attackLeader(0, "first", "second");

    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(false);
    expect(evaluateGate("first")).toBe(false);
  });

  it("does not count a blocked leader attack (ward)", () => {
    const ward = createCard(
      {
        name: "Ward",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 5,
        hasWard: true,
      },
      "board",
      "second",
    );
    state.players.first.board = [stormFollower("Raider")];
    state.players.second.board = [ward];

    attackLeader(0, "first", "second");

    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(false);
    endTurnBlue();
    endTurnRed();

    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(false);
    expect(evaluateGate("first")).toBe(false);
  });

  it("undo/redo restores gate state after leader attack and end turn", () => {
    state.players.first.board = [stormFollower("Raider")];

    attackLeader(0, "first", "second");
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(true);

    undo({ autoRender: false });
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(false);

    redo({ autoRender: false });
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(true);

    endTurnBlue();
    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(true);

    undo({ autoRender: false });
    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(false);
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(true);

    redo({ autoRender: false });
    expect(getAllyAttackedLeaderLastTurn(state, "first")).toBe(true);
    expect(getAnyAllyAttackedLeaderThisTurn(state, "first")).toBe(false);
  });
});

function makeFillerDeck(prefix: string, n: number) {
  const out: Array<{ name: string; type: "Follower"; cost: number }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ name: `${prefix}${i}`, type: "Follower", cost: 1 });
  }
  return out;
}
