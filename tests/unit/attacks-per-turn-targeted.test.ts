/**
 * Targeted attacks_per_turn — Send 'Em Packing (90034350) and pending-target guard.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import "../../src/logic/core/effects/index.js";

const SEND_EM_PACKING = "90034350";
const TETRA = "10834110";
const FILLER = "10111310";
const R6 = 6;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    firstBoard?: Array<Record<string, unknown>>;
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
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard);
  b.withSecondDeck(Array(10).fill(FILLER)).build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function allyFollower(
  name: string,
  atk: number,
  def: number,
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  c.can_attack = true;
  c.justPlayed = false;
  c.attacks_left = 1;
  c.attacks_per_turn = 1;
  getBoard(state, "first").push(c);
  return c;
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  getBoard(state, "second").push(c);
  return c;
}

function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

describe("attacks_per_turn targeted handler — Send 'Em Packing", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("select one of two allied followers → attacks_per_turn 2; bystander stays 1", () => {
    setupTurn(R6, { hand: [SEND_EM_PACKING], pp: 1 });
    const alpha = allyFollower("Alpha", 2, 5);
    const beta = allyFollower("Beta", 2, 5);

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect?.eff?.op).toBe("attacks_per_turn");
    resolvePendingTarget(alpha.uid);
    expect(state.pendingTargetEffect).toBeUndefined();

    const alphaAfter = findOnBoard("first", "Alpha")!;
    const betaAfter = findOnBoard("first", "Beta")!;
    expect(alphaAfter.attacks_per_turn).toBe(2);
    expect(betaAfter.attacks_per_turn).toBe(1);
  });

  it("selected follower can attack twice; third attack does not deal damage", () => {
    setupTurn(R6, { hand: [SEND_EM_PACKING], pp: 1 });
    const striker = allyFollower("Striker", 3, 5);
    enemyFollower(0, 20, "Wall");

    whenPlayCard("first", 0);
    resolvePendingTarget(striker.uid);

    const boardIdx = getBoard(state, "first").findIndex(
      (c) => c.uid === striker.uid,
    );
    const foeIdx = 0;
    const foeBefore = Number(getBoard(state, "second")[0]!.defense);

    attackFollower(boardIdx, foeIdx, "first", "second");
    const afterFirst = Number(getBoard(state, "second")[0]!.defense);
    expect(afterFirst).toBe(foeBefore - 3);
    expect(findOnBoard("first", "Striker")!.attacks_left).toBe(1);

    attackFollower(boardIdx, foeIdx, "first", "second");
    const afterSecond = Number(getBoard(state, "second")[0]!.defense);
    expect(afterSecond).toBe(afterFirst - 3);
    expect(findOnBoard("first", "Striker")!.attacks_left).toBe(0);

    attackFollower(boardIdx, foeIdx, "first", "second");
    expect(Number(getBoard(state, "second")[0]!.defense)).toBe(afterSecond);
  });

  it("with no allied follower: preflight blocks play (mandatory select)", () => {
    setupTurn(R6, { hand: [SEND_EM_PACKING], pp: 1 });
    const spell = thenHand("first")[0]!;
    const preflight = canPlayCard(spell, "first");
    expect(preflight.ok).toBe(false);
    expect(preflight.reason).toMatch(/target/i);
  });
});

describe("Tetra & Ladica — Send 'Em Packing end-to-end", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("X >= 20: token in hand → play → select ally → attacks_per_turn 2", () => {
    setupTurn(R10, { hand: [TETRA], pp: 7 });
    const ally = allyFollower("Ally", 2, 5);
    const tetra = thenHand("first").find((c) => c.id === TETRA)!;
    boostCard(tetra, 20);
    whenPlayCard(
      "first",
      thenHand("first").findIndex((c) => c.id === TETRA),
    );

    const packingIdx = thenHand("first").findIndex(
      (c) => c.id === SEND_EM_PACKING,
    );
    expect(packingIdx).toBeGreaterThanOrEqual(0);

    whenPlayCard("first", packingIdx);
    resolvePendingTarget(ally.uid);

    expect(findOnBoard("first", "Ally")!.attacks_per_turn).toBe(2);
    expect(state.pendingTargetEffect).toBeUndefined();
  });
});

describe("setPendingTarget guard — unregistered targeted op", () => {
  beforeEach(() => {
    resetUidCounter();
    state.pendingTargetEffect = undefined;
  });

  it("throws in test env when opening a prompt for an unregistered op", () => {
    const pool = [
      createCard(
        { name: "Dummy", type: "Follower", cost: 1, attack: 1, defense: 1 },
        "board",
        "first",
      ),
    ];
    expect(() =>
      setPendingTarget({
        eff: { op: "__unregistered_test_op__" },
        owner: "first",
        sourceCard: null,
        pool,
        selectCount: 1,
      }),
    ).toThrow(/No targeted handler for op "__unregistered_test_op__"/);
  });
});
