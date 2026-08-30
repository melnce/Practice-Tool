// @vitest-environment node
/**
 * Consistency trainer — analytic hypergeometric check + Monte Carlo convergence.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { getGlobalCardIndex } from "../../src/data/cardIndex.js";
import {
  combinations,
  pAtLeastOneInOpening,
  runConsistency,
  keepAllPolicy,
  keepListPolicy,
  resolveDeckToSimCards,
  OPENING_HAND_SIZE,
  DECK_SIZE,
  dealDrillHand,
  revealDrillPaths,
} from "../../src/consistency/index.js";
import type { SimCard } from "../../src/consistency/index.js";
import fs from "node:fs";
import path from "node:path";

beforeAll(async () => {
  await initCardDatabaseNode();
});

function syntheticDeck(
  copiesOfTarget: number,
  targetKey = "Target",
): SimCard[] {
  const cards: SimCard[] = [];
  for (let i = 0; i < copiesOfTarget; i++) {
    cards.push({ key: targetKey, name: targetKey, cost: 1 });
  }
  for (let i = cards.length; i < DECK_SIZE; i++) {
    cards.push({ key: `Filler${i}`, name: `Filler${i}`, cost: 2 });
  }
  return cards;
}

describe("hypergeometric closed form", () => {
  it("matches hand-computed P(at least one of 3 in opening 4 of 40)", () => {
    // C(40,4) = 91390, C(37,4) = 66045
    // P(none) = 66045/91390, P(at least one) = 1 - that
    const c40_4 = combinations(40, 4);
    const c37_4 = combinations(37, 4);
    expect(c40_4).toBeCloseTo(91390, 6);
    expect(c37_4).toBeCloseTo(66045, 6);
    const expected = 1 - c37_4 / c40_4;
    expect(pAtLeastOneInOpening(3, 40, 4)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(0.2773279374, 8);
  });
});

describe("Monte Carlo converges to hypergeometric", () => {
  it("P(at least one of 3 copies in opening 4) with keep-all ≈ closed form", () => {
    const deck = syntheticDeck(3, "Target");
    const expected = pAtLeastOneInOpening(3, DECK_SIZE, OPENING_HAND_SIZE);

    const result = runConsistency(
      deck,
      { kind: "cards", keys: ["Target"], atLeast: 1 },
      {
        seat: "play",
        mulligan: keepAllPolicy(),
        turnHorizon: 1,
        iterations: 100_000,
        seed: 42,
      },
    );

    // Opening probability (before turn-1 draw) is the hypergeometric quantity.
    expect(result.probabilityOpening).toBeCloseTo(expected, 2);
    // Absolute tolerance ~0.005 at 100k (far tighter than 2 decimal places usually).
    expect(Math.abs(result.probabilityOpening - expected)).toBeLessThan(0.005);

    // Persist measured runtime for the PR protocol.
    const report = [
      "consistency trainer — 100k Monte Carlo timing",
      `seed=${result.seed}`,
      `iterations=${result.iterations}`,
      `elapsedMs=${result.elapsedMs.toFixed(2)}`,
      `P(opening at least one Target)=${result.probabilityOpening.toFixed(6)}`,
      `analytic=${expected.toFixed(6)}`,
      `absError=${Math.abs(result.probabilityOpening - expected).toFixed(6)}`,
    ].join("\n");
    fs.mkdirSync(path.resolve("reports"), { recursive: true });
    fs.writeFileSync(
      path.resolve("reports/consistency-100k-timing.txt"),
      report + "\n",
      "utf8",
    );
  });

  it("is reproducible for the same seed", () => {
    const deck = syntheticDeck(3, "Target");
    const cfg = {
      seat: "play" as const,
      mulligan: keepAllPolicy(),
      turnHorizon: 5,
      iterations: 5_000,
      seed: 99,
    };
    const a = runConsistency(
      deck,
      { kind: "cards", keys: ["Target"], atLeast: 1 },
      cfg,
    );
    const b = runConsistency(
      deck,
      { kind: "cards", keys: ["Target"], atLeast: 1 },
      cfg,
    );
    expect(a.probabilityByTurn).toEqual(b.probabilityByTurn);
    expect(a.probabilityOpening).toBe(b.probabilityOpening);
  });

  it("keep_list mulligan raises hit rate vs keep_all for a sparse target", () => {
    const deck = syntheticDeck(3, "Target");
    const cond = { kind: "cards" as const, keys: ["Target"], atLeast: 1 };
    const keepAll = runConsistency(deck, cond, {
      seat: "play",
      mulligan: keepAllPolicy(),
      turnHorizon: 1,
      iterations: 40_000,
      seed: 7,
    });
    const keepList = runConsistency(deck, cond, {
      seat: "play",
      mulligan: keepListPolicy(["Target"]),
      turnHorizon: 1,
      iterations: 40_000,
      seed: 7,
    });
    // Mulliganing non-targets should not lower opening hit rate.
    expect(keepList.probabilityOpening).toBeGreaterThanOrEqual(
      keepAll.probabilityOpening - 0.002,
    );
  });
});

describe("condition combinators", () => {
  it("supports cost AND cost queries", () => {
    const deck: SimCard[] = [];
    for (let i = 0; i < 10; i++)
      deck.push({ key: `Two${i}`, name: `Two${i}`, cost: 2 });
    for (let i = 0; i < 10; i++)
      deck.push({ key: `Three${i}`, name: `Three${i}`, cost: 3 });
    for (let i = deck.length; i < DECK_SIZE; i++)
      deck.push({ key: `X${i}`, name: `X${i}`, cost: 5 });

    const result = runConsistency(
      deck,
      {
        kind: "and",
        of: [
          { kind: "costs", costs: [2], atLeast: 1 },
          { kind: "costs", costs: [3], atLeast: 1 },
        ],
      },
      {
        seat: "draw",
        mulligan: keepAllPolicy(),
        turnHorizon: 3,
        iterations: 20_000,
        seed: 123,
      },
    );
    expect(result.probabilityByTurn[3]!).toBeGreaterThan(0.5);
    expect(result.probabilityByTurn[3]!).toBeLessThan(1);
  });
});

describe("deck resolve + drill", () => {
  it("resolves a catalog deck via the existing loader/validator", () => {
    const index = getGlobalCardIndex();
    expect(index).not.toBeNull();
    const raw = JSON.parse(
      fs.readFileSync(
        path.resolve("decks/runecraft_sephie_test_subject.json"),
        "utf8",
      ),
    );
    const resolved = resolveDeckToSimCards(
      raw,
      index!,
      "runecraft_sephie_test_subject.json",
    );
    expect(resolved.cards.length).toBe(DECK_SIZE);
    expect(resolved.className).toBe("Runecraft");
  });

  it("drill reveals your path and keep-all alternative", () => {
    const deck = syntheticDeck(3, "Target");
    const deal = dealDrillHand(deck, 555);
    expect(deal.opening).toHaveLength(OPENING_HAND_SIZE);
    // Keep first two only
    const reveal = revealDrillPaths(deal, [0, 1], 5);
    expect(reveal.yourPath.hand).toHaveLength(OPENING_HAND_SIZE);
    expect(reveal.yourPath.draws.length).toBe(5);
    expect(reveal.keepAllPath.hand).toEqual(deal.opening);
    expect(reveal.keepAllPath.draws).toHaveLength(5);
  });
});
