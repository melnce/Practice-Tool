/**
 * Official Q&A: "If you selected one, destroy it and …" runs on selection,
 * not on whether the destroy succeeded (Supplicant of Destruction 10372110).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import "../../src/logic/core/effects/index.js";

const SUPPLICANT = "10372110";
const LISHENNA = "10374120";
const WASTELAND = "10372210";
const FILLER = "10131310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
  } = {},
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

function enemyFollower(def = 5, name = "Foe") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("destroy + then — runs on selection", () => {
  beforeEach(() => resetUidCounter());

  it("Supplicant selecting Lishenna: Lishenna survives, random enemy takes 2", () => {
    setupTurn(6, { hand: [SUPPLICANT], pp: 2 });
    const lishenna = createCard(LISHENNA, "board", "first");
    lishenna.peak_defense = lishenna.defense;
    applyKeywordsFromList(lishenna);
    state.players.first.board.push(lishenna);
    const foe = enemyFollower(5);
    whenPlayCard("first", 0);
    resolvePendingTarget(lishenna.uid);
    cleanupDead();
    expect(findOnBoard("first", "Lishenna, Melody Manifest")).toBeTruthy();
    expect(Number(foe.defense)).toBe(3);
  });

  it("Supplicant selecting plain ally: destroyed and 2 damage", () => {
    setupTurn(6, { hand: [SUPPLICANT], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    ally.peak_defense = 1;
    state.players.first.board.push(ally);
    const foe = enemyFollower(5);
    whenPlayCard("first", 0);
    resolvePendingTarget(ally.uid);
    cleanupDead();
    expect(findOnBoard("first", "Ally")).toBeFalsy();
    expect(Number(foe.defense)).toBe(3);
  });

  it("Supplicant with nothing to select: no damage", () => {
    setupTurn(6, { hand: [SUPPLICANT], pp: 2 });
    enemyFollower(5);
    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(Number(state.players.second.board[0]!.defense)).toBe(5);
  });

  it("Wasteland selecting Lishenna: draws 2 even when destroy is prevented", () => {
    setupTurn(6, {
      hand: [WASTELAND],
      pp: 2,
      deck: [FILLER, FILLER, FILLER],
    });
    const lishenna = createCard(LISHENNA, "board", "first");
    lishenna.peak_defense = lishenna.defense;
    applyKeywordsFromList(lishenna);
    state.players.first.board.push(lishenna);
    whenPlayCard("first", 0);
    resolvePendingTarget(lishenna.uid);
    cleanupDead();
    expect(findOnBoard("first", "Lishenna, Melody Manifest")).toBeTruthy();
    expect(thenHand("first").length).toBe(2);
  });
});

describe("destroy + then — sabotage proof", () => {
  it("would skip random damage if then required a successful destroy", () => {
    setupTurn(6, { hand: [SUPPLICANT], pp: 2 });
    const lishenna = createCard(LISHENNA, "board", "first");
    lishenna.peak_defense = lishenna.defense;
    applyKeywordsFromList(lishenna);
    state.players.first.board.push(lishenna);
    const foe = enemyFollower(5);
    whenPlayCard("first", 0);
    resolvePendingTarget(lishenna.uid);
    cleanupDead();
    // Sabotage: old engine gated then on destroyed > 0 — Lishenna would leave foe at 5.
    expect(Number(foe.defense)).toBe(3);
  });
});
