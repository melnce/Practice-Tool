#!/usr/bin/env tsx
/**
 * Report derived implementation status across cards/all.json.
 * Run: npm run check:card-status
 * CI gate: npm run check:card-status -- --check
 *
 * Labels are intentionally non-fidelity claims:
 *   ops_present / unknown_ops / unimplemented
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getImplementationStatus,
  summarizeImplementationStatus,
  type CardLike,
} from "../src/data/cardImplementationStatus.js";
import { ALL_FILE } from "./mergeSets.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

function main() {
  const checkMode = process.argv.includes("--check");
  const cards = JSON.parse(fs.readFileSync(ALL_FILE, "utf-8")) as CardLike[];
  const summary = summarizeImplementationStatus(cards);
  console.log(`Collectibles: ${cards.length}`);
  console.log(`  ops_present:   ${summary.ops_present}`);
  console.log(`  unknown_ops:   ${summary.unknown_ops}`);
  console.log(`  unimplemented: ${summary.unimplemented}`);

  const unknown = cards.filter(
    (c) => getImplementationStatus(c) === "unknown_ops",
  );
  const unimplemented = cards.filter(
    (c) => getImplementationStatus(c) === "unimplemented",
  );

  if (unknown.length) {
    console.log("\nUnknown-op collectibles:");
    for (const c of unknown.slice(0, 50)) {
      console.log(`  [${c.id}] ${c.name}`);
    }
  }

  if (unimplemented.length) {
    console.log("\nUnimplemented collectibles:");
    for (const c of unimplemented.slice(0, 50)) {
      console.log(`  [${c.id}] ${c.name}`);
    }
  }

  const reportPath = path.join(
    ROOT,
    "reports",
    "card-implementation-status.json",
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        total: cards.length,
        summary,
        unknown_ops: unknown.map((c) => ({ id: c.id, name: c.name })),
        unimplemented: unimplemented.map((c) => ({ id: c.id, name: c.name })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nWrote ${path.relative(ROOT, reportPath)}`);

  // Collectibles only — token stubs in token_details.json are tracked separately.
  if (checkMode && (unknown.length > 0 || unimplemented.length > 0)) {
    console.error(
      `\n❌ check:card-status failed: ${unknown.length} unknown_ops and ${unimplemented.length} unimplemented collectible(s) in cards/all.json`,
    );
    process.exit(1);
  }

  if (checkMode) {
    console.log("\n✅ check:card-status passed (collectibles only).");
  }
}

main();
