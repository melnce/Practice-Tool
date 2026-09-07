/**
 * Baseline isolation — card fingerprints must not depend on pool drive order.
 *
 * Each sample card is driven alone and compared to the committed baseline.
 * Fingerprints from a full pool-order run must match the isolated runs; a
 * mismatch means harness state is leaking between cards.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  driveCard,
  type BaselineCardEntry,
  type BehaviourBaseline,
  type CardDriveResult,
  type ScenarioName,
} from "./cardBehaviourDrive.js";
import { loadPool, type PoolCard } from "../card-behaviour.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");
export const BASELINE_PATH = path.join(ROOT, "baselines", "card-behaviour.json");

/** Cards whose play fingerprints were wrong before per-card harness reset (#324). */
export const SENSITIVE_CORE_IDS = [
  "10031110",
  "10131310",
  "10132110",
  "10134120",
  "10134310",
  "10172320",
  "10174130",
  "10224110",
  "10274120",
  "10434110",
  "10531120",
  "10774120",
  "10831110",
  "10832310",
  "10833310",
] as const;

export const SAMPLE_SEED = 0xba5e110a;
export const TARGET_SAMPLE_SIZE = 25;

export type IsolationMismatchKind = "baseline" | "order";

export type IsolationMismatch = {
  cardId: string;
  cardName: string;
  kind: IsolationMismatchKind;
  scenario: ScenarioName | "(status)";
  expected: string;
  actual: string;
};

export type IsolationCheckReport = {
  sampleIds: string[];
  mismatches: IsolationMismatch[];
  elapsedMs: number;
  exitCode: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectIsolationSampleIds(
  poolIds: string[],
  opts: {
    coreIds?: readonly string[];
    targetSize?: number;
    seed?: number;
  } = {},
): string[] {
  const coreIds = opts.coreIds ?? SENSITIVE_CORE_IDS;
  const targetSize = opts.targetSize ?? TARGET_SAMPLE_SIZE;
  const seed = opts.seed ?? SAMPLE_SEED;
  const core = new Set(coreIds);
  const candidates = poolIds.filter((id) => !core.has(id)).sort();
  const picked = new Set(coreIds);
  const extraCount = Math.max(0, targetSize - coreIds.length);
  const rng = mulberry32(seed);
  const order = candidates.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < extraCount && i < order.length; i++) {
    picked.add(candidates[order[i]!]!);
  }
  return [...picked].sort();
}

function compareScenarioFingerprints(
  cardId: string,
  cardName: string,
  kind: IsolationMismatchKind,
  expected: Map<ScenarioName, string> | BaselineCardEntry,
  actual: CardDriveResult,
): IsolationMismatch[] {
  const mismatches: IsolationMismatch[] = [];
  if (actual.status === "skipped") {
    if ("status" in expected && expected.status === "skipped") return mismatches;
    mismatches.push({
      cardId,
      cardName,
      kind,
      scenario: "(status)",
      expected:
        "status" in expected ? expected.status : "(covered/partial expected)",
      actual: actual.status,
    });
    return mismatches;
  }

  const expectedMap =
    expected instanceof Map
      ? expected
      : expected.status === "skipped"
        ? null
        : new Map(
            expected.scenarios.map((s) => [s.scenario, s.fingerprint]),
          );

  if (!expectedMap) {
    mismatches.push({
      cardId,
      cardName,
      kind,
      scenario: "(status)",
      expected: "skipped",
      actual: actual.status,
    });
    return mismatches;
  }

  if ("status" in expected && expected.status !== actual.status) {
    mismatches.push({
      cardId,
      cardName,
      kind,
      scenario: "(status)",
      expected: expected.status,
      actual: actual.status,
    });
    return mismatches;
  }

  for (const [scenario, expFp] of expectedMap) {
    const actFp = actual.scenarios.find((s) => s.scenario === scenario)
      ?.fingerprint;
    if (actFp !== expFp) {
      mismatches.push({
        cardId,
        cardName,
        kind,
        scenario,
        expected: expFp,
        actual: actFp ?? "(missing)",
      });
    }
  }

  for (const s of actual.scenarios) {
    if (!expectedMap.has(s.scenario)) {
      mismatches.push({
        cardId,
        cardName,
        kind,
        scenario: s.scenario,
        expected: "(missing)",
        actual: s.fingerprint,
      });
    }
  }

  return mismatches;
}

export function driveCardAlone(raw: PoolCard): CardDriveResult {
  return driveCard(raw, { isToken: !!raw.token });
}

/** Drive the full pool in catalog order (same as cards:verify). */
export function drivePoolOrdered(pool: PoolCard[]): Map<string, CardDriveResult> {
  const results = new Map<string, CardDriveResult>();
  for (const raw of pool) {
    results.set(String(raw.id), driveCard(raw, { isToken: !!raw.token }));
  }
  return results;
}

export function loadCommittedBaseline(): BehaviourBaseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      `No baseline at ${BASELINE_PATH}. Run: npm run cards:baseline`,
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as BehaviourBaseline;
}

export function checkCardIsolation(
  raw: PoolCard,
  baseline: BehaviourBaseline,
  poolOrderResult: CardDriveResult,
): IsolationMismatch[] {
  const id = String(raw.id);
  const alone = driveCardAlone(raw);
  const mismatches: IsolationMismatch[] = [];
  const baselineEntry = baseline.cards[id];

  if (!baselineEntry) {
    mismatches.push({
      cardId: id,
      cardName: raw.name ?? id,
      kind: "baseline",
      scenario: "(status)",
      expected: "(in baseline)",
      actual: alone.status,
    });
    return mismatches;
  }

  mismatches.push(
    ...compareScenarioFingerprints(
      id,
      alone.name,
      "baseline",
      baselineEntry,
      alone,
    ),
  );

  mismatches.push(
    ...compareScenarioFingerprints(
      id,
      alone.name,
      "order",
      alone,
      poolOrderResult,
    ),
  );

  return mismatches;
}

export function runBaselineIsolationCheck(
  opts: {
    sampleIds?: string[];
    baseline?: BehaviourBaseline;
    pool?: PoolCard[];
  } = {},
): IsolationCheckReport {
  const pool = opts.pool ?? loadPool();
  const baseline = opts.baseline ?? loadCommittedBaseline();
  const sampleIds =
    opts.sampleIds ??
    selectIsolationSampleIds(pool.map((c) => String(c.id)));
  const byId = new Map(pool.map((c) => [String(c.id), c]));

  const started = performance.now();
  const poolResults = drivePoolOrdered(pool);
  const mismatches: IsolationMismatch[] = [];

  for (const id of sampleIds) {
    const raw = byId.get(id);
    const poolOrderResult = poolResults.get(id);
    if (!raw || !poolOrderResult) {
      mismatches.push({
        cardId: id,
        cardName: id,
        kind: "baseline",
        scenario: "(status)",
        expected: "(in pool)",
        actual: "(missing)",
      });
      continue;
    }
    mismatches.push(...checkCardIsolation(raw, baseline, poolOrderResult));
  }

  return {
    sampleIds,
    mismatches,
    elapsedMs: performance.now() - started,
    exitCode: mismatches.length > 0 ? 1 : 0,
  };
}

export function formatIsolationMismatch(m: IsolationMismatch): string {
  const prefix =
    m.kind === "baseline"
      ? "isolated run differs from committed baseline"
      : "pool-order run differs from isolated run (harness state is leaking between cards)";
  return `${m.cardId} ${m.cardName} scenario=${m.scenario}: expected ${m.expected}, got ${m.actual} — ${prefix}`;
}
