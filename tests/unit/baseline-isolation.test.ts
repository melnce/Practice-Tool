import { describe, it, expect, beforeAll } from "vitest";
import {
  SENSITIVE_CORE_IDS,
  selectIsolationSampleIds,
  driveCardAlone,
  drivePoolOrdered,
  checkCardIsolation,
  loadCommittedBaseline,
  runBaselineIsolationCheck,
  formatIsolationMismatch,
  type IsolationMismatch,
} from "../../scripts/lib/baselineIsolation.js";
import { loadPool } from "../../scripts/card-behaviour.js";
import "../../src/logic/core/effects/index.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
  void initCardDatabaseNode();
});

describe("baseline isolation sample", () => {
  it("includes all sensitive core ids and reaches target size", () => {
    const poolIds = Array.from({ length: 50 }, (_, i) => String(10000000 + i));
    const sample = selectIsolationSampleIds(
      [...poolIds, ...SENSITIVE_CORE_IDS],
      { targetSize: 25 },
    );
    for (const id of SENSITIVE_CORE_IDS) {
      expect(sample).toContain(id);
    }
    expect(sample.length).toBe(25);
  });

  it("is deterministic for a fixed seed", () => {
    const poolIds = Array.from({ length: 200 }, (_, i) => String(10000000 + i));
    const a = selectIsolationSampleIds(poolIds, { seed: 42, targetSize: 25 });
    const b = selectIsolationSampleIds(poolIds, { seed: 42, targetSize: 25 });
    expect(a).toEqual(b);
  });
});

describe("baseline isolation runner", () => {
  it("returns the same fingerprint alone and in pool order after a watch probe card", () => {
    const pool = loadPool();
    const probeHeavyId = "10774120"; // Myuu — watch scenario predecessor for Meowskers
    const targetId = "10831110";
    const target = pool.find((c) => String(c.id) === targetId)!;
    const probeIndex = pool.findIndex((c) => String(c.id) === probeHeavyId);
    const targetIndex = pool.findIndex((c) => String(c.id) === targetId);
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeGreaterThan(probeIndex);

    const prefix = pool.slice(0, targetIndex + 1);
    const poolResults = drivePoolOrdered(prefix);
    const alone = driveCardAlone(target);
    const inOrder = poolResults.get(targetId)!;

    expect(alone.status).not.toBe("skipped");
    expect(inOrder.status).toBe(alone.status);
    for (const s of alone.scenarios) {
      const other = inOrder.scenarios.find((x) => x.scenario === s.scenario);
      expect(other?.fingerprint, `scenario ${s.scenario}`).toBe(s.fingerprint);
    }

    expect(prefix.some((c) => String(c.id) === probeHeavyId)).toBe(true);
  });

  it("matches committed baseline for isolated Ralmia play fingerprint", () => {
    const baseline = loadCommittedBaseline();
    const pool = loadPool();
    const target = pool.find((c) => String(c.id) === "10174130")!;
    const poolResults = drivePoolOrdered(pool);

    const mismatches = checkCardIsolation(
      target,
      baseline,
      poolResults.get("10174130")!,
    );
    const playMismatch = mismatches.find(
      (m) => m.scenario === "play" && m.kind === "baseline",
    );
    expect(playMismatch).toBeUndefined();
  });

  it("full sample check passes on current tree", () => {
    const report = runBaselineIsolationCheck();
    expect(report.exitCode).toBe(0);
    expect(report.mismatches).toHaveLength(0);
  });
});

describe("baseline isolation gate failure path", () => {
  it("reports harness leakage in failure messages", () => {
    const mismatch: IsolationMismatch = {
      cardId: "10174130",
      cardName: "Ralmia, Sonic Boom",
      kind: "order",
      scenario: "play",
      expected: "eac675a2",
      actual: "5dc5ab67",
    };
    const msg = formatIsolationMismatch(mismatch);
    expect(msg).toContain("10174130");
    expect(msg).toContain("play");
    expect(msg).toContain("eac675a2");
    expect(msg).toContain("5dc5ab67");
    expect(msg).toMatch(/leaking between cards/i);
  });

  it("reports baseline drift in failure messages", () => {
    const mismatch: IsolationMismatch = {
      cardId: "10274120",
      cardName: "Karula, Eternal Arts",
      kind: "baseline",
      scenario: "play",
      expected: "5cea6d78",
      actual: "129db79f",
    };
    const msg = formatIsolationMismatch(mismatch);
    expect(msg).toContain("10274120");
    expect(msg).toMatch(/committed baseline/i);
    expect(msg).toMatch(/stale or hand-edited/i);
    expect(msg).toMatch(/leaking between cards/i);
  });
});
