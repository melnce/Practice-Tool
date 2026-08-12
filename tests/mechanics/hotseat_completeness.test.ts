/**
 * Hot-seat completeness: game-over / lethal, attack ownership guards.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../fixtures/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHP, getWinner } from "../../src/core/playerHelpers.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { drawCard } from "../../src/core/utils.js";
import { undo, resetHistory } from "../../src/core/history.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { endTurnBlue } from "../../src/logic/core/turns.js";

function readyAttacker(
  name: string,
  owner: "first" | "second",
  opts: { attack?: number; defense?: number } = {},
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      attack: opts.attack ?? 5,
      defense: opts.defense ?? 5,
      hasStorm: true,
      justPlayed: false,
      can_attack: true,
      attacks_left: 1,
    },
    "board",
    owner,
  );
  return card;
}

describe("Game over — lethal", () => {
  beforeEach(() => {
    resetUidCounter();
    resetHistory();
    givenGameState({ seed: 42, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("sets phase=gameover and winner when leader HP hits 0 via applyLeaderDamage", () => {
    state.players.second.hp = 3;
    applyLeaderDamage("second", 3);

    expect(getHP(state, "second")).toBe(0);
    expect(state.phase).toBe("gameover");
    expect(state.gameOverReason).toBe("lethal");
    expect(state.players.second.defeated).toBe(true);
    expect(getWinner(state)).toBe("first");
    expect(state.winner).toBe("first");
  });

  it("ends the game on a lethal leader attack", () => {
    state.players.second.hp = 4;
    const atk = readyAttacker("Lethal", "first", { attack: 4 });
    state.players.first.board = [atk];

    const outcome = attackLeader(0, "first", "second");
    expect(outcome.kind).toBe("done");
    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
  });

  it("blocks End Turn after game over", () => {
    state.players.second.hp = 0;
    state.players.second.defeated = true;
    state.phase = "gameover";
    state.winner = "first";
    state.gameOverReason = "lethal";

    const before = state.activePlayer;
    endTurnBlue();
    expect(state.activePlayer).toBe(before);
    expect(state.phase).toBe("gameover");
  });

  it("undo restores pre-lethal state (practice take-back)", () => {
    state.players.second.hp = 5;
    const atk = readyAttacker("UndoLethal", "first", { attack: 5 });
    state.players.first.board = [atk];

    attackLeader(0, "first", "second");
    expect(state.phase).toBe("gameover");
    expect(getHP(state, "second")).toBe(0);

    undo();
    expect(state.phase).not.toBe("gameover");
    expect(getHP(state, "second")).toBe(5);
    expect(state.players.second.defeated).toBe(false);
  });
});

describe("Game over — deck-out", () => {
  beforeEach(() => {
    resetUidCounter();
    resetHistory();
    givenGameState({ seed: 7, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("sets phase=gameover on empty-deck draw", () => {
    state.players.first.deck = [];
    const ok = drawCard(
      state.players.first.hand,
      state.players.first.deck,
      "first",
    );
    expect(ok).toBe(false);
    expect(state.players.first.defeated).toBe(true);
    expect(state.phase).toBe("gameover");
    expect(state.gameOverReason).toBe("deckout");
    expect(getWinner(state)).toBe("second");
  });
});

describe("Attack ownership engine guards", () => {
  beforeEach(() => {
    resetUidCounter();
    resetHistory();
    givenGameState({ seed: 99, activePlayer: "second" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("refuses off-turn attackLeader with Not your turn", () => {
    state.players.second.hp = 20;
    const firstAtk = readyAttacker("OffTurn", "first", { attack: 2 });
    state.players.first.board = [firstAtk];

    const hpBefore = getHP(state, "second");
    const outcome = attackLeader(0, "first", "second");

    expect(outcome).toEqual({ kind: "blocked", reason: "Not your turn" });
    expect(getHP(state, "second")).toBe(hpBefore);
    expect(state.phase).not.toBe("gameover");
  });

  it("refuses off-turn attackFollower with Not your turn", () => {
    const firstAtk = readyAttacker("OffTurnF", "first", { attack: 2 });
    const def = readyAttacker("Def", "second", { attack: 1, defense: 5 });
    state.players.first.board = [firstAtk];
    state.players.second.board = [def];

    const outcome = attackFollower(0, 0, "first", "second");
    expect(outcome).toEqual({ kind: "blocked", reason: "Not your turn" });
    expect(state.players.second.board[0]!.defense).toBe(5);
  });

  it("allows legal on-turn attackLeader", () => {
    // Second player's turn — their attacker may swing
    givenGameState({ seed: 99, activePlayer: "second" }).build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.hp = 18;

    const atk = readyAttacker("Legal", "second", { attack: 2 });
    state.players.second.board = [atk];

    const outcome = attackLeader(0, "second", "first");
    expect(outcome.kind).toBe("done");
    expect(getHP(state, "first")).toBe(16);
  });
});

describe("playCardCore turn / gameover blocks", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 3, activePlayer: "second" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("blocks off-turn play with Not your turn", () => {
    const card = createCard(
      {
        name: "Spell",
        type: "Spell",
        cost: 0,
      },
      "hand",
      "first",
    );
    state.players.first.hand = [card];
    state.players.first.pp = 10;

    const outcome = playCardNoRender(state.players.first.hand, "first", 0);
    expect(outcome).toEqual({ kind: "blocked", reason: "Not your turn" });
  });

  it("blocks play after game over", () => {
    state.activePlayer = "first";
    state.phase = "gameover";
    const card = createCard(
      {
        name: "Spell2",
        type: "Spell",
        cost: 0,
      },
      "hand",
      "first",
    );
    state.players.first.hand = [card];
    state.players.first.pp = 10;

    const outcome = playCardNoRender(state.players.first.hand, "first", 0);
    expect(outcome).toEqual({ kind: "blocked", reason: "Game over" });
  });
});
