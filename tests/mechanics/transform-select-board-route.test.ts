/**
 * Board-route transform with select must open a target prompt (owner ruling 2026-09-08).
 * Regression: transform.ts board branch auto-picked first pool member instead of prompting.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import "../../src/logic/core/effects/index.js";

const SEED = 3;
const DRACONIC_BERSERKER = "10042110";
const PHILDAU = "10103110";
const TITANIA = "10214110";
const ARA = "10534120";
const SINCERITY = "10573310";

function poolUids(): string[] {
  return state.pendingTargetEffect?.poolUids ?? [];
}

function poolNames(): string[] {
  const uids = poolUids();
  const all = [...getBoard(state, "first"), ...getBoard(state, "second")];
  return uids.map((uid) => all.find((c) => c.uid === uid)?.name ?? uid);
}

function allyFollower(name: string, atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  c.justPlayed = false;
  getBoard(state, "first").push(c);
  return c;
}

function enemyFollower(name: string, atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  c.justPlayed = false;
  getBoard(state, "second").push(c);
  return c;
}

function setupBase() {
  resetUidCounter();
  givenGameState({ seed: SEED, activePlayer: "first", roundCount: 10 })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .withFirstEvo(2)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
  state.players.first.evoUsedThisTurn = false;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("transform select on board route", () => {
  beforeEach(() => {
    setupBase();
  });

  it("10214110 Titania evolve: opens prompt for enemy followers, transforms chosen target", () => {
    const enemyA = enemyFollower("EnemyA");
    const enemyB = enemyFollower("EnemyB");
    allyFollower("AllyA");
    allyFollower("AllyB");

    const titania = createCard(TITANIA, "board", "first");
    titania.peak_defense = titania.defense;
    titania.justPlayed = false;
    getBoard(state, "first").unshift(titania);

    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: titania.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames().sort()).toEqual(["EnemyA", "EnemyB"]);
    expect(enemyA.name).toBe("EnemyA");
    expect(enemyB.name).toBe("EnemyB");

    resolvePendingTarget(enemyB.uid);

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(
      getBoard(state, "second").find((c) => c.uid === enemyA.uid)?.name,
    ).toBe("EnemyA");
    expect(
      getBoard(state, "second").find((c) => c.uid === enemyB.uid)?.name,
    ).toBe("Fairy");
  }, 60_000);

  it("10534120 Ara evolve: opens prompt for any follower, transforms chosen ally", () => {
    enemyFollower("EnemyA");
    enemyFollower("EnemyB");
    const allyA = allyFollower("AllyA");
    allyFollower("AllyB");

    const ara = createCard(ARA, "board", "first");
    ara.peak_defense = ara.defense;
    ara.justPlayed = false;
    getBoard(state, "first").unshift(ara);

    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: ara.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    const pool = poolNames();
    expect(pool).toContain("AllyA");
    expect(pool).toContain("AllyB");
    expect(pool).toContain("EnemyA");
    expect(pool).toContain("EnemyB");
    expect(allyA.name).toBe("AllyA");

    resolvePendingTarget(allyA.uid);

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(
      getBoard(state, "first").find((c) => c.uid === allyA.uid)?.name,
    ).toBe("Regal Falcon");
  }, 60_000);

  it("10573310 Sincerity spell: opens prompt for any card, transforms chosen ally", () => {
    enemyFollower("EnemyA");
    enemyFollower("EnemyB");
    const allyA = allyFollower("AllyA");
    allyFollower("AllyB");

    const hand = state.players.first.hand;
    hand.push(createCard(SINCERITY, "hand", "first"));
    whenPlayCard("first", hand.length - 1);

    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames()).toContain("AllyA");
    expect(allyA.name).toBe("AllyA");

    resolvePendingTarget(allyA.uid);

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(
      getBoard(state, "first").find((c) => c.uid === allyA.uid)?.name,
    ).toBe("Imari's Little Buddies");
  }, 60_000);

  it("negative control: damage evolve still prompts with one enemy (sibling op parity)", () => {
    const onlyEnemy = enemyFollower("OnlyEnemy");
    allyFollower("AllyA");

    const berserker = createCard(DRACONIC_BERSERKER, "board", "first");
    berserker.peak_defense = berserker.defense;
    berserker.justPlayed = false;
    getBoard(state, "first").unshift(berserker);

    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: berserker.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames()).toEqual(["OnlyEnemy"]);
    expect(Number(onlyEnemy.defense)).toBe(2);
    resolvePendingTarget(onlyEnemy.uid);
    expect(Number(onlyEnemy.defense)).toBeLessThan(2);
  }, 60_000);

  it("negative control: transform evolve prompts with one enemy (matches sibling ops)", () => {
    const onlyEnemy = enemyFollower("OnlyEnemy");
    allyFollower("AllyA");

    const titania = createCard(TITANIA, "board", "first");
    titania.peak_defense = titania.defense;
    titania.justPlayed = false;
    getBoard(state, "first").unshift(titania);

    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: titania.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames()).toEqual(["OnlyEnemy"]);
    expect(onlyEnemy.name).toBe("OnlyEnemy");
    resolvePendingTarget(onlyEnemy.uid);
    expect(
      getBoard(state, "second").find((c) => c.uid === onlyEnemy.uid)?.name,
    ).toBe("Fairy");
  }, 60_000);

  it("controls: damage and destroy evolve prompt with two enemies", () => {
    setupBase();
    enemyFollower("EnemyA");
    enemyFollower("EnemyB");
    allyFollower("AllyA");
    allyFollower("AllyB");

    const berserker = createCard(DRACONIC_BERSERKER, "board", "first");
    berserker.peak_defense = berserker.defense;
    berserker.justPlayed = false;
    getBoard(state, "first").unshift(berserker);
    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: berserker.uid,
    });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames().sort()).toEqual(["EnemyA", "EnemyB"]);
    resolvePendingTarget(getBoard(state, "second")[0]!.uid);

    setupBase();
    enemyFollower("EnemyA");
    enemyFollower("EnemyB");
    allyFollower("AllyA");
    allyFollower("AllyB");

    const phildau = createCard(PHILDAU, "board", "first");
    phildau.peak_defense = phildau.defense;
    phildau.justPlayed = false;
    getBoard(state, "first").unshift(phildau);
    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: phildau.uid,
    });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(poolNames().sort()).toEqual(["EnemyA", "EnemyB"]);
    resolvePendingTarget(getBoard(state, "second")[0]!.uid);
  }, 60_000);
});
