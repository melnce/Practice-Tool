/**
 * Soak smoke — small fixed-seed corpus for CI.
 * Full corpus: `npm run soak` (writes reports/soak/).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runSoakGame, replaySoakTrace } from "../../src/bench/soakEnv.js";
import { CoverageTracker } from "../../src/bench/soakCoverage.js";
import { checkSoakInvariants } from "../../src/bench/soakInvariants.js";
import { state } from "../../src/core/gameState.js";
import { createRng } from "../../src/core/rng.js";
import { buildRandomLegalDeck } from "../../src/bench/soakDecks.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
} from "../../src/data/deckValidation.js";

const SMOKE_SEED = 424242;
const SMOKE_GAMES = 4;

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();

  // Ensure fetch can resolve shipped decks in node (setup.ts usually does this)
  if (typeof fetch === "undefined" || !(globalThis as any).__soakFetchReady) {
    const fs = await import("fs");
    const path = await import("path");
    const root = resolve(__dirname, "../..");
    const prev = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      const clean = String(url)
        .split("?")[0]!
        .replace(/^[./]+/, "")
        .replace(/^\//, "");
      const p = path.resolve(root, clean);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const body = fs.readFileSync(p, "utf-8");
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) =>
              n.toLowerCase() === "content-type" ? "application/json" : null,
          },
          text: async () => body,
          json: async () => JSON.parse(body),
        } as any;
      }
      if (typeof prev === "function") return prev(url);
      return { ok: false, status: 404, headers: { get: () => null } } as any;
    };
    (globalThis as any).__soakFetchReady = true;
  }
});

describe("engine soak smoke", () => {
  it("builds legal random 40-card decks (class+neutral, ≤3 copies)", () => {
    const rng = createRng("soak-deck-unit");
    const deck = buildRandomLegalDeck(rng, "Forestcraft", "unit");
    const cards = deck.cards ?? [];
    const total = cards.reduce((n, c) => n + (c.count ?? 0), 0);
    expect(total).toBe(REFERENCE_DECK_SIZE);
    for (const c of cards) {
      expect(c.count ?? 0).toBeLessThanOrEqual(REFERENCE_COPY_LIMIT);
    }
  });

  it(`plays ${SMOKE_GAMES} fixed-seed games without crash/hang/invariant`, async () => {
    const coverage = new CoverageTracker();
    const outcomes: string[] = [];

    for (let i = 0; i < SMOKE_GAMES; i++) {
      const result = await runSoakGame({
        seed: SMOKE_SEED,
        gameIndex: i,
        turnCap: 60,
        actionCap: 800,
        coverage,
      });
      outcomes.push(result.outcome);
      expect(
        result.outcome,
        `game ${i}: ${result.error ?? result.outcome}`,
      ).toBe("completed");

      // Post-game invariants still hold
      const findings = checkSoakInvariants(state);
      expect(findings, findings.map((f) => f.message).join("; ")).toEqual([]);
    }

    expect(outcomes.every((o) => o === "completed")).toBe(true);
    const report = coverage.report();
    expect(report.totalPool).toBeGreaterThanOrEqual(700);
    // Smoke is tiny — just assert the tracker runs
    expect(report.touched + report.untouched).toBe(report.totalPool);
  }, 120_000);

  it("is deterministic for a fixed seed (hash + replay)", async () => {
    const a = await runSoakGame({
      seed: SMOKE_SEED,
      gameIndex: 0,
      turnCap: 60,
      actionCap: 800,
    });
    expect(a.outcome).toBe("completed");

    const b = await runSoakGame({
      seed: SMOKE_SEED,
      gameIndex: 0,
      turnCap: 60,
      actionCap: 800,
    });
    expect(b.outcome).toBe("completed");
    expect(b.finalHash).toBe(a.finalHash);

    const replayed = await replaySoakTrace(SMOKE_SEED, 0, a.trace);
    expect(replayed.error).toBeUndefined();
    expect(replayed.hash).toBe(a.finalHash);
  }, 120_000);
});

// Silence unused import in some bundlers
void pathToFileURL;
