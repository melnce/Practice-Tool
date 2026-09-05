/**
 * Obsessed Test Subject (10931110) — named_enter_count on enter-trigger route.
 * Drache & Aluzard (10844110) — named_enter_count on Fanfare route (regression pin).
 *
 * Enter triggers are reactive (queued behind the resolving effect). Leading gate
 * ops are pre-judged at enqueue per rulebook L252 (same as turn-boundary triggers
 * in PR #219): each copy's "if at least 5 other copies have entered" is evaluated
 * when that copy's trigger is created, not when the queue drains.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { countNamedEnters } from "../../src/logic/core/followerEnterHistory.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const OTS = "Obsessed Test Subject";
const DRACHE_ID = "10844110";
const SEPHIE_ID = "10934110";
const R8 = 8;

function setupBase(round = 8) {
  givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(20, 20)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.players.first.board = [];
}

function summonOTS(): CardInstance {
  summonNamed({ op: "summon", source: "named", name: OTS, count: 1 }, "first");
  const board = getBoard(state, "first");
  const copy = board.filter((c) => c?.name === OTS).at(-1);
  expect(copy).toBeTruthy();
  return copy!;
}

function isBuffed(card: CardInstance): boolean {
  return Number(card.attack) === 5 && Number(card.defense) === 5;
}

function clearBoardKeepHistory(): void {
  state.players.first.board = [];
}

function playDracheFromHand(): CardInstance {
  const hand = getHand(state, "first");
  const idx = hand.findIndex((c) => c.id === DRACHE_ID);
  expect(idx).toBeGreaterThanOrEqual(0);
  whenPlayCard("first", idx);
  const board = getBoard(state, "first");
  const drache = board.find((c) => c?.id === DRACHE_ID);
  expect(drache).toBeTruthy();
  return drache!;
}

describe("Obsessed Test Subject — named_enter_count enter-trigger route", () => {
  beforeEach(() => {
    resetUidCounter();
    setupBase();
  });

  it("copies 1–5 are unbuffed; copy 6 is 5/5", () => {
    for (let i = 1; i <= 5; i++) {
      const copy = summonOTS();
      expect(isBuffed(copy)).toBe(false);
      expect(Number(copy.attack)).toBe(2);
      expect(Number(copy.defense)).toBe(2);
      state.players.first.board = [];
    }

    const sixth = summonOTS();
    expect(isBuffed(sixth)).toBe(true);
    expect(countNamedEnters(state, "first", OTS)).toBe(6);
  });

  it("copy 7+ stays buffed (at least 5 others)", () => {
    for (let i = 1; i <= 6; i++) {
      summonOTS();
      state.players.first.board = [];
    }
    const seventh = summonOTS();
    expect(isBuffed(seventh)).toBe(true);
  });

  it("destroyed copies still count toward the gate", () => {
    for (let i = 0; i < 5; i++) summonOTS();
    clearBoardKeepHistory();
    expect(countNamedEnters(state, "first", OTS)).toBe(5);

    const sixth = summonOTS();
    expect(isBuffed(sixth)).toBe(true);
  });

  it("Sephie Fanfare summons — 5th unbuffed, 6th buffed", () => {
    for (let i = 0; i < 4; i++) summonOTS();
    clearBoardKeepHistory();
    expect(countNamedEnters(state, "first", OTS)).toBe(4);

    state.players.first.hand.push(createCard(SEPHIE_ID, "hand", "first"));
    whenPlayCard("first", getHand(state, "first").length - 1);

    const summoned = getBoard(state, "first").filter((c) => c?.name === OTS);
    expect(summoned.length).toBe(2);
    expect(isBuffed(summoned[0]!)).toBe(false);
    expect(isBuffed(summoned[1]!)).toBe(true);
  });
});

describe("Drache & Aluzard — named_enter_count Fanfare route (regression pin)", () => {
  beforeEach(() => {
    resetUidCounter();
    setupBase(R8);
  });

  function handDrache(): void {
    state.players.first.hand.push(createCard(DRACHE_ID, "hand", "first"));
  }

  it("play#1 priorEnters=0 → 4/4; play#2 priorEnters=1 → 5/5; play#3 priorEnters=2 → 8/8", () => {
    handDrache();
    const first = playDracheFromHand();
    expect(
      countNamedEnters(state, "first", "Drache & Aluzard, Burning Blood"),
    ).toBe(1);
    expect(Number(first.attack)).toBe(4);
    expect(Number(first.defense)).toBe(4);

    clearBoardKeepHistory();
    expect(
      countNamedEnters(state, "first", "Drache & Aluzard, Burning Blood"),
    ).toBe(1);

    handDrache();
    const second = playDracheFromHand();
    expect(
      countNamedEnters(state, "first", "Drache & Aluzard, Burning Blood"),
    ).toBe(2);
    expect(Number(second.attack)).toBe(5);
    expect(Number(second.defense)).toBe(5);

    clearBoardKeepHistory();
    handDrache();
    const third = playDracheFromHand();
    expect(
      countNamedEnters(state, "first", "Drache & Aluzard, Burning Blood"),
    ).toBe(3);
    expect(Number(third.attack)).toBe(8);
    expect(Number(third.defense)).toBe(8);
  });
});
