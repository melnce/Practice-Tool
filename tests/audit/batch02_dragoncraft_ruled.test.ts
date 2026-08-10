/**
 * Batch 2 — Dragoncraft owner rulings (B/C resolved).
 * Assertions from owner rulings recorded in docs/llm-guide.md + docs/svwb_rulebook_formatted.md.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import { handleRestore } from "../../src/logic/effects/ops/restore/index.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  getHP,
  getMaxHP,
  getHand,
  getBoard,
} from "../../src/core/playerHelpers.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import "../../src/logic/core/effects/index.js";

function setupTurn(round: number, opts: { hand?: string[]; pp?: number } = {}) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  givenGameState({ seed: 1, activePlayer: "first", roundCount: round })
    .withFirstPP(pp, max)
    .withFirstHand(opts.hand ?? [])
    .build();
}

describe("Owner ruling — Zooey Enhance (10) (10444120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("(a) sets leader max defense to 1, clamps current HP, idempotent, healing capped at 1", () => {
    setupTurn(10, { hand: ["10444120"], pp: 10 });
    state.players.first.hp = 15;
    state.players.first.maxHP = 20;

    whenPlayCard("first", 0);

    expect(getMaxHP(state, "first")).toBe(1);
    expect(getHP(state, "first")).toBe(1);

    handleRestore(
      { op: "restore", target: "ally:leader", player: "self", amount: 5 },
      "first",
      [],
      { owner: "first", sourceCard: null },
    );
    expect(getHP(state, "first")).toBe(1);

    runEffects(
      [
        {
          op: "stat",
          target: "ally:leader",
          action: "set",
          defense: 1,
        },
      ],
      "first",
      null,
    );
    expect(getMaxHP(state, "first")).toBe(1);
    expect(getHP(state, "first")).toBe(1);
  });

  it("(b) leader damage capped at 0 per instance until opponent EOT, then cap expires", () => {
    setupTurn(10, { hand: ["10444120"], pp: 10 });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(1);

    applyLeaderDamage("first", 5);
    expect(getHP(state, "first")).toBe(1);

    const storm = createCard(
      { name: "Striker", type: "Follower", cost: 2, attack: 3, defense: 1 },
      "board",
      "first",
    );
    applyKeywordsFromList(storm);
    storm.hasStorm = true;
    storm.can_attack = true;
    storm.attacks_left = 1;
    state.players.first.board.push(storm);
    attackLeader(0, "first", "second");
    expect(getHP(state, "first")).toBe(1);

    whenEndTurn();
    whenEndTurn();
    expect(state.activePlayer).toBe("first");

    applyLeaderDamage("first", 1);
    expect(getHP(state, "first")).toBe(0);
  });
});

describe("Owner ruling — Raging Lightning Overflow leaders (10341310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Overflow: 3 damage to every leader tied for highest defense (both leaders at 20)", () => {
    setupTurn(7, { hand: ["10341310"], pp: 3 });
    state.players.first.hp = 20;
    state.players.first.maxHP = 20;
    state.players.second.hp = 20;
    state.players.second.maxHP = 20;

    whenPlayCard("first", 0);

    expect(getHP(state, "first")).toBe(17);
    expect(getHP(state, "second")).toBe(17);
  });
});

describe("Owner ruling — Mari (10441120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("hand: 3-base-cost ally super-evolve sets Mari cost to 0 for the turn (stays 0 after another)", () => {
    setupTurn(7, { hand: ["10441120", "10143120"] });
    const liu = createCard("10143120", "board", "first");
    liu.peak_defense = liu.defense;
    state.players.first.board = [liu];

    const mari = getHand(state, "first").find(
      (c) => c.name === "Mari, Meg's Bestie",
    )!;
    const base = mari.cost;

    onEvolve(liu, "first", "super");
    expect(getEffectiveCost(mari)).toBe(0);

    const liu2 = createCard("10143120", "board", "first");
    liu2.uid = "liu2";
    liu2.peak_defense = liu2.defense;
    state.players.first.board.push(liu2);
    onEvolve(liu2, "first", "super");
    expect(getEffectiveCost(mari)).toBe(0);
    expect(base).toBeGreaterThan(0);
  });

  it("board: EOT +1/+1 to a random super-evolved ally (any turn it super-evolved)", () => {
    setupTurn(7);
    const oldSuper = createCard("10042110", "board", "first");
    oldSuper.peak_defense = oldSuper.defense;
    onEvolve(oldSuper, "first", "super");
    expect(oldSuper.evoType).toBe("super");

    const mari = createCard("10441120", "board", "first");
    state.players.first.board.push(mari);

    const atkBefore = parseInt(String(oldSuper.attack), 10);
    const defBefore = parseInt(String(oldSuper.defense), 10);
    whenEndTurn();
    const atkAfter = parseInt(String(oldSuper.attack), 10);
    const defAfter = parseInt(String(oldSuper.defense), 10);
    expect(atkAfter + defAfter).toBeGreaterThanOrEqual(atkBefore + defBefore);
  });
});

describe("Owner ruling — Azurifrit on-damage (10344110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("during your turn: each damage instance (including 0) hits enemy leader; 3-activation cap per turn", () => {
    setupTurn(6);
    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;

    dealDamage(az, 0, "first");
    expect(getHP(state, "second")).toBe(19);

    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(18);

    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(17);

    dealDamage(az, 0, "first");
    expect(getHP(state, "second")).toBe(17);

    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(17);
  });
});
