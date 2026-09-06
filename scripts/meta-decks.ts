#!/usr/bin/env tsx
/**
 * Fetch WBArts Rotation meta decks, write decks/meta/, and diff against library.
 *
 * Usage:
 *   npm run decks:meta
 *   npm run decks:meta -- --days 7 --out decks/meta/
 *   npm run decks:meta -- --input reports/meta-decks/feed.json
 *   npm run decks:meta -- --no-diff-against
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildDeckCodeCatalog, type DeckCodeCard } from "./lib/deckCode.js";
import { writeFormattedJson } from "./lib/formatJson.js";
import {
  buildArchetypeMap,
  diffMetaAgainstLibrary,
  formatMetaDiffTable,
  listDroppedMetaDeckFiles,
  parseArchetypesFeed,
  parseDecksFeed,
  processMetaDeck,
  WBARTS_ARCHETYPES_URL,
  WBARTS_DECKS_URL,
  type LibraryDeckRef,
  type MetaDeckIndexEntry,
  type WbArtsDeck,
} from "./lib/metaDecks.js";
import {
  buildCardIndex,
  type BuildCardIndexInput,
} from "../src/data/cardIndex.js";
import { isRawDeckObject, type RawDeck } from "../src/data/rawDeck.js";
import type { DeckFileObject } from "./lib/deckCode.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const CARDS_FILE = path.join(ROOT, "cards", "all.json");
const TOKEN_FILE = path.join(ROOT, "cards", "token_details.json");
const DEFAULT_OUT = path.join(ROOT, "decks", "meta");
const DEFAULT_LIBRARY = path.join(ROOT, "decks");
const FETCH_USER_AGENT = "practice-tool-meta-decks/1.0";

interface CliOptions {
  days: number;
  outDir: string;
  input?: string;
  diffAgainst: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const daysIdx = argv.indexOf("--days");
  const outIdx = argv.indexOf("--out");
  const inputIdx = argv.indexOf("--input");
  const diffIdx = argv.indexOf("--diff-against");

  let diffAgainst: string | null = DEFAULT_LIBRARY;
  if (argv.includes("--no-diff-against")) {
    diffAgainst = null;
  } else if (diffIdx >= 0) {
    diffAgainst = argv[diffIdx + 1] ?? DEFAULT_LIBRARY;
  }

  return {
    days: daysIdx >= 0 ? Number(argv[daysIdx + 1]) : 7,
    outDir: outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT,
    input: inputIdx >= 0 ? argv[inputIdx + 1] : undefined,
    diffAgainst,
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": FETCH_USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  if (text.trimStart().startsWith("<!DOCTYPE")) {
    throw new Error(`Blocked or HTML response from ${url} (Cloudflare?)`);
  }
  return JSON.parse(text) as unknown;
}

function loadCatalog() {
  const cards = readJson<DeckCodeCard[]>(CARDS_FILE);
  return buildDeckCodeCatalog(cards);
}

function loadCardIndex() {
  const mainCards = readJson<BuildCardIndexInput["mainCards"]>(CARDS_FILE);
  const tokenCards = readJson<BuildCardIndexInput["tokenCards"]>(TOKEN_FILE);
  return buildCardIndex({ mainCards, tokenCards });
}

function loadLibraryDecks(dir: string): LibraryDeckRef[] {
  const decks: LibraryDeckRef[] = [];
  if (!fs.existsSync(dir)) return decks;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "manifest.json") continue;
    const filePath = path.join(dir, file);
    if (!fs.statSync(filePath).isFile()) continue;
    const raw = readJson<RawDeck>(filePath);
    if (!isRawDeckObject(raw)) continue;
    decks.push({
      file,
      deck: raw as DeckFileObject,
    });
  }

  return decks;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const fetchedAt = new Date().toISOString();
  const outDir = path.isAbsolute(opts.outDir)
    ? opts.outDir
    : path.join(ROOT, opts.outDir);

  if (!fs.existsSync(CARDS_FILE)) {
    console.error("Missing cards/all.json — run npm run cards:update");
    process.exit(1);
  }

  const catalog = loadCatalog();
  const index = loadCardIndex();

  let feedDecks: WbArtsDeck[];
  let archetypesBody: unknown;

  if (opts.input) {
    const inputPath = path.isAbsolute(opts.input)
      ? opts.input
      : path.join(ROOT, opts.input);
    console.log(`Reading feed from ${path.relative(ROOT, inputPath)}`);
    const body = readJson<unknown>(inputPath);
    feedDecks = parseDecksFeed(body);
    const archetypesPath = inputPath.replace(/feed\.json$/, "archetypes.json");
    if (fs.existsSync(archetypesPath)) {
      archetypesBody = readJson(archetypesPath);
    } else {
      archetypesBody = { archetypes: [] };
    }
  } else {
    const feedUrl = `${WBARTS_DECKS_URL}&days=${opts.days}`;
    console.log(`Fetching ${feedUrl}`);
    try {
      const [feedBody, archetypesFetched] = await Promise.all([
        fetchJson(feedUrl),
        fetchJson(WBARTS_ARCHETYPES_URL),
      ]);
      feedDecks = parseDecksFeed(feedBody);
      archetypesBody = archetypesFetched;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Network fetch failed: ${message}`);
      process.exit(1);
    }
  }

  const archetypes = buildArchetypeMap(parseArchetypesFeed(archetypesBody));
  const indexPath = path.join(outDir, "index.json");
  const oldIndex = fs.existsSync(indexPath)
    ? readJson<MetaDeckIndexEntry[]>(indexPath)
    : [];
  const skipped: { id: string; name: string; reasons: string[] }[] = [];
  const written: { id: string; file: string }[] = [];
  const processedForDiff: { id: string; deck: DeckFileObject }[] = [];
  const indexEntries: MetaDeckIndexEntry[] = [];

  fs.mkdirSync(outDir, { recursive: true });

  for (const feedDeck of feedDecks) {
    const result = processMetaDeck(
      feedDeck,
      archetypes,
      catalog,
      index,
      fetchedAt,
    );
    if (!result.ok) {
      skipped.push(result.skip);
      console.log(
        `SKIP ${feedDeck.id} (${feedDeck.name}): ${result.skip.reasons.join("; ")}`,
      );
      continue;
    }

    const outPath = path.join(outDir, result.result.filename);
    await writeFormattedJson(outPath, result.result.deck);
    written.push({ id: feedDeck.id, file: result.result.filename });
    processedForDiff.push({
      id: feedDeck.id,
      deck: result.result.deck,
    });
    indexEntries.push(result.result.indexEntry);
    console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  }

  await writeFormattedJson(indexPath, indexEntries);

  const droppedFiles = listDroppedMetaDeckFiles(oldIndex, indexEntries);
  for (const file of droppedFiles) {
    const filePath = path.join(outDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Removed (dropped from feed): ${file}`);
    }
  }

  console.log(
    `\nSummary: fetched ${feedDecks.length}, valid ${written.length}, skipped ${skipped.length}`,
  );
  if (skipped.length > 0) {
    console.log("\nSkipped decks:");
    for (const row of skipped) {
      console.log(`  ${row.id} (${row.name}): ${row.reasons.join("; ")}`);
    }
  }

  if (opts.diffAgainst) {
    const libDir = path.isAbsolute(opts.diffAgainst)
      ? opts.diffAgainst
      : path.join(ROOT, opts.diffAgainst);
    const library = loadLibraryDecks(libDir);
    const { metaRows, orphanRows } = diffMetaAgainstLibrary(
      processedForDiff,
      library,
    );
    const table = formatMetaDiffTable(metaRows, orphanRows);
    console.log("\n" + table);

    const reportsDir = path.join(ROOT, "reports", "meta-decks");
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, "diff-table.md");
    fs.writeFileSync(reportPath, table + "\n");
    console.log(`\nDiff table saved to ${path.relative(ROOT, reportPath)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
