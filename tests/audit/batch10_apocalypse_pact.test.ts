/**
 * Set 10006 — Apocalypse Pact audit (authored subset).
 *
 * Focus: non-trivial targeting, triggers, conditionals, class mechanics.
 * Stubbed / blocked cards are intentionally not covered here.
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
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

const AUTHORED_SAMPLE = [
  "10601110",
  "10601120",
  "10611120",
  "10624110",
  "10632110",
  "10642120",
  "10652310",
  "10653110",
  "10672110",
  "10673110",
] as const;

describe("Set 10006 — Apocalypse Pact", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("sample authored cards classify as implemented", () => {
    for (const id of AUTHORED_SAMPLE) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("Muddled Onlooker — Last Words deal 1 to enemy leader", () => {
    setupTurn(2, { hand: ["10601110"], pp: 2 });
    whenPlayCard("first", 0);
    const onlooker = findOnBoard("first", "Muddled Onlooker")!;
    expect(onlooker).toBeTruthy();
    onlooker.defense = 0;
    cleanupDead();
    expect(getHP(state, "second")).toBe(19);
  });

  it("Disrupted Commoner — Fanfare destroys selected enemy; has Bane", () => {
    setupTurn(5, { hand: ["10601120"], pp: 5 });
    enemyFollower(2, 4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(findOnBoard("first", "Disrupted Commoner")?.hasBane).toBe(true);
  });

  it("Monkey of Paradise — Combo (3) evolves this follower", () => {
    setupTurn(5, {
      hand: ["10631110", "10631110", "10611120"],
      pp: 10,
    });
    playCardNoRender(getHand(state, "first"), "first", 0);
    playCardNoRender(getHand(state, "first"), "first", 0);
    playCardNoRender(getHand(state, "first"), "first", 0);
    const monkey = findOnBoard("first", "Monkey of Paradise");
    expect(monkey?.hasEvolved).toBe(true);
  });

  it("Noel IV — at 6 PP fanfare only (Bane soldier, no Enhance tier)", () => {
    setupTurn(6, { hand: ["10624110"], pp: 6 });
    whenPlayCard("first", 0);
    const soldiers = getBoard(state, "first").filter(
      (c) => c.name === "Fearless Soldier",
    );
    expect(soldiers).toHaveLength(1);
    expect(soldiers[0]?.hasBane).toBe(true);
    expect(soldiers.some((c) => c.hasDrain)).toBe(false);
    expect(soldiers.some((c) => c.hasStorm)).toBe(false);
  });

  it("Noel IV — at 7 PP Enhance (7) Drain soldier, not Storm", () => {
    setupTurn(7, { hand: ["10624110"], pp: 7 });
    whenPlayCard("first", 0);
    const soldiers = getBoard(state, "first").filter(
      (c) => c.name === "Fearless Soldier",
    );
    expect(soldiers).toHaveLength(2);
    expect(soldiers.some((c) => c.hasBane)).toBe(true);
    expect(soldiers.some((c) => c.hasDrain)).toBe(true);
    expect(soldiers.some((c) => c.hasStorm)).toBe(false);
  });

  it("Noel IV — at 8 PP Fanfare plus Enhance (7) Drain and Enhance (8) Storm soldiers", () => {
    setupTurn(8, { hand: ["10624110"], pp: 8 });
    whenPlayCard("first", 0);
    const soldiers = getBoard(state, "first").filter(
      (c) => c.name === "Fearless Soldier",
    );
    expect(soldiers).toHaveLength(3);
    expect(soldiers.some((c) => c.hasBane)).toBe(true);
    expect(soldiers.some((c) => c.hasDrain)).toBe(true);
    expect(soldiers.some((c) => c.hasStorm)).toBe(true);
    expect(findOnBoard("first", "Noel IV, Ruthless Warlord")).toBeTruthy();
    expect(getBoard(state, "first")).toHaveLength(4);
  });

  it("Navy Cat — destroys all enemy followers with 1 defense", () => {
    setupTurn(8, { hand: ["10622120"], pp: 8 });
    enemyFollower(3, 1, "One");
    enemyFollower(2, 2, "Two");
    enemyFollower(1, 1, "Three");
    whenPlayCard("first", 0);
    cleanupDead();
    const survivors = getBoard(state, "second").map((c) => c.name);
    expect(survivors).toEqual(["Two"]);
  });

  it("Enraptured Student — Crystalspawn enter restores 1", () => {
    setupTurn(5, { hand: ["10632110", "10631310"], pp: 10 });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    // Fanfare summons 2 Crystalspawn → 2 restores
    expect(getHP(state, "first")).toBe(17);
  });

  it("Spiked Dragon — EOT evolves; evolve damages all enemies", () => {
    setupTurn(8, { hand: ["10642120"], pp: 8 });
    enemyFollower(2, 5, "Wall");
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    whenEndTurn("first");
    const spiked = findOnBoard("first", "Spiked Dragon");
    expect(spiked?.hasEvolved).toBe(true);
    expect(getBoard(state, "second")[0]?.defense).toBe(2);
    expect(getHP(state, "second")).toBe(17);
  });

  it("Allure of the Mightiest — banish enemy and summon exact copy", () => {
    setupTurn(7, { hand: ["10652310"], pp: 7 });
    enemyFollower(5, 5, "Boss");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(findOnBoard("first", "Boss")).toBeTruthy();
  });

  it("Deprived Destroyer — destroy ally then evolve; evolve summons evolved Bat", () => {
    setupTurn(5, { hand: ["10653110"], pp: 5 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 1;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(findOnBoard("first", "Ally")).toBeFalsy();
    expect(findOnBoard("first", "Deprived Destroyer")?.hasEvolved).toBe(true);
    const bat = findOnBoard("first", "Bat");
    expect(bat?.hasEvolved).toBe(true);
  });

  it("Advent of the Eld Sight — Necromancy (4) restores 2", () => {
    setupTurn(4, {
      hand: ["10651310"],
      pp: 3,
      deck: ["10631110", "10631110", "10631110", "10631110"],
    });
    state.players.first.hp = 15;
    state.players.first.shadows = 4;
    whenPlayCard("first", 0);
    // Play adds 1 shadow then Necromancy spends 4 → 1 remaining
    expect(getShadows(state, "first")).toBe(1);
    expect(getHP(state, "first")).toBe(17);
    expect(getHand(state, "first").length).toBeGreaterThanOrEqual(2);
  });

  it("Substandard Puppet — Fanfare summons copy and evolves both", () => {
    setupTurn(5, { hand: ["10672110"], pp: 5 });
    whenPlayCard("first", 0);
    const pups = getBoard(state, "first").filter(
      (c) => c.name === "Substandard Puppet",
    );
    expect(pups).toHaveLength(2);
    expect(pups.every((c) => c.hasEvolved)).toBe(true);
  });

  it("Timid Pioneer — banishes enemy with 3 defense or less", () => {
    setupTurn(4, { hand: ["10672120"], pp: 4 });
    enemyFollower(2, 3, "Fragile");
    enemyFollower(4, 4, "Tank");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second").map((c) => c.name)).toEqual(["Tank"]);
  });

  it("Ruthless Eld Sword Enhance (3) — activates both modes", () => {
    setupTurn(3, {
      hand: ["10623310"],
      pp: 3,
      deck: ["10631110", "10631110", "10631110"],
    });
    enemyFollower(2, 4, "Target");
    const handBefore = getHand(state, "first").length;
    whenPlayCard("first", 0);
    // Enhance replaces spell: draw 1 + 3 dmg random
    expect(getHand(state, "first").length).toBe(handBefore); // spell left hand, drew 1
    // hand: removed spell (-1) + draw (+1) = same length before play was 1, after draw 1
    expect(getHand(state, "first").length).toBe(1);
    expect(getBoard(state, "second")[0]?.defense).toBe(1);
  });

  it("Worshipful Crusader — Fanfare summons a copy", () => {
    setupTurn(6, { hand: ["10663110"], pp: 6 });
    whenPlayCard("first", 0);
    expect(
      getBoard(state, "first").filter((c) => c.name === "Worshipful Crusader"),
    ).toHaveLength(2);
  });
});
