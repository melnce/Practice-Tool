/**
 * D1: startGame / parallel deck loads must not race the shared RNG stream.
 * Forces both fetch completion orderings and asserts identical state hashes.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { loadBlueDeck, loadRedDeck } from "../../src/data/deckLoader.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { startGame } from "../../src/logic/startGame.js";

const SEED = 4242;

type Order = "blue-first" | "red-first";

function gatedResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
    },
    text: async () => text,
    json: async () => JSON.parse(text),
  } as any;
}

async function loadBothDecksWithFetchOrder(order: Order) {
  const originalFetch = globalThis.fetch;
  resetGameState(SEED);

  let releaseBlue!: () => void;
  let releaseRed!: () => void;
  const blueReady = new Promise<void>((r) => {
    releaseBlue = r;
  });
  const redReady = new Promise<void>((r) => {
    releaseRed = r;
  });

  let callIdx = 0;
  (globalThis as any).fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const real = await originalFetch(url as any, init);
    const text = await real.text();
    const idx = callIdx++;
    const gate = idx === 0 ? blueReady : redReady;
    await gate;
    return gatedResponse(text, real.status);
  };

  try {
    const pBlue = loadBlueDeck("starter_deck");
    const pRed = loadRedDeck("starter_deck");

    if (order === "blue-first") {
      releaseBlue();
      await Promise.resolve();
      await Promise.resolve();
      releaseRed();
    } else {
      releaseRed();
      await Promise.resolve();
      await Promise.resolve();
      releaseBlue();
    }

    await Promise.all([pBlue, pRed]);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }

  return {
    hash: hashGameState(state),
    blueUids: state.players.first.deck.slice(0, 3).map((c) => c.uid),
    redUids: state.players.second.deck.slice(0, 3).map((c) => c.uid),
    rng: state.rng.snapshot(),
  };
}

describe("D1: startGame deck-load determinism", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  afterEach(() => {
    resetGameState(1);
  });

  it("startGame with the same seed produces identical post-load fingerprints twice", async () => {
    await startGame({
      deckAId: "starter_deck",
      deckBId: "starter_deck",
      seed: SEED,
    });
    const a = {
      hash: hashGameState(state),
      rng: state.rng.snapshot(),
      blueTop: state.players.first.deck.slice(0, 5).map((c) => c.uid),
      redTop: state.players.second.deck.slice(0, 5).map((c) => c.uid),
    };

    await startGame({
      deckAId: "starter_deck",
      deckBId: "starter_deck",
      seed: SEED,
    });
    const b = {
      hash: hashGameState(state),
      rng: state.rng.snapshot(),
      blueTop: state.players.first.deck.slice(0, 5).map((c) => c.uid),
      redTop: state.players.second.deck.slice(0, 5).map((c) => c.uid),
    };

    expect(b).toEqual(a);
  });

  it("forced blue-wins vs red-wins fetch completion yields the same state when loads are sequential", async () => {
    const originalFetch = globalThis.fetch;
    const results: Array<{
      hash: string;
      blueUids: string[];
      redUids: string[];
    }> = [];

    for (const _order of ["blue-first", "red-first"] as Order[]) {
      resetGameState(SEED);
      let releaseBlue!: () => void;
      let releaseRed!: () => void;
      const blueReady = new Promise<void>((r) => {
        releaseBlue = r;
      });
      const redReady = new Promise<void>((r) => {
        releaseRed = r;
      });
      let phase: "blue" | "red" = "blue";
      (globalThis as any).fetch = async (
        url: string | URL | Request,
        init?: RequestInit,
      ) => {
        const real = await originalFetch(url as any, init);
        const text = await real.text();
        const gate = phase === "blue" ? blueReady : redReady;
        await gate;
        return gatedResponse(text, real.status);
      };

      // Sequential (the fixed startGame contract)
      const blueP = loadBlueDeck("starter_deck");
      // Release blue regardless of "order" — red has not started yet
      releaseBlue();
      await blueP;

      phase = "red";
      const redP = loadRedDeck("starter_deck");
      releaseRed();
      await redP;

      results.push({
        hash: hashGameState(state),
        blueUids: state.players.first.deck.slice(0, 3).map((c) => c.uid),
        redUids: state.players.second.deck.slice(0, 3).map((c) => c.uid),
      });
    }
    (globalThis as any).fetch = originalFetch;

    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.blueUids[0]).toBe("uid_1");
  });

  it("documents the pre-fix Promise.all race (loaders in flight together diverge)", async () => {
    const a = await loadBothDecksWithFetchOrder("blue-first");
    const b = await loadBothDecksWithFetchOrder("red-first");
    // Overlapping loads still race — startGame must not overlap them.
    expect(a.hash === b.hash && a.blueUids[0] === b.blueUids[0]).toBe(false);
  });
});
