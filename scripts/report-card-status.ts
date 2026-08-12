#!/usr/bin/env tsx
/**
 * Report derived implementation status across cards/all.json.
 * Run: npm run check:card-status
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
  const cards = JSON.parse(fs.readFileSync(ALL_FILE, "utf-8")) as CardLike[];
  const summary = summarizeImplementationStatus(cards);
  console.log(`Cards: ${cards.length}`);
  console.log(`  implemented:   ${summary.implemented}`);
  console.log(`  partial:       ${summary.partial}`);
  console.log(`  unimplemented: ${summary.unimplemented}`);

  const partials = cards.filter(
    (c) => getImplementationStatus(c) === "partial",
  );
  if (partials.length) {
    console.log("\nPartial cards:");
    for (const c of partials.slice(0, 50)) {
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
        partial: partials.map((c) => ({ id: c.id, name: c.name })),
        unimplementedSample: cards
          .filter((c) => getImplementationStatus(c) === "unimplemented")
          .slice(0, 20)
          .map((c) => ({ id: c.id, name: c.name })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nWrote ${path.relative(ROOT, reportPath)}`);
}

main();
