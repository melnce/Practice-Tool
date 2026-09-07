#!/usr/bin/env tsx
/**
 * Subjecthood report + dark-set gate.
 *
 *   npm run report:subjecthood          # table + reports/subjecthood.json
 *   npm run check:subjecthood           # bidirectional dark-set allowlist gate
 *
 * Counting rules are documented in scripts/lib/subjecthood.ts (read that file
 * before changing methodology). Numbers are not comparable to the 2026-09-06
 * scratchpad run — clause/title matching rules were not preserved.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPool, type PoolCard } from "./card-behaviour.js";
import {
  FEWER_SUBJECT_BLOCKS_THAN_CLAUSES_CAVEAT,
  runSubjecthoodAnalysis,
  runSubjecthoodDarkGate,
  type SubjecthoodReport,
} from "./lib/subjecthood.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((n * 100) / total).toFixed(1)}%`;
}

function printTable(report: SubjecthoodReport): void {
  const { summary, poolSize } = report;
  const rows: Array<[string, number, string]> = [
    [
      "subject of ≥1 asserting block",
      summary.withAtLeastOneSubjectBlock,
      pct(summary.withAtLeastOneSubjectBlock, poolSize),
    ],
    ["subject of exactly one block", summary.withExactlyOneSubjectBlock, ""],
    ["zero-subject", summary.zeroSubject, ""],
    ["— mentioned only as filler", summary.mentionedOnlyAsFiller, ""],
    ["— never mentioned anywhere", summary.neverMentioned, ""],
    [
      "fewer subject blocks than clauses †",
      summary.fewerSubjectBlocksThanClauses,
      "",
    ],
    [
      "reached by nothing (zero-subject ∧ vanilla_place-only)",
      summary.dark,
      "",
    ],
    [
      "matched by name only (never by id in titles)",
      summary.matchedByNameOnly,
      "",
    ],
  ];

  console.log("\nSubjecthood summary");
  console.log("─".repeat(72));
  console.log(
    `${"metric".padEnd(46)} ${"count".padStart(6)} ${"pct".padStart(8)}`,
  );
  console.log("─".repeat(72));
  for (const [label, count, percent] of rows) {
    console.log(
      `${label.padEnd(46)} ${String(count).padStart(6)} ${percent.padStart(8)}`,
    );
  }
  console.log("─".repeat(72));
  console.log(`${"pool size".padEnd(46)} ${String(poolSize).padStart(6)}`);
  console.log("");
  console.log(
    `  † ${summary.fewerSubjectBlocksThanClausesCaveat ?? FEWER_SUBJECT_BLOCKS_THAN_CLAUSES_CAVEAT}`,
  );
  console.log(
    `\nNested describe inheritance: ${report.options.inheritDescribeTitles}`,
  );
  console.log(
    `Name match minimum length: 9 chars (see scripts/lib/subjecthood.ts)`,
  );

  if (report.darkCardIds.length) {
    console.log("\nDark cards (zero-subject ∧ vanilla_place-only):");
    for (const id of report.darkCardIds) {
      const card = report.cards.find((c) => c.cardId === id);
      console.log(`  [${id}] ${card?.cardName ?? "?"}`);
    }
  }
}

function main(): void {
  const checkMode = process.argv.includes("--check");
  const cards: PoolCard[] = loadPool();
  const report = runSubjecthoodAnalysis(ROOT, cards);

  if (!checkMode) {
    printTable(report);
  }

  const reportPath = path.join(ROOT, "reports", "subjecthood.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  if (!checkMode) {
    console.log(`\nWrote ${path.relative(ROOT, reportPath)}`);
  }

  const gate = runSubjecthoodDarkGate(report);
  if (checkMode) {
    if (gate.exitCode !== 0) {
      console.error(`\n❌ ${gate.errors.length} subjecthood gate error(s):`);
      for (const err of gate.errors) console.error(`  - ${err}`);
      process.exit(1);
    }
    console.log("\n✅ Subjecthood dark-set gate passed.");
    return;
  }

  if (gate.exitCode !== 0) {
    console.log("\nDark-set gate would fail (--check to enforce):");
    for (const err of gate.errors) console.log(`  - ${err}`);
  }
}

main();
