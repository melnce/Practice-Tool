/**
 * Tier C — card-JSON authoring drift (normalisation + shape gate).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenBoard,
} from "../harness/builders.js";
import { summonFollowerByCardId } from "../harness/l2Dispatch.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { whenSuperEvolve } from "../harness/whenEvolve.js";
import "../../src/logic/core/effects/index.js";

const WILD_PROFUSION = "10011210";
const ANCESTRAL_CROWN = "10022210";
const FAIRY = "90011110";
const DRAW_TOP = "10021110";
const R6 = 6;
const R8 = 8;

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
  state.activePlayer = "first";
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

function allyFollower(atk: number, name = "Bystander", def = atk) {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

describe("tier C — C13 enter-trigger migration (behaviour fix)", () => {
  beforeEach(() => resetUidCounter());

  it("10011210 Wild Profusion — summoned Pixie deals 1 to a random enemy follower", () => {
    setupTurn(R6);
    const profusion = createCard(WILD_PROFUSION, "board", "first");
    applyKeywordsFromList(profusion);
    state.players.first.board = [profusion];
    const foe = enemyFollower(2, 3, "Foe");
    const bystander = enemyFollower(2, 3, "Bystander");
    summonFollowerByCardId(FAIRY, "first");
    const totalDef = Number(foe.defense) + Number(bystander.defense);
    expect(6 - totalDef).toBe(1);
  }, 60_000);

  it("10022210 Ancestral Crown — summoned follower gains +1/+1", () => {
    setupTurn(R6);
    const crown = createCard(ANCESTRAL_CROWN, "board", "first");
    applyKeywordsFromList(crown);
    state.players.first.board = [crown];
    const summoned = summonFollowerByCardId(DRAW_TOP, "first");
    expect(Number(summoned.attack)).toBe(2);
    expect(Number(summoned.defense)).toBe(2);
  }, 60_000);

  it("10011210 Wild Profusion — played Pixie still fires (play path regression)", () => {
    setupTurn(R6, { hand: [FAIRY], pp: 1 });
    const profusion = createCard(WILD_PROFUSION, "board", "first");
    applyKeywordsFromList(profusion);
    state.players.first.board = [profusion];
    const foe = enemyFollower(2, 3, "Foe");
    const bystander = enemyFollower(2, 3, "Bystander");
    whenPlayCard("first", 0);
    const totalDef = Number(foe.defense) + Number(bystander.defense);
    expect(6 - totalDef).toBe(1);
  }, 60_000);
});

describe("tier C — C12 inert self-exclusion proof (three spellings)", () => {
  beforeEach(() => resetUidCounter());

  it("10111110 Fay Twinkletoes — Combo buffs bystander not self (condition not_self inert)", () => {
    setupTurn(R6, {
      hand: ["10001110", "10001120", "10111110"],
      pp: 10,
    });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const before = Number(bystander.attack);
    whenPlayCard("first", 0);
    const fay = findOnBoard("first", "Fay Twinkletoes")!;
    expect(Number(fay.attack)).toBe(2);
    expect(Number(bystander.attack)).toBe(before + 1);
  }, 60_000);

  it("10624110 Noel IV — Super-Evolve buffs bystander not self (exclude_self inert on stat)", () => {
    setupTurn(R8, { hand: ["10624110"], pp: 8 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const noel = findOnBoard("first", "Noel IV, Ruthless Warlord")!;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(noel, "first");
    expect(Number(noel.attack)).toBeGreaterThanOrEqual(7);
    expect(Number(bystander.attack)).toBe(3);
  }, 60_000);

  it("10741120 Carrier Wyvern — Fanfare buffs bystander not self (filter not_self inert)", () => {
    setupTurn(R6, { hand: ["10741120"], pp: 4 });
    const bystander = allyFollower(2, "Bystander", 2);
    whenPlayCard("first", 0);
    const wyvern = findOnBoard("first", "Carrier Wyvern")!;
    resolvePendingTarget(String(bystander.uid));
    expect(Number(wyvern.attack)).toBe(3);
    expect(Number(wyvern.defense)).toBe(2);
    expect(Number(bystander.attack)).toBe(4);
    expect(Number(bystander.defense)).toBe(4);
  }, 60_000);
});

describe("tier C — C10 deck summon filter key", () => {
  beforeEach(() => resetUidCounter());

  it("10322120 Peppy Scout — summons Swordcraft follower costing ≤3 from deck", () => {
    setupTurn(R6, {
      hand: ["10322120"],
      pp: 5,
      deck: ["10121110", "10201110"],
    });
    whenPlayCard("first", 0);
    const scout = findOnBoard("first", "Peppy Scout")!;
    const summoned = thenBoard("first").find((c) => c.uid !== scout.uid)!;
    expect(summoned.class).toBe("Swordcraft");
    expect(Number(summoned.cost)).toBeLessThanOrEqual(3);
    expect(summoned.name).toBe("Ian, Lovebound Knight");
  }, 60_000);
});
