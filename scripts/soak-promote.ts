#!/usr/bin/env npx tsx
/**
 * Promote a soak crash repro (reports/soak/repro_*.json) to a golden replay.
 *
 * Usage:
 *   npm run soak:promote -- reports/soak/repro_seed123_game5_crash.json
 *   npm run soak:promote -- --all
 */
(globalThis as any).HEADLESS = true;
process.env.NODE_ENV ??= "test";

import { existsSync, readdirSync, writeFileSync } from "fs";
import { basename, join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initCardDatabaseNode } from "../src/data/cardLoaderNode.js";
import { createArrayTrace } from "../src/logic/core/effects/trace.js";
import { installHeadlessNode } from "./headlessNode.js";
import {
  loadSoakRepro,
  replaySoakRepro,
  reproducesRecordedFailure,
  goldenIdForRepro,
  gameSeedFromRepro,
} from "./soakRepro.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const REPORT_SOAK_DIR = join(ROOT, "reports", "soak");
const GOLDEN_DIR = join(ROOT, "replays", "golden");

function stablePrettyStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (key, value) => {
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

async function promoteOne(reproPath: string): Promise<boolean> {
  if (!existsSync(reproPath)) {
    console.error(`[soak:promote] file not found: ${reproPath}`);
    return false;
  }

  const repro = loadSoakRepro(reproPath);
  const id = goldenIdForRepro(repro);
  const outPath = join(GOLDEN_DIR, `${id}.json`);

  if (existsSync(outPath)) {
    console.error(
      `[soak:promote] refusing to overwrite existing golden: ${outPath}`,
    );
    return false;
  }

  const replay = await replaySoakRepro(repro);
  const check = reproducesRecordedFailure(repro, replay);
  if (!check.ok) {
    console.error(
      `[soak:promote] repro does not reproduce (${basename(reproPath)}): ${check.reason}`,
    );
    return false;
  }

  // Golden state hashes: replay on clean engine (fault injection off).
  const savedFault = process.env.SOAK_INJECT_FAULT;
  delete process.env.SOAK_INJECT_FAULT;
  const goldenReplay = await replaySoakRepro(repro);
  if (savedFault !== undefined) process.env.SOAK_INJECT_FAULT = savedFault;
  if (goldenReplay.threw) {
    console.error(
      `[soak:promote] clean replay threw while capturing golden hashes: ${goldenReplay.error}`,
    );
    return false;
  }

  const { events } = createArrayTrace();
  const capsule = {
    version: "1.0.0",
    id,
    seed: gameSeedFromRepro(repro),
    actions: repro.trace,
    initial: { stateHash: goldenReplay.initialHash },
    final: { stateHash: goldenReplay.finalHash },
    trace: JSON.parse(JSON.stringify(events)),
  };

  writeFileSync(outPath, stablePrettyStringify(capsule) + "\n");

  const finding = repro.findings?.[0] ?? repro.outcome;
  console.log(
    `[soak:promote] ${outPath}\n` +
      `  finding: ${finding}\n` +
      `  actions: ${repro.trace.length}`,
  );
  return true;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const paths = args.filter((a) => !a.startsWith("--"));

  if (!all && paths.length === 0) {
    console.error(
      "Usage: npm run soak:promote -- <repro.json> | --all\n" +
        "  Repro files live in reports/soak/repro_*.json",
    );
    process.exit(1);
  }

  await installHeadlessNode();
  await initCardDatabaseNode();

  let targets: string[];
  if (all) {
    if (!existsSync(REPORT_SOAK_DIR)) {
      console.error(`[soak:promote] no reports/soak directory`);
      process.exit(1);
    }
    targets = readdirSync(REPORT_SOAK_DIR)
      .filter((f) => f.startsWith("repro_") && f.endsWith(".json"))
      .map((f) => join(REPORT_SOAK_DIR, f));
    if (targets.length === 0) {
      console.error(
        `[soak:promote] no repro_*.json files in ${REPORT_SOAK_DIR}`,
      );
      process.exit(1);
    }
  } else {
    targets = paths.map((p) => resolve(p));
  }

  let ok = 0;
  let fail = 0;
  for (const p of targets) {
    if (await promoteOne(p)) ok++;
    else fail++;
  }

  if (fail > 0) process.exit(1);
  console.log(`[soak:promote] promoted ${ok} file(s).`);
}

main().catch((err) => {
  console.error("[soak:promote] fatal:", err);
  process.exit(1);
});
