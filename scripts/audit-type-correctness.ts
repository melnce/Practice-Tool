#!/usr/bin/env tsx
/**
 * Full Spell/Amulet type audit — text-first derivation vs current JSON type.
 * Writes reports/type-audit.json (informational; CI gate is check-card-text).
 *
 * Run: npx tsx scripts/audit-type-correctness.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import {
  auditSpellAmuletTypes,
  type CardForTypeAudit,
} from "./lib/typeAudit.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

function loadAllCards(): CardForTypeAudit[] {
  const files = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const cards: CardForTypeAudit[] = [];
  for (const f of files) {
    const batch = JSON.parse(
      fs.readFileSync(path.join(SETS_DIR, f), "utf-8"),
    ) as CardForTypeAudit[];
    cards.push(...batch);
  }
  return cards;
}

function main() {
  const allCards = loadAllCards();
  const rows = auditSpellAmuletTypes(allCards);
  const contradictions = rows.filter((r) => r.contradiction);

  const report = {
    generated_at: new Date().toISOString(),
    calibration: {
      "10543310": "Sloth of the Crestpetal — confirmed Spell",
      "10342210": "Nation of Disdain — confirmed Amulet",
    },
    totals: {
      spell_amulet_scanned: rows.length,
      spells: rows.filter((r) => r.current === "Spell").length,
      amulets: rows.filter((r) => r.current === "Amulet").length,
      contradictions: contradictions.length,
    },
    owner_questions: [] as {
      id: string;
      name: string;
      reading_a: string;
      reading_b: string;
    }[],
    contradictions,
    scan_table: rows,
  };

  const outPath = path.join(ROOT, "reports", "type-audit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log(`📋 Type audit: ${rows.length} Spell/Amulet cards scanned`);
  console.log(`   Contradictions: ${contradictions.length}`);
  console.log(`   → ${path.relative(ROOT, outPath)}`);

  if (contradictions.length) {
    console.log("\n❌ Contradictions:");
    for (const c of contradictions) {
      console.log(
        `  [${c.id}] ${c.name}: ${c.current} → derived ${c.derived} (${c.markers.join(", ")})`,
      );
    }
    process.exit(1);
  }
}

main();
