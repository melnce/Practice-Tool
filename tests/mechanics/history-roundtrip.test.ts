/**
 * History round-trip soak — undo/redo after every action with full-state comparison.
 * Findings are recorded as it.fails (engine fixes are out of scope for this PR).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runSoakGame } from "../../src/bench/soakEnv.js";

const FIXED_SEEDS = [20260908, 20260909, 20260910] as const;

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("history round-trip soak", () => {
  for (const seed of FIXED_SEEDS) {
    it.fails(
      `seed ${seed} — mulligan actions break undo round-trip`,
      async () => {
        const result = await runSoakGame({
          seed,
          gameIndex: 0,
          historyCheck: true,
          turnCap: 60,
          actionCap: 800,
        });
        expect(
          result.outcome,
          result.error ?? `seed ${seed} outcome ${result.outcome}`,
        ).toBe("completed");
      },
    );
  }

  // toggleMulliganPickCore (mulliganCore.ts) mutates __mulliganSelected without doAction.
  it.fails(
    "TOGGLE_MULLIGAN bypasses history.ts — undo cannot restore __mulliganSelected (seed 20260908 game 0 action 1)",
    async () => {
      const result = await runSoakGame({
        seed: 20260908,
        gameIndex: 0,
        historyCheck: true,
      });
      expect(result.outcome).toBe("completed");
    },
  );

  // CONFIRM_MULLIGAN undo leaves lastDrawnCard pointing at wrong card after second-player confirm.
  it.fails(
    "CONFIRM_MULLIGAN undo leaves lastDrawnCard stale (seed 20260815 game 4 action 2)",
    async () => {
      const result = await runSoakGame({
        seed: 20260815,
        gameIndex: 4,
        historyCheck: true,
      });
      expect(result.outcome).toBe("completed");
    },
  );
});
