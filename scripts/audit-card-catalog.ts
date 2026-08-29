#!/usr/bin/env tsx
/**
 * Report-only audit: compare local catalog fields vs DotGG source for sets 10000–10008
 * and token_details.json. Does not mutate card data.
 *
 * Run: npx tsx scripts/audit-card-catalog.ts
 *      npx tsx scripts/audit-card-catalog.ts --json reports/catalog-audit.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import {
  CARD_TYPE_OVERRIDES,
  DOTGG_CARDS_URL,
  mapClass,
  mapDotggCardToRepo,
  type DotggCard,
  type RepoCard,
} from "./lib/ingestCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const TOKEN_FILE = path.join(ROOT, "cards/token_details.json");

const AUDIT_SET_IDS = new Set([
  "10000",
  "10001",
  "10002",
  "10003",
  "10004",
  "10005",
  "10006",
  "10007",
  "10008",
]);

const CATALOG_FIELDS = [
  "name",
  "cost",
  "attack",
  "defense",
  "class",
  "type",
] as const;

type CatalogField = (typeof CATALOG_FIELDS)[number];

type Mismatch = {
  id: string;
  field: CatalogField;
  local: string;
  source: string;
  setId: string;
  cardName: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function loadLocalCards(): RepoCard[] {
  const cards: RepoCard[] = [];
  const files = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    const setId = file.match(/^(\d+)_/)?.[1];
    if (!setId || !AUDIT_SET_IDS.has(setId)) continue;
    const json = JSON.parse(
      fs.readFileSync(path.join(SETS_DIR, file), "utf-8"),
    ) as RepoCard[];
    cards.push(...json);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8")) as RepoCard[];
  cards.push(...tokens);
  return cards;
}

function sourceCatalogFromDotgg(raw: DotggCard): Record<CatalogField, string> {
  const mapped = mapDotggCardToRepo(raw);
  return {
    name: mapped.name,
    cost: mapped.cost,
    attack: mapped.attack,
    defense: mapped.defense,
    class: mapped.class,
    type: mapped.type,
  };
}

function parseArgs(argv: string[]) {
  const jsonIdx = argv.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : undefined;
  return { jsonOut };
}

function printTable(mismatches: Mismatch[]) {
  console.log("\n=== Catalog mismatches (local vs DotGG source) ===\n");
  if (!mismatches.length) {
    console.log("  (none)");
    return;
  }
  console.log("| id | field | local | source | set | card |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const m of mismatches) {
    console.log(
      `| ${m.id} | ${m.field} | ${m.local.replace(/\|/g, "\\|")} | ${m.source.replace(/\|/g, "\\|")} | ${m.setId} | ${m.cardName.replace(/\|/g, "\\|")} |`,
    );
  }
}

async function main() {
  const { jsonOut } = parseArgs(process.argv.slice(2));

  console.log("Fetching DotGG card dump…");
  const apiCards = await fetchJson<DotggCard[]>(DOTGG_CARDS_URL);
  const byId = new Map<string, DotggCard>();
  for (const c of apiCards) byId.set(String(c.id), c);

  const localCards = loadLocalCards();
  const mismatches: Mismatch[] = [];
  const missingFromSource: string[] = [];

  for (const local of localCards) {
    const raw = byId.get(String(local.id));
    const setId =
      String(local.set).match(/\[(\d+)\]/)?.[1] ??
      (String(local.id).startsWith("900") ? "90000" : "?");

    if (!raw) {
      missingFromSource.push(`${local.id} ${local.name}`);
      continue;
    }

    const source = sourceCatalogFromDotgg(raw);
    for (const field of CATALOG_FIELDS) {
      const localVal = String(local[field] ?? "");
      const sourceVal = source[field];
      if (localVal === sourceVal) continue;

      // Type: trust CARD_TYPE_OVERRIDES and local when override applies
      if (field === "type" && CARD_TYPE_OVERRIDES[String(local.id)]) {
        continue;
      }

      mismatches.push({
        id: String(local.id),
        field,
        local: localVal,
        source: sourceVal,
        setId,
        cardName: local.name,
      });
    }
  }

  printTable(mismatches);

  if (missingFromSource.length) {
    console.log("\n=== Missing from DotGG dump ===\n");
    for (const row of missingFromSource) console.log(`  ${row}`);
  }

  console.log(
    `\nAudited ${localCards.length} local cards; ${mismatches.length} field mismatch(es).`,
  );

  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.writeFileSync(
      jsonOut,
      JSON.stringify({ mismatches, missingFromSource }, null, 2),
    );
    console.log(`Wrote ${jsonOut}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
