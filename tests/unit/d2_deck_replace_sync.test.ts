/**
 * D2: deck replace from_set must not consume RNG after an await/fetch.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { handleDeck } from "../../src/logic/effects/deck.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { getSetCards } from "../../src/data/cardSets.js";

const SET = "10003_heirs-of-the-omen";
const SEED = 7777;

describe("D2: replaceDeckFromSet is synchronous / preloaded", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  beforeEach(() => {
    resetGameState(SEED);
    state.players.first.deck = [
      { name: "Filler", uid: "pre", type: "Follower" } as any,
    ];
  });

  it("set JSON is preloaded at card-DB init", () => {
    const cards = getSetCards(SET);
    expect(cards).toBeTruthy();
    expect(cards!.length).toBeGreaterThan(10);
  });

  it("replace from_set completes synchronously (no pending microtask RNG)", () => {
    const before = state.rng.snapshot();
    handleDeck(
      {
        op: "deck",
        action: "replace",
        from_set: SET,
        exclude: ["Mjerrabaine, Great Manifest"],
      },
      "first",
      {},
    );
    const after = state.rng.snapshot();

    expect(state.players.first.deck.length).toBeGreaterThan(0);
    expect(
      state.players.first.deck.every(
        (c) => c.name !== "Mjerrabaine, Great Manifest",
      ),
    ).toBe(true);
    // UID + shuffle consumed RNG/uids immediately — cursor advanced in this turn
    expect(after.uidCounter).toBeGreaterThan(before.uidCounter);
    expect(after.cursor).toBeGreaterThan(before.cursor);
  });

  it("same seed + same replace yields identical deck order even if later async work runs", async () => {
    handleDeck(
      {
        op: "deck",
        action: "replace",
        from_set: SET,
        exclude: ["Mjerrabaine, Great Manifest"],
      },
      "first",
      {},
    );
    const snap1 = {
      hash: hashGameState(state),
      top: state.players.first.deck.slice(0, 5).map((c) => ({
        name: c.name,
        uid: c.uid,
      })),
      rng: state.rng.snapshot(),
    };

    // Intervening async delay + RNG (would have raced the old void fetch path)
    await new Promise((r) => setTimeout(r, 20));
    state.rng.nextFloat();

    resetGameState(SEED);
    state.players.first.deck = [
      { name: "Filler", uid: "pre", type: "Follower" } as any,
    ];
    handleDeck(
      {
        op: "deck",
        action: "replace",
        from_set: SET,
        exclude: ["Mjerrabaine, Great Manifest"],
      },
      "first",
      {},
    );
    const snap2 = {
      hash: hashGameState(state),
      top: state.players.first.deck.slice(0, 5).map((c) => ({
        name: c.name,
        uid: c.uid,
      })),
      rng: state.rng.snapshot(),
    };

    expect(snap2.hash).toBe(snap1.hash);
    expect(snap2.top).toEqual(snap1.top);
    expect(snap2.rng).toEqual(snap1.rng);
  });
});
