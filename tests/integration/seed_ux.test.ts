/**
 * Seed normalisation + state.seed vs rng.seed contract.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  normalizeSeed,
  parseSeedInput,
  createRng,
} from "../../src/core/rng.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { startGame } from "../../src/logic/startGame.js";
import { confirmMulligan } from "../../src/logic/mulligan.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { readShareParams, formatShareQuery } from "../../src/boot/shareUrl.js";

describe("normalizeSeed", () => {
  it("keeps finite numbers as-is (literal, not >>> 0)", () => {
    expect(normalizeSeed(12345)).toBe(12345);
    const big = 1786012345678;
    expect(normalizeSeed(big)).toBe(big);
    expect(normalizeSeed(big)).not.toBe(big >>> 0);
  });

  it("turns digit-only strings into numbers", () => {
    expect(normalizeSeed("12345")).toBe(12345);
    expect(normalizeSeed(" 42 ")).toBe(42);
    expect(normalizeSeed("1786012345678")).toBe(1786012345678);
  });

  it("keeps non-digit strings as strings", () => {
    expect(normalizeSeed("abc")).toBe("abc");
    expect(normalizeSeed("12ab")).toBe("12ab");
  });

  it("rejects empty / non-finite", () => {
    expect(() => normalizeSeed("")).toThrow();
    expect(() => normalizeSeed("   ")).toThrow();
    expect(() => normalizeSeed(Number.NaN)).toThrow();
  });

  it("parseSeedInput returns null for empty", () => {
    expect(parseSeedInput("")).toBeNull();
    expect(parseSeedInput("  ")).toBeNull();
    expect(parseSeedInput("99")).toBe(99);
  });
});

describe("createRng digit-string polymorphism", () => {
  it('createRng("12345") matches createRng(12345)', () => {
    const a = createRng(12345);
    const b = createRng("12345");
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(12345);
    for (let i = 0; i < 20; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it("large literal truncates only on rng.seed", () => {
    const literal = 1786012345678;
    const rng = createRng(literal);
    expect(rng.seed).toBe(literal >>> 0);
    expect(rng.seed).toBe(3600917838);
  });
});

describe("state.seed survives reset", () => {
  it("stores the literal, not the truncated rng seed", () => {
    const literal = 1786012345678;
    resetGameState(literal);
    expect(state.seed).toBe(literal);
    expect(state.rng.seed).toBe(literal >>> 0);
    expect(state.seed).not.toBe(state.rng.seed);
  });

  it("string and number normalise to the same state.seed", () => {
    resetGameState("99991");
    expect(state.seed).toBe(99991);
    const rngA = state.rng.seed;
    resetGameState(99991);
    expect(state.seed).toBe(99991);
    expect(state.rng.seed).toBe(rngA);
  });

  it("unknown root keys still scrub; seed is known and kept", () => {
    resetGameState(7);
    (state as any).adHocLeak = true;
    resetGameState(8);
    expect((state as any).adHocLeak).toBeUndefined();
    expect(state.seed).toBe(8);
  });
});

describe("startGame seed normalisation + determinism", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  async function openWith(seed: number | string) {
    await startGame({
      deckAId: "starter_deck",
      deckBId: "starter_deck",
      seed,
    });
    if (state.phase === "mulligan") {
      confirmMulligan("first");
      if (state.phase === "mulligan") confirmMulligan("second");
    }
    return {
      hash: hashGameState(state),
      seed: state.seed,
      rngSeed: state.rng.seed,
      blueHand: state.players.first.hand.map((c) => c.uid),
      redHand: state.players.second.hand.map((c) => c.uid),
      blueDeckTop: state.players.first.deck.slice(0, 5).map((c) => c.uid),
    };
  }

  it("same seed + same decks → identical state hash through opening", async () => {
    const a = await openWith(424242);
    const b = await openWith(424242);
    expect(b).toEqual(a);
  });

  it('string "424242" and number 424242 produce the same game', async () => {
    const asNum = await openWith(424242);
    const asStr = await openWith("424242");
    expect(asStr.hash).toBe(asNum.hash);
    expect(asStr.seed).toBe(424242);
    expect(asNum.seed).toBe(424242);
    expect(asStr.blueHand).toEqual(asNum.blueHand);
    expect(asStr.redHand).toEqual(asNum.redHand);
  });

  it("displayed/literal seed is what the user typed, not >>> 0", async () => {
    const typed = 1786012345678;
    const opened = await openWith(typed);
    expect(opened.seed).toBe(typed);
    expect(opened.rngSeed).toBe(typed >>> 0);
    expect(opened.seed).not.toBe(opened.rngSeed);
  });
});

describe("share URL ?seed=&a=&b=", () => {
  it("formatShareQuery includes seed and both deck ids", () => {
    const q = formatShareQuery({
      seed: 1786012345678,
      deckAId: "starter_deck",
      deckBId: "aggro_forest",
    });
    expect(q).toContain("seed=1786012345678");
    expect(q).toContain("a=starter_deck");
    expect(q).toContain("b=aggro_forest");
  });

  it("readShareParams round-trips the literal seed (not truncated)", () => {
    const q = formatShareQuery({
      seed: 1786012345678,
      deckAId: "starter_deck",
      deckBId: "starter_deck",
    });
    const parsed = readShareParams(q);
    expect(parsed.seed).toBe(1786012345678);
    expect(parsed.deckAId).toBe("starter_deck");
    expect(parsed.deckBId).toBe("starter_deck");
  });

  it("digit string in URL normalises like a number", () => {
    const parsed = readShareParams("?seed=12345&a=x&b=y");
    expect(parsed.seed).toBe(12345);
  });
});
