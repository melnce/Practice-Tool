#!/usr/bin/env tsx
/**
 * One-shot: Phase 1 dedup + Phase 2 replicate migration in cards/sets/ only.
 * Run: npx tsx scripts/apply-superevolve-execution.ts
 * Then: npm run cards:update
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 80 DUPLICATE — empty superevolve[] (79 original + Orthrus). */
const DUPLICATE_IDS = new Set([
  "10001120", "10061130", "10102110", "10103110", "10111120", "10113110", "10113120",
  "10121120", "10122110", "10122140", "10123130", "10131130", "10131140", "10132110",
  "10132120", "10132130", "10133110", "10133130", "10134120", "10141140", "10143120",
  "10151120", "10151150", "10152120", "10153120", "10153130", "10154130", "10161110",
  "10162110", "10163120", "10164130", "10171130", "10172110", "10172120", "10173110",
  "10173130", "10173140", "10174110", "10203110", "10213110", "10214110", "10222120",
  "10224110", "10232110", "10232120", "10233110", "10234120", "10242120", "10244110",
  "10251110", "10261110", "10264120", "10271110", "10272120", "10273110", "10274110",
  "10304110", "10304120", "10311110", "10314120", "10322120", "10323110", "10324120",
  "10331120", "10351110", "10352110", "10363110", "10364120", "10371120", "10372110",
  "10374120", "10411120", "10413110", "10421120", "10421130", "10431120", "10442110",
  "10444110", "10462110", "10463110",
]);

const INSTEAD_IDS = new Set([
  "10002110", "10042110", "10062110", "10072120", "10173120",
]);

const AMOROUS_ID = "10052120";

const AMOROUS_SUPER_DRAIN_ONLY = [
  {
    op: "keyword",
    action: "grant",
    target: "ally:last_summoned",
    keywords: ["drain"],
  },
];

/** Migrate evolve[] → replicate op (superevolve[] emptied in Phase 1). */
const REPLICATE_IDS = new Set([
  "10061130", "10102110", "10111120", "10121120", "10141140", "10172120", "10173110",
  "10232120", "10234120", "10271110", "10311110", "10331120", "10351110", "10352110",
  "10372110", "10444110",
]);

const REPLICATE_OP = [{ op: "replicate", zone: "fanfare" }];

type Card = {
  id: string;
  name: string;
  evolve?: unknown[];
  superevolve?: unknown[];
  fanfare?: unknown[];
  superEvolveReplaces?: boolean;
};

function normEffects(arr: unknown[] | undefined): string {
  return JSON.stringify(arr ?? []);
}

function main() {
  const files = fs.readdirSync(SETS_DIR).filter((f) => f.endsWith(".json"));
  let dup = 0;
  let instead = 0;
  let amorous = 0;
  let replicate = 0;
  const replicateWarnings: string[] = [];

  for (const file of files) {
    const filePath = path.join(SETS_DIR, file);
    const cards = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Card[];
    let changed = false;

    for (const card of cards) {
      if (DUPLICATE_IDS.has(card.id)) {
        if (card.superevolve?.length) {
          card.superevolve = [];
          dup++;
          changed = true;
        }
      }

      if (card.id === AMOROUS_ID) {
        const next = JSON.stringify(AMOROUS_SUPER_DRAIN_ONLY);
        if (normEffects(card.superevolve as unknown[]) !== next) {
          card.superevolve = structuredClone(AMOROUS_SUPER_DRAIN_ONLY) as Card["superevolve"];
          amorous++;
          changed = true;
        }
      }

      if (INSTEAD_IDS.has(card.id)) {
        if (card.superEvolveReplaces !== true) {
          card.superEvolveReplaces = true;
          instead++;
          changed = true;
        }
      }

      if (REPLICATE_IDS.has(card.id)) {
        const evo = card.evolve ?? [];
        const fan = card.fanfare ?? [];
        if (normEffects(evo as unknown[]) !== normEffects(fan as unknown[])) {
          replicateWarnings.push(
            `${card.id} ${card.name}: evolve[] !== fanfare[] before replicate migration`,
          );
        }
        if (normEffects(evo as unknown[]) !== normEffects(REPLICATE_OP)) {
          card.evolve = structuredClone(REPLICATE_OP) as Card["evolve"];
          replicate++;
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(cards, null, 2) + "\n", "utf-8");
      console.log(`Updated ${file}`);
    }
  }

  console.log(`DUPLICATE emptied: ${dup}`);
  console.log(`Amorous trimmed: ${amorous}`);
  console.log(`INSTEAD flagged: ${instead}`);
  console.log(`Replicate migrated: ${replicate}`);
  if (replicateWarnings.length) {
    console.warn("WARNINGS:");
    replicateWarnings.forEach((w) => console.warn("  ", w));
  }
}

main();
