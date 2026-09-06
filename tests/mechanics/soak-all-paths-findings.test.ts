/**
 * Pinned soak findings from --all-paths runs (fuse + interactiveModes opt-in).
 * Each it.fails reproduces one distinct failure signature via runSoakGame.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runSoakGame } from "../../src/bench/soakEnv.js";

const ALL_PATHS = { fuse: true, interactiveModes: true } as const;

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();

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

describe("soak --all-paths findings", () => {
  it("crash: clearSelectableFlags lifecycle guard — fuse_finalize_gear_multi (guardLifecycle)", async () => {
    const result = await runSoakGame({
      seed: 20260910,
      gameIndex: 113,
      turnCap: 60,
      actionCap: 800,
      ...ALL_PATHS,
    });
    expect(result.outcome).toBe("completed");
  });

  it("history legal-undo: [0].indices CHOOSE_MODE vs END_TURN after mode spell undo", async () => {
    const result = await runSoakGame({
      seed: 20260909,
      gameIndex: 0,
      turnCap: 60,
      actionCap: 800,
      historyCheck: true,
      dispatch: "engine",
      ...ALL_PATHS,
    });
    expect(result.outcome).toBe("completed");
  });

  it.fails(
    "history legal-undo: [0].attackerUid missing ATTACK after undo",
    async () => {
      const result = await runSoakGame({
        seed: 20260909,
        gameIndex: 15,
        turnCap: 60,
        actionCap: 800,
        historyCheck: true,
        dispatch: "engine",
        ...ALL_PATHS,
      });
      expect(result.outcome).toBe("completed");
    },
  );

  it("crash: commitAction Play Card with in-flight resolution queue", async () => {
    const result = await runSoakGame({
      seed: 20260909,
      gameIndex: 20,
      turnCap: 60,
      actionCap: 800,
      historyCheck: true,
      dispatch: "engine",
      ...ALL_PATHS,
    });
    expect(result.outcome).toBe("completed");
  });

  it("crash: deferred-death/damage batch stack overflow (flushDeferredDeathBatch cycle)", async () => {
    const result = await runSoakGame({
      seed: 20260909,
      gameIndex: 54,
      turnCap: 60,
      actionCap: 800,
      ...ALL_PATHS,
    });
    expect(result.outcome).toBe("completed");
  });
});
