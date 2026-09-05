/**
 * Card behaviour harness — token pool coverage and collectible stability.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import "../audit/setup.ts";
import "../../src/logic/core/effects/index.js";
import { loadPool } from "../../scripts/card-behaviour.js";
import {
  driveCard,
  toBaselineEntry,
} from "../../scripts/lib/cardBehaviourDrive.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "baselines", "card-behaviour.json");
const TOKEN_PATH = path.join(ROOT, "cards", "token_details.json");

const SAMPLE_COLLECTIBLES = ["10001110", "10021110", "10104120"];

describe("card behaviour harness tokens", () => {
  beforeAll(() => {
    (globalThis as { HEADLESS?: boolean }).HEADLESS = true;
  });

  it("pool contains every token id from token_details.json", () => {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")) as {
      id: string;
    }[];
    const pool = loadPool();
    const poolIds = new Set(pool.map((c) => c.id));
    const missing = tokens.filter((t) => !poolIds.has(t.id));
    expect(missing.map((t) => t.id)).toEqual([]);
    expect(pool.filter((c) => c.token)).toHaveLength(tokens.length);
  });

  it("cant_play token gets the summon scenario", () => {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")) as {
      id: string;
      name: string;
      cant_play?: boolean;
    }[];
    const gear = tokens.find((t) => t.cant_play);
    expect(gear).toBeDefined();
    const result = driveCard(gear!, { isToken: true });
    expect(result.status).not.toBe("skipped");
    if (result.status === "skipped") return;
    expect(result.scenarios.map((s) => s.scenario)).toEqual(["summon"]);
  });

  it("collectible fingerprints match committed baseline for sample ids", () => {
    const baseline = JSON.parse(
      fs.readFileSync(BASELINE_PATH, "utf-8"),
    ) as {
      cards: Record<
        string,
        { fingerprint?: string; status: string; scenarios?: unknown[] }
      >;
    };
    const pool = loadPool();
    for (const id of SAMPLE_COLLECTIBLES) {
      const raw = pool.find((c) => c.id === id);
      expect(raw, `collectible ${id} in pool`).toBeDefined();
      expect(raw!.token).toBeFalsy();
      const result = driveCard(raw!);
      const entry = toBaselineEntry(result);
      const expected = baseline.cards[id];
      expect(expected, `baseline entry for ${id}`).toBeDefined();
      if (entry.status === "skipped" || expected.status === "skipped") {
        expect(entry).toEqual(expected);
        continue;
      }
      expect(entry.fingerprint).toBe(expected.fingerprint);
      expect(entry.scenarios).toEqual(expected.scenarios);
    }
  });
});
