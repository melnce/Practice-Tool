#!/usr/bin/env tsx
/**
 * Rotation metadata gate — official per-card rotation vs set-window heuristic.
 * Run: npm run check:rotation-meta
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadRepoCards } from "./lib/officialReconcile.js";
import type { OfficialMetaFile } from "./lib/officialCards.js";
import { runRotationMetaGate } from "./rotation-meta-gate.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META_PATH = path.join(ROOT, "cards/official-meta.json");

function main() {
  console.log("🔍 Checking official rotation metadata vs heuristic...\n");

  if (!fs.existsSync(META_PATH)) {
    console.error(
      "❌ cards/official-meta.json is missing — run `npm run cards:official`",
    );
    process.exit(1);
  }

  const meta = JSON.parse(
    fs.readFileSync(META_PATH, "utf-8"),
  ) as OfficialMetaFile;
  const report = runRotationMetaGate(meta);

  const fetchedAt = meta._meta?.fetched_at ?? "(unknown)";
  const repo = loadRepoCards();
  console.log(`Official snapshot fetched_at: ${fetchedAt}`);
  console.log(
    `Compared ${repo.byId.size} repo cards against official metadata.`,
  );

  if (report.mismatches.length) {
    console.log(
      `\nKnown mismatches (allowlisted or failing): ${report.mismatches.length}`,
    );
    for (const m of report.mismatches) {
      console.log(
        `  [${m.cardId}] ${m.cardName} — official=${m.official}, heuristic=${m.heuristic}`,
      );
    }
  }

  if (report.errors.length) {
    console.error(`\n❌ ${report.errors.length} rotation gate error(s):`);
    for (const err of report.errors) {
      console.error(`  ${err.message}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Rotation metadata gate passed.");
  process.exit(0);
}

main();
