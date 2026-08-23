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

  // Bible (Owner ruling, Raging Lightning): compare **current** defense among ALL
  // leaders (own included); ties all take 3. Asymmetric cases diverge from maxHP.
  it("Overflow: only the leader(s) with highest *current* defense take 3 (20/20 vs 15/20)", () => {
    setupTurn(7, { hand: ["10341310"], pp: 3 });
    state.players.first.hp = 20;
    state.players.first.maxHP = 20;
    state.players.second.hp = 15;
    state.players.second.maxHP = 20;

    whenPlayCard("first", 0);

    expect(getHP(state, "first")).toBe(17);
    expect(getHP(state, "second")).toBe(15);
  });

  it("Overflow: tie on current defense despite different max (20/25 vs 20/20 → both 17)", () => {
    setupTurn(7, { hand: ["10341310"], pp: 3 });
    state.players.first.hp = 20;
    state.players.first.maxHP = 25;
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

  // Bible (Owner ruling, Mari): cost becomes 0 **until your end of turn**.
  it("hand: until-EOT cost set reverts to base after whenEndTurn()", () => {
    setupTurn(7, { hand: ["10441120", "10143120"] });
    const liu = createCard("10143120", "board", "first");
    liu.peak_defense = liu.defense;
    state.players.first.board = [liu];

    const mari = getHand(state, "first").find(
      (c) => c.name === "Mari, Meg's Bestie",
    )!;
    expect(getEffectiveCost(mari)).toBe(2);

    onEvolve(liu, "first", "super");
    expect(getEffectiveCost(mari)).toBe(0);

    whenEndTurn();
    expect(getEffectiveCost(mari)).toBe(2);
  });

  // Bible (Owner ruling, Mari): EOT +1/+1 to one random **super-evolved** ally.
  // Seed 2 previously buffed PlainA when object filter was ignored.
  it("board: EOT +1/+1 targets only a super-evolved ally (seed 2 must not hit PlainA)", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 7 })
      .withFirstPP(7, 7)
      .build();

    const superGuy = createCard("10042110", "board", "first");
    superGuy.peak_defense = superGuy.defense;
    onEvolve(superGuy, "first", "super");
    expect(superGuy.evoType).toBe("super");

    const plainA = createCard(
      { name: "PlainA", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const plainB = createCard(
      { name: "PlainB", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const plainC = createCard(
      { name: "PlainC", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const mari = createCard("10441120", "board", "first");
    state.players.first.board = [superGuy, plainA, plainB, plainC, mari];

    const before = {
      superAtk: Number(superGuy.attack),
      superDef: Number(superGuy.defense),
      a: Number(plainA.attack),
      b: Number(plainB.attack),
      c: Number(plainC.attack),
      m: Number(mari.attack),
    };

    const eot = (mari.triggers as any[]).find((t) => t.event === "end_of_turn");
    runEffects(eot.effects, "first", mari);

    expect(Number(superGuy.attack)).toBe(before.superAtk + 1);
    expect(Number(superGuy.defense)).toBe(before.superDef + 1);
    expect(Number(plainA.attack)).toBe(before.a);
    expect(Number(plainB.attack)).toBe(before.b);
    expect(Number(plainC.attack)).toBe(before.c);
    expect(Number(mari.attack)).toBe(before.m);
  });

  it("board: EOT +1/+1 to a random super-evolved ally (any turn it super-evolved)", () => {
    setupTurn(7);
    const oldSuper = createCard("10042110", "board", "first");
    oldSuper.peak_defense = oldSuper.defense;
    onEvolve(oldSuper, "first", "super");
    expect(oldSuper.evoType).toBe("super");

    const plain = createCard(
      { name: "Plain", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const mari = createCard("10441120", "board", "first");
    state.players.first.board = [oldSuper, plain, mari];

    const atkBefore = parseInt(String(oldSuper.attack), 10);
    const defBefore = parseInt(String(oldSuper.defense), 10);
    const plainAtkBefore = parseInt(String(plain.attack), 10);

    const eot = (mari.triggers as any[]).find((t) => t.event === "end_of_turn");
    runEffects(eot.effects, "first", mari);

    expect(parseInt(String(oldSuper.attack), 10)).toBe(atkBefore + 1);
    expect(parseInt(String(oldSuper.defense), 10)).toBe(defBefore + 1);
    expect(parseInt(String(plain.attack), 10)).toBe(plainAtkBefore);
  });
});

describe("Owner ruling — Azurifrit on-damage (10344110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  // Owner ruling (2026-08-23): printed text has no cap — "No cap — fires every time."
  // Prior test wrongly enshrined max_per_turn: 3 (Fanfare "Do this 3 times" was mistaken for a trigger cap).
  it("during your turn: each damage instance (including 0) hits enemy leader; no per-turn cap", () => {
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
    expect(getHP(state, "second")).toBe(16);

    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(15);
  });
});
