#!/usr/bin/env tsx
/**
 * Diff repo card data against the live client dump.
 *
 * Usage:
 *   npm run cards:drift
 *   npm run cards:drift -- --input reports/cards-drift/dump.json
 *   npm run cards:drift -- --url https://sva.hypd.asia/data/cards.json --json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_FILE, ROOT } from "./mergeSets.js";
import { TOKEN_FILE } from "./lib/loadCards.js";
import {
  compareCardsDrift,
  DEFAULT_DUMP_URL,
  fetchDumpRecords,
  renderDriftMarkdown,
  type AllowlistEntry,
  type OurCard,
} from "./lib/cardsDrift.js";

const __filename = fileURLToPath(import.meta.url);
const ALLOWLIST_FILE = path.join(ROOT, "cards", "drift-allowlist.json");
const DEFAULT_OUT_DIR = path.join(ROOT, "reports", "cards-drift");

type CliOptions = {
  input?: string;
  url: string;
  outDir: string;
  json: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const inputIdx = argv.indexOf("--input");
  const urlIdx = argv.indexOf("--url");
  const outIdx = argv.indexOf("--out");
  return {
    input: inputIdx >= 0 ? argv[inputIdx + 1] : undefined,
    url: urlIdx >= 0 ? argv[urlIdx + 1] : DEFAULT_DUMP_URL,
    outDir: outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT_DIR,
    json: argv.includes("--json"),
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function loadOurCards(): OurCard[] {
  const all = readJson<OurCard[]>(ALL_FILE);
  const tokens = fs.existsSync(TOKEN_FILE)
    ? readJson<OurCard[]>(TOKEN_FILE)
    : [];
  return [...all, ...tokens];
}

function loadAllowlist(): AllowlistEntry[] {
  if (!fs.existsSync(ALLOWLIST_FILE)) return [];
  const raw = readJson<AllowlistEntry[]>(ALLOWLIST_FILE);
  return Array.isArray(raw) ? raw : [];
}

function writeReports(
  outDir: string,
  report: ReturnType<typeof compareCardsDrift>,
  jsonStdout: boolean,
): void {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest.json");
  const mdPath = path.join(outDir, "latest.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderDriftMarkdown(report));
  if (jsonStdout) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
    console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
    console.log(`Exit code: ${report.exitCode}`);
  }
}

export async function runCardsDrift(
  options: CliOptions,
): Promise<{ report: ReturnType<typeof compareCardsDrift>; exitCode: number }> {
  const oursCards = loadOurCards();
  const allowlist = loadAllowlist();
  const fetchTimestamp = new Date().toISOString();

  let dumpRecords: import("./lib/cardsDrift.js").DumpRecord[];
  let dumpSha256: string | undefined;

  if (options.input) {
    const raw = fs.readFileSync(options.input, "utf-8");
    dumpRecords = JSON.parse(raw) as import("./lib/cardsDrift.js").DumpRecord[];
    dumpSha256 = undefined;
  } else {
    try {
      const fetched = await fetchDumpRecords(options.url);
      dumpRecords = fetched.records;
      dumpSha256 = fetched.sha256;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown network error";
      console.error(`Failed to fetch dump from ${options.url}: ${message}`);
      process.exitCode = 2;
      throw err;
    }
  }

  const report = compareCardsDrift({
    oursCards,
    dumpRecords,
    allowlist,
    fetchTimestamp,
    dumpSha256,
  });

  writeReports(options.outDir, report, options.json);
  return { report, exitCode: report.exitCode };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { exitCode } = await runCardsDrift(options);
  process.exit(exitCode);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  main().catch((err) => {
    if (process.exitCode !== 2) {
      console.error(err);
      process.exit(1);
    }
  });
}
