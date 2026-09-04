#!/usr/bin/env tsx
/**
 * Repeatable card ingest from DotGG (api.dotgg.gg).
 *
 * Usage:
 *   npm run ingest:cards
 *   npm run ingest:cards -- --dry-run
 *   npm run ingest:cards -- --fixture scripts/fixtures/dotgg-cards-sample.json
 *   npm run ingest:cards -- --sets 10005,10006
 *
 * INVARIANT: merge-by-id never clobbers authored fanfare/spell/evolve/triggers/keywords.
 * After a real write, run `npm run cards:update` to rebuild all.json / index.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import {
  CYGAMES_CARDSET_URL,
  DOTGG_CARDS_URL,
  DOTGG_SETS_URL,
  crossCheckCygamesSets,
  mergeSetCards,
  planIngest,
  readSetFile,
  summarizeChanges,
  writeSetFile,
  type DotggCard,
  type DotggSet,
  type MergeChange,
} from "./lib/ingestCards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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
  const setsIdx = argv.indexOf("--sets");
  const setsArg = setsIdx >= 0 ? argv[setsIdx + 1] : undefined;
  const setFilter = setsArg
    ? new Set(
        setsArg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : undefined;
  const skipCrossCheck = argv.includes("--skip-cross-check");
  const noMergeUpdate = argv.includes("--no-cards-update");
  return { dryRun, fixture, setFilter, skipCrossCheck, noMergeUpdate };
}

function printChangeSummary(label: string, changes: MergeChange[]) {
  const { newCards, filled, textDiffs, unchanged } = summarizeChanges(changes);
  console.log(`\n=== ${label} ===`);
  console.log(`  new cards:        ${newCards.length}`);
  console.log(`  fields filled:    ${filled.length}`);
  console.log(`  text diffs (info, not applied): ${textDiffs.length}`);
  console.log(`  unchanged:        ${unchanged}`);
  if (newCards.length && newCards.length <= 40) {
    for (const c of newCards) {
      if (c.kind === "new") console.log(`    + ${c.id} ${c.name}`);
    }
  } else if (newCards.length > 40) {
    for (const c of newCards.slice(0, 20)) {
      if (c.kind === "new") console.log(`    + ${c.id} ${c.name}`);
    }
    console.log(`    … and ${newCards.length - 20} more`);
  }
  if (textDiffs.length && textDiffs.length <= 10) {
    for (const c of textDiffs) {
      if (c.kind === "text_diff") {
        console.log(`    ~ text ${c.id} ${c.name}`);
      }
    }
  }
}

async function loadSources(opts: {
  fixture?: string;
  skipCrossCheck: boolean;
}): Promise<{
  cards: DotggCard[];
  sets: DotggSet[];
  warnings: string[];
  liveFetch: boolean;
}> {
  const warnings: string[] = [];

  if (opts.fixture) {
    const fixturePath = path.isAbsolute(opts.fixture)
      ? opts.fixture
      : path.join(ROOT, opts.fixture);
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
      cards: DotggCard[];
      sets: DotggSet[];
    };
    return {
      cards: raw.cards,
      sets: raw.sets,
      warnings: [
        `Using fixture ${path.relative(ROOT, fixturePath)} (live fetch skipped)`,
      ],
      liveFetch: false,
    };
  }

  console.log(`Fetching ${DOTGG_CARDS_URL}`);
  const cards = await fetchJson<DotggCard[]>(DOTGG_CARDS_URL);
  console.log(`Fetching ${DOTGG_SETS_URL}`);
  const sets = await fetchJson<DotggSet[]>(DOTGG_SETS_URL);

  if (!opts.skipCrossCheck) {
    try {
      console.log(`Cross-checking ${CYGAMES_CARDSET_URL}`);
      const cygames = await fetchJson<unknown>(CYGAMES_CARDSET_URL);
      warnings.push(...crossCheckCygamesSets(sets, cygames));
    } catch (err) {
      warnings.push(
        `Cygames CardSet cross-check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { cards, sets, warnings, liveFetch: true };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const {
    cards,
    sets,
    warnings: fetchWarnings,
    liveFetch,
  } = await loadSources(opts);

  const plan = planIngest(cards, sets);
  const warnings = [...fetchWarnings, ...plan.warnings];

  console.log(
    `\nDotGG dump: ${cards.length} rows → ${plan.collectibleCount} collectible (100xx) + tokens skipped=${plan.tokenCount}`,
  );
  console.log(`Sets planned: ${[...plan.sets.keys()].sort().join(", ")}`);

  if (warnings.length) {
    console.warn("\n*** WARNINGS ***");
    for (const w of warnings) console.warn(`  ! ${w}`);
    console.warn("****************\n");
  }

  let totalNew = 0;
  const allChanges: MergeChange[] = [];

  for (const setId of [...plan.sets.keys()].sort()) {
    if (opts.setFilter && !opts.setFilter.has(setId)) continue;
    const bucket = plan.sets.get(setId)!;
    const filePath = path.join(SETS_DIR, bucket.fileName);

    // Prefer existing file even if slug renamed — match by set id prefix
    let existingPath = filePath;
    if (!fs.existsSync(existingPath)) {
      const alt = fs
        .readdirSync(SETS_DIR)
        .find((f) => f.startsWith(`${setId}_`) && f.endsWith(".json"));
      if (alt) existingPath = path.join(SETS_DIR, alt);
    }

    const existing = readSetFile(existingPath);
    const { cards: merged, changes } = mergeSetCards(existing, bucket.incoming);
    allChanges.push(...changes);
    const summary = summarizeChanges(changes);
    totalNew += summary.newCards.length;
    printChangeSummary(
      `${setId} → ${path.basename(existingPath || bucket.fileName)}`,
      changes,
    );

    if (!opts.dryRun) {
      const outPath = fs.existsSync(existingPath)
        ? existingPath
        : path.join(SETS_DIR, bucket.fileName);
      writeSetFile(outPath, merged);
      console.log(`  wrote ${outPath} (${merged.length} cards)`);
    } else {
      console.log(
        `  dry-run: would write ${bucket.fileName} (${merged.length} cards)`,
      );
    }
  }

  console.log("\n———");
  console.log(
    opts.dryRun
      ? `Dry-run complete. Would add ${totalNew} new card(s). Authored ops untouched.`
      : `Ingest complete. Added ${totalNew} new card(s). Authored ops untouched.`,
  );
  if (!liveFetch) {
    console.log(
      "NOTE: Ran from fixture — live DotGG/Cygames fetch was not exercised.",
    );
  }

  if (!opts.dryRun && !opts.noMergeUpdate && totalNew >= 0) {
    // Always rebuild index after writes so all.json stays in sync
    const { mergeSetsFromDisk, writeMergedCardsToDisk } =
      await import("./mergeSets.js");
    const { allCards, indexData } = mergeSetsFromDisk();
    await writeMergedCardsToDisk(allCards, indexData);
    console.log(
      `Rebuilt cards/all.json (${allCards.length} cards) and cards/index.json`,
    );
  } else if (opts.dryRun) {
    console.log("Skipped cards:update (dry-run).");
  }

  // Exit non-zero only on hard failures (already thrown). Warnings stay warnings.
  void allChanges;
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
