/**
 * Pool vocabulary unification (BE1–BE5) — red-first regressions for this PR.
 *
 * Red on origin/main before BE1/BE5:
 * - `class` was omitted from applyFilters whitelist → ignored on destroy/select pools
 * - `cost_*` keys did not exist in the evaluator
 * - preflight ignored `filters` (plural) on select ops; canonical `filter` applies at pool-build
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { handleDestroy } from "../../src/logic/effects/ops/destroy/unified.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  assertKnownCardConditionKeys,
  evaluateCardCondition,
} from "../../src/logic/core/conditions/evaluator.js";
import "../../src/logic/core/effects/index.js";

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

describe("pool vocabulary — class on non-stat op (BE1)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 }).build();
    state.gameStarted = true;
  });

  it("destroy pool with filter.class keeps only matching followers", () => {
    const sword = createCard(
      {
        name: "Sword Follower",
        type: "Follower",
        class: "Swordcraft",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "board",
      "first",
    );
    const forest = createCard(
      {
        name: "Forest Follower",
        type: "Follower",
        class: "Forestcraft",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      "board",
      "first",
    );
    state.players.first.board = [sword, forest];

    const caster = createCard(
      { name: "Caster", type: "Follower", class: "Neutral", cost: 1 },
      "hand",
      "first",
    );

    handleDestroy(
      {
        op: "destroy",
        target: "ally:follower",
        filter: { class: "Swordcraft" },
        select: 1,
      } as any,
      "first",
      [],
      { owner: "first", sourceCard: caster },
    );

    expect(state.pendingTargetEffect?.pool?.map((c) => c.name)).toEqual([
      "Sword Follower",
    ]);
    resolvePendingTarget(sword.uid);
  });

  it("getPool with condition.class narrows mixed-class enemy board", () => {
    const swordEnemy = createCard(
      {
        name: "Sword Enemy",
        type: "Follower",
        class: "Swordcraft",
        defense: 2,
      },
      "board",
      "second",
    );
    const havenEnemy = createCard(
      {
        name: "Haven Enemy",
        type: "Follower",
        class: "Havencraft",
        defense: 2,
      },
      "board",
      "second",
    );
    state.players.second.board = [swordEnemy, havenEnemy];

    const pool = getPool("enemy:follower", "first", null, {
      class: "Swordcraft",
    });
    expect(pool.map((c) => c.name)).toEqual(["Sword Enemy"]);
  });
});

describe("pool vocabulary — unknown-key diagnostic (BE1)", () => {
  it("throws under NODE_ENV=test with key and nearest-match hint", () => {
    expect(() =>
      assertKnownCardConditionKeys({ classs: "Swordcraft" }, "testHarness"),
    ).toThrow(
      'Unknown card condition key "classs" in testHarness (try "class")',
    );
  });
});

describe("pool vocabulary — cost_* vs base_cost_* (BE5)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 }).build();
    state.gameStarted = true;
  });

  it("cost_lte matches reduced play cost; base_cost_lte uses printed cost", () => {
    const reduced = createCard(
      {
        name: "Discounted",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
      },
      "board",
      "first",
    );
    (reduced as any).base_cost = 5;
    const fullPrice = createCard(
      {
        name: "FullPrice",
        type: "Follower",
        cost: 4,
        attack: 1,
        defense: 1,
      },
      "board",
      "first",
    );
    (fullPrice as any).base_cost = 4;

    expect(evaluateCardCondition(reduced, { cost_lte: 3 })).toBe(true);
    expect(evaluateCardCondition(reduced, { base_cost_lte: 3 })).toBe(false);
    expect(evaluateCardCondition(fullPrice, { cost_lte: 3 })).toBe(false);

    state.players.first.board = [reduced, fullPrice];
    const byCurrent = getPool("ally:follower", "first", null, {
      cost_lte: 3,
    });
    const byPrinted = getPool("ally:follower", "first", null, {
      base_cost_lte: 3,
    });
    expect(byCurrent.map((c) => c.name)).toEqual(["Discounted"]);
    expect(byPrinted).toEqual([]);
  });
});

describe("pool vocabulary — Lingering Threat ≤3 at selection time", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10862310 — 6-defense enemy is not a legal select target", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10862310"])
      .withFirstPP(2, 6)
      .build();

    const fragile = createCard(
      { name: "Fragile", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "second",
    );
    fragile.peak_defense = 3;
    const tank = createCard(
      { name: "Tank", type: "Follower", cost: 2, attack: 4, defense: 6 },
      "board",
      "second",
    );
    tank.peak_defense = 6;
    state.players.second.board = [fragile, tank];

    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(fragile.uid));
    expect(poolUids()).not.toContain(String(tank.uid));
    resolvePendingTarget(fragile.uid);
  });
});
