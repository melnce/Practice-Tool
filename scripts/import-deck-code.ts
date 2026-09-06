#!/usr/bin/env tsx
/**
 * Import, export, and diff official Shadowverse: Worlds Beyond deck codes.
 *
 * Usage:
 *   npm run deck:code -- import "<url or hash>" --name "<Deck Name>" [--out decks/<file>.json] [--force]
 *   npm run deck:code -- diff "<url or hash>" decks/<file>.json
 *   npm run deck:code -- export decks/<file>.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildDeckCodeCatalog,
  deckFileFromHash,
  deckShareUrl,
  DeckCodeError,
  diffDeckFile,
  encodeDeckFile,
  extractDeckHash,
  type DeckCodeCard,
  type DeckFileObject,
} from "./lib/deckCode.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const CARDS_FILE = path.join(ROOT, "cards", "all.json");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function loadCatalog() {
  if (!fs.existsSync(CARDS_FILE)) {
    throw new DeckCodeError(
      "Missing cards/all.json — run npm run cards:update",
    );
  }
  const cards = readJson<DeckCodeCard[]>(CARDS_FILE);
  return buildDeckCodeCatalog(cards);
}

function usage(): never {
  console.error(`Usage:
  npm run deck:code -- import "<url or hash>" --name "<Deck Name>" [--out decks/<file>.json] [--force]
  npm run deck:code -- diff "<url or hash>" decks/<file>.json
  npm run deck:code -- export decks/<file>.json`);
  process.exit(1);
}

function parseFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new DeckCodeError(`Missing value for ${flag}`);
  }
  return value;
}

function printCardTable(deck: DeckFileObject): void {
  console.log(`\n${deck.deckName} (${deck.class}, ${deck.size} cards)\n`);
  console.log("Count  Card");
  console.log("─────  ────");
  for (const entry of deck.cards) {
    console.log(`${String(entry.count).padStart(5)}  ${entry.name}`);
  }
  console.log("");
}

function cmdImport(argv: string[]): void {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const input = positional[0];
  if (!input) usage();

  const name = parseFlag(argv, "--name");
  if (!name) {
    throw new DeckCodeError('import requires --name "<Deck Name>"');
  }

  const out =
    parseFlag(argv, "--out") ??
    path.join("decks", `${slugifyDeckName(name)}.json`);
  const force = argv.includes("--force");
  const catalog = loadCatalog();
  const hash = extractDeckHash(input);
  const deck = deckFileFromHash(hash, catalog, name);
  const outPath = path.isAbsolute(out) ? out : path.join(ROOT, out);

  if (fs.existsSync(outPath) && !force) {
    throw new DeckCodeError(
      `Refusing to overwrite existing file: ${path.relative(ROOT, outPath)} (use --force)`,
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(deck, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  printCardTable(deck);
}

function slugifyDeckName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function loadDeckFile(fileArg: string): DeckFileObject {
  const filePath = path.isAbsolute(fileArg)
    ? fileArg
    : path.join(ROOT, fileArg);
  if (!fs.existsSync(filePath)) {
    throw new DeckCodeError(`Deck file not found: ${fileArg}`);
  }
  return readJson<DeckFileObject>(filePath);
}

function printDiff(diff: ReturnType<typeof diffDeckFile>): void {
  if (diff.identical) {
    console.log("Deck matches the official hash.");
    return;
  }

  if (diff.classMismatch) {
    console.log(
      `Class mismatch: hash is ${diff.classMismatch.hashClass}, file is ${diff.classMismatch.fileClass}`,
    );
  }

  if (diff.added.length > 0) {
    console.log("\nAdded in hash (not in file):");
    for (const row of diff.added) {
      console.log(`  + ${row.name} ×${row.hashCount}`);
    }
  }

  if (diff.removed.length > 0) {
    console.log("\nRemoved from hash (only in file):");
    for (const row of diff.removed) {
      console.log(`  - ${row.name} ×${row.fileCount}`);
    }
  }

  if (diff.countChanged.length > 0) {
    console.log("\nCount changed:");
    for (const row of diff.countChanged) {
      console.log(
        `  ~ ${row.name}: hash ×${row.hashCount}, file ×${row.fileCount}`,
      );
    }
  }
}

function cmdDiff(argv: string[]): void {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const input = positional[0];
  const deckFileArg = positional[1];
  if (!input || !deckFileArg) usage();

  const catalog = loadCatalog();
  const hash = extractDeckHash(input);
  const deckFile = loadDeckFile(deckFileArg);
  const diff = diffDeckFile(hash, deckFile, catalog);
  printDiff(diff);
  process.exit(diff.identical ? 0 : 1);
}

function cmdExport(argv: string[]): void {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const deckFileArg = positional[0];
  if (!deckFileArg) usage();

  const catalog = loadCatalog();
  const deckFile = loadDeckFile(deckFileArg);
  const hash = encodeDeckFile(deckFile, catalog);
  const url = deckShareUrl(hash);

  console.log(hash);
  console.log(url);
}

function main(): void {
  const argv = process.argv.slice(2);
  const dashDash = argv.indexOf("--");
  const subargv = dashDash >= 0 ? argv.slice(dashDash + 1) : argv;
  const command = subargv[0];

  if (!command || command.startsWith("-")) {
    usage();
  }

  try {
    switch (command) {
      case "import":
        cmdImport(subargv.slice(1));
        break;
      case "diff":
        cmdDiff(subargv.slice(1));
        break;
      case "export":
        cmdExport(subargv.slice(1));
        break;
      default:
        usage();
    }
  } catch (error) {
    const message =
      error instanceof DeckCodeError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
