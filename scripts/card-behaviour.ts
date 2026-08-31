#!/usr/bin/env tsx
/**
 * Card behavioural-equivalence harness.
 *
 * Record a deterministic per-card fingerprint baseline, then verify later
 * card-data edits are behavioural no-ops.
 *
 *   npm run cards:baseline   # write baselines/card-behaviour.json
 *   npm run cards:verify     # compare current behaviour to baseline
 *
 * Not wired into `npm run check` yet — propose adding after the first
 * migration PR lands and the baseline proves stable.
 */

(globalThis as any).HEADLESS = true;

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initCardDatabaseNode } from "../src/data/cardLoaderNode.js";
import "../src/logic/core/effects/index.js";
import {
  driveCard,
  toBaselineEntry,
  HARNESS_SEED,
  HARNESS_VERSION,
  type BehaviourBaseline,
  type CardDriveResult,
  type BaselineCardEntry,
} from "./lib/cardBehaviourDrive.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const BASELINE_PATH = path.join(ROOT, "baselines", "card-behaviour.json");
const ALL_CARDS_PATH = path.join(ROOT, "cards", "all.json");

function loadPool(): { id: string; name: string; [k: string]: unknown }[] {
  const raw = JSON.parse(fs.readFileSync(ALL_CARDS_PATH, "utf-8"));
  if (!Array.isArray(raw)) throw new Error("cards/all.json is not an array");
  return raw;
}

function stableStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce((sorted: Record<string, unknown>, key) => {
            sorted[key] = (value as Record<string, unknown>)[key];
            return sorted;
          }, {});
      }
      return value;
    },
    2,
  );
}

function runPool(): {
  results: CardDriveResult[];
  baseline: BehaviourBaseline;
} {
  const pool = loadPool();
  const results: CardDriveResult[] = [];
  const cards: Record<string, BaselineCardEntry> = {};
  const skipReasons: Record<string, number> = {};
  let covered = 0;
  let skipped = 0;

  for (const raw of pool) {
    const result = driveCard(raw as any);
    results.push(result);
    cards[result.id] = toBaselineEntry(result);
    if (result.status === "covered") {
      covered++;
    } else {
      skipped++;
      skipReasons[result.reason] = (skipReasons[result.reason] ?? 0) + 1;
    }
  }

  const baseline: BehaviourBaseline = {
    version: HARNESS_VERSION,
    seed: HARNESS_SEED,
    cardCount: pool.length,
    covered,
    skipped,
    skipReasons,
    cards,
  };

  return { results, baseline };
}

function printSummary(baseline: BehaviourBaseline): void {
  console.log("\n=== Card behaviour harness summary ===");
  console.log(`seed=${baseline.seed}  version=${baseline.version}`);
  console.log(
    `covered=${baseline.covered}  skipped=${baseline.skipped}  total=${baseline.cardCount}`,
  );
  console.log("skip reasons:");
  const reasons = Object.entries(baseline.skipReasons).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [reason, count] of reasons) {
    console.log(`  ${reason}: ${count}`);
  }
}

function record(): void {
  console.log("Recording card-behaviour baseline...");
  const { baseline } = runPool();
  printSummary(baseline);
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, stableStringify(baseline) + "\n", "utf-8");
  console.log(`\nWrote ${BASELINE_PATH}`);
}

type DiffEntry = {
  id: string;
  name: string;
  kind:
    | "fingerprint_changed"
    | "status_changed"
    | "scenario_changed"
    | "missing_in_current"
    | "new_in_current";
  message: string;
};

function verify(): number {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(
      `No baseline at ${BASELINE_PATH}. Run: npm run cards:baseline`,
    );
    return 2;
  }

  const expected = JSON.parse(
    fs.readFileSync(BASELINE_PATH, "utf-8"),
  ) as BehaviourBaseline;

  console.log("Verifying card behaviour against baseline...");
  const { baseline: actual } = runPool();
  printSummary(actual);

  const diffs: DiffEntry[] = [];
  const allIds = new Set([
    ...Object.keys(expected.cards),
    ...Object.keys(actual.cards),
  ]);

  for (const id of [...allIds].sort()) {
    const exp = expected.cards[id];
    const act = actual.cards[id];
    if (!exp) {
      diffs.push({
        id,
        name: act!.name,
        kind: "new_in_current",
        message: `new card not in baseline (${act!.status})`,
      });
      continue;
    }
    if (!act) {
      diffs.push({
        id,
        name: exp.name,
        kind: "missing_in_current",
        message: `card present in baseline but missing from pool`,
      });
      continue;
    }
    if (exp.status !== act.status) {
      diffs.push({
        id,
        name: act.name,
        kind: "status_changed",
        message: `status ${exp.status} → ${act.status}`,
      });
      continue;
    }
    if (exp.status === "skipped" && act.status === "skipped") {
      if (exp.reason !== act.reason) {
        diffs.push({
          id,
          name: act.name,
          kind: "status_changed",
          message: `skip reason ${exp.reason} → ${act.reason}`,
        });
      }
      continue;
    }
    if (exp.status === "covered" && act.status === "covered") {
      if (exp.fingerprint !== act.fingerprint) {
        const expSc = new Map(
          exp.scenarios.map((s) => [s.scenario, s.fingerprint]),
        );
        const actSc = new Map(
          act.scenarios.map((s) => [s.scenario, s.fingerprint]),
        );
        const scenarioDiffs: string[] = [];
        for (const key of new Set([...expSc.keys(), ...actSc.keys()])) {
          if (expSc.get(key) !== actSc.get(key)) {
            scenarioDiffs.push(
              `${key}: ${expSc.get(key) ?? "(missing)"} → ${actSc.get(key) ?? "(missing)"}`,
            );
          }
        }
        diffs.push({
          id,
          name: act.name,
          kind:
            scenarioDiffs.length > 0
              ? "scenario_changed"
              : "fingerprint_changed",
          message:
            scenarioDiffs.length > 0
              ? scenarioDiffs.join("; ")
              : `fingerprint ${exp.fingerprint} → ${act.fingerprint}`,
        });
      }
    }
  }

  if (diffs.length === 0) {
    console.log("\nOK — all cards match baseline.");
    return 0;
  }

  console.log(`\nDIFF — ${diffs.length} card(s) changed:\n`);
  for (const d of diffs) {
    console.log(`  ${d.id}  ${d.name}`);
    console.log(`    [${d.kind}] ${d.message}`);
  }
  return 1;
}

function main(): void {
  const args = process.argv.slice(2);
  const mode = args.includes("--verify")
    ? "verify"
    : args.includes("--record")
      ? "record"
      : null;

  if (!mode) {
    console.error("Usage: card-behaviour.ts --record | --verify");
    process.exit(2);
  }

  // Engine ops are chatty in HEADLESS; keep harness output scannable.
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    const head = String(args[0] ?? "");
    if (
      head.includes("[SUMMON") ||
      head.includes("SUMMON DEBUG") ||
      head.includes("[CHOICE DEBUG]") ||
      head.includes("[REANIMATE DEBUG]") ||
      head.includes("[return_hand_to_deck]")
    ) {
      return;
    }
    origLog(...args);
  };

  console.log("Loading card database...");
  initCardDatabaseNode();
  console.log("Card database loaded.");

  if (mode === "record") {
    record();
    process.exit(0);
  }

  process.exit(verify());
}

main();
