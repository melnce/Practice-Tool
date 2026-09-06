/**
 * Pinned dispatch-parity findings from --parity soak runs.
 * Engine (src/engine.ts dispatch) is the UI reference path; core (dispatchAction) must match.
 * Full-game parity replays need >5s under CI load; per-test timeout avoids vitest's default 5000ms.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "path";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { runParitySoakGame } from "../../src/bench/parity.js";

const ALL_PATHS = { fuse: true, interactiveModes: true } as const;
const SOAK_CAPS = { turnCap: 60, actionCap: 800 } as const;

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

describe("soak --parity findings", () => {
  it("green pin: default path engine/core agree (seed 20260910 game 0)", async () => {
    const result = await runParitySoakGame({
      seed: 20260910,
      gameIndex: 0,
      ...SOAK_CAPS,
    });
    expect(result.outcome).toBe("completed");
  }, 60_000);

  it("green pin: fuse+interactive path engine/core agree (seed 20260909 game 6)", async () => {
    const result = await runParitySoakGame({
      seed: 20260909,
      gameIndex: 6,
      ...SOAK_CAPS,
      ...ALL_PATHS,
    });
    expect(result.outcome).toBe("completed");
  }, 60_000);

  it("state: autoRender parity on lastAddedToHand — selection flags cleared consistently (seed 20260909 game 53)", async () => {
    const result = await runParitySoakGame({
      seed: 20260909,
      gameIndex: 53,
      ...SOAK_CAPS,
      historyCheck: true,
      dispatch: "engine",
    });
    expect(result.outcome).toBe("completed");
  }, 60_000);
});
