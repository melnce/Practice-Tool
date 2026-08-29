#!/usr/bin/env tsx
/**
 * Ingest Basic A (set 90000) tokens into cards/token_details.json.
 *
 * Also pulls any token referenced by summon/add_to_hand/crest ops in the main pool
 * when it exists in DotGG as a token or Basic A row.
 *
 * Usage:
 *   npm run ingest:tokens
 *   npm run ingest:tokens -- --dry-run
 *   npm run ingest:tokens -- --fixture scripts/fixtures/dotgg-cards-sample.json
 *
 * INVARIANT: merge-by-id never clobbers authored fanfare/spell/evolve/triggers/keywords.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import {
  DOTGG_CARDS_URL,
  mergeSetCards,
  planTokenIngest,
  readSetFile,
  summarizeChanges,
  writeSetFile,
  type DotggCard,
  type MergeChange,
  type RepoCard,
} from "./lib/ingestCards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TOKEN_FILE = path.join(ROOT, "cards", "token_details.json");

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const fixtureIdx = argv.indexOf("--fixture");
  const fixture = fixtureIdx >= 0 ? argv[fixtureIdx + 1] : undefined;
  return { dryRun, fixture };
}

function loadPoolCards(): RepoCard[] {
  const cards: RepoCard[] = [];
  if (!fs.existsSync(SETS_DIR)) return cards;
  for (const file of fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))) {
    cards.push(...readSetFile(path.join(SETS_DIR, file)));
  }
  return cards;
}

async function loadDotggCards(fixture?: string): Promise<DotggCard[]> {
  if (fixture) {
    const fixturePath = path.isAbsolute(fixture)
      ? fixture
      : path.join(ROOT, fixture);
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      cards: DotggCard[];
    };
    return raw.cards;
  }
  console.log(`Fetching ${DOTGG_CARDS_URL}`);
  return await fetchJson<DotggCard[]>(DOTGG_CARDS_URL);
}

function printDanglingScan(
  dangling: ReturnType<typeof planTokenIngest>["danglingAfter"],
): void {
  console.log("\n=== Dangling named-reference scan ===");
  if (!dangling.length) {
    console.log("  zero dangling references");
    return;
  }
  for (const row of dangling) {
    const sample = row.refs
      .slice(0, 3)
      .map((r) => `${r.id} ${r.cardName} (${r.op})`)
      .join("; ");
    console.log(`  ! ${row.name} — ${row.refs.length} ref(s): ${sample}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiCards = await loadDotggCards(opts.fixture);
  const poolCards = loadPoolCards();
  const existing = fs.existsSync(TOKEN_FILE)
    ? (JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8")) as RepoCard[])
    : [];

  const plan = planTokenIngest(apiCards, poolCards, existing);

  console.log(
    `\nDotGG Basic A rows: ${plan.basicACount}; extra referenced pulls: ${plan.referencedPullCount}`,
  );
  console.log(`Existing token_details.json: ${existing.length} tokens`);
  console.log(`Incoming merge batch: ${plan.incoming.length} tokens`);

  if (plan.warnings.length) {
    console.warn("\n*** WARNINGS ***");
    for (const w of plan.warnings) console.warn(`  ! ${w}`);
    console.warn("****************\n");
  }

  const { cards: merged, changes } = mergeSetCards(existing, plan.incoming);
  const { newCards } = summarizeChanges(changes);

  console.log(`\n=== token_details.json ===`);
  console.log(`  new tokens: ${newCards.length}`);
  if (newCards.length && newCards.length <= 30) {
    for (const c of newCards) {
      if (c.kind === "new") console.log(`    + ${c.id} ${c.name}`);
    }
  } else if (newCards.length > 30) {
    for (const c of newCards.slice(0, 15)) {
      if (c.kind === "new") console.log(`    + ${c.id} ${c.name}`);
    }
    console.log(`    … and ${newCards.length - 15} more`);
  }

  printDanglingScan(plan.danglingAfter);

  if (!opts.dryRun) {
    writeSetFile(TOKEN_FILE, merged);
    console.log(`\nWrote ${TOKEN_FILE} (${merged.length} tokens)`);
  } else {
    console.log(`\nDry-run: would write ${merged.length} tokens`);
  }

  console.log(
    opts.dryRun
      ? `\nDry-run complete. Would add ${newCards.length} token(s).`
      : `\nIngest complete. Added ${newCards.length} token(s). Authored ops untouched.`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export type { MergeChange };
