/**
 * Shared card loader for gate scripts — set files plus token_details.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "../mergeSets.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..", "..");
export const TOKEN_FILE = path.join(ROOT, "cards", "token_details.json");

export type CardJson = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  fanfare?: unknown[];
  evolve?: unknown[];
  superevolve?: unknown[];
  spell?: unknown[];
  keywords?: unknown[];
  triggers?: unknown[];
  cant_play?: boolean;
  enhance_replaces_base?: unknown;
  [key: string]: unknown;
};

export type LoadedCard = {
  card: CardJson;
  /** Repo-relative path, e.g. cards/sets/10000_basic.json */
  sourceFile: string;
};

function listSetFiles(setFilter?: string): string[] {
  const files = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (!setFilter) return files.map((f) => path.join(SETS_DIR, f));
  const needle = setFilter.replace(/\.json$/, "");
  const match = files.filter(
    (f) => f === `${needle}.json` || f.includes(needle),
  );
  if (!match.length) {
    throw new Error(`No set file matching "${setFilter}" in ${SETS_DIR}`);
  }
  return match.map((f) => path.join(SETS_DIR, f));
}

function readCardArray(filePath: string): CardJson[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is CardJson =>
      c != null && typeof c === "object" && typeof c.id === "string",
  );
}

/**
 * Load cards from cards/sets/*.json (optionally filtered by --set=) plus
 * cards/token_details.json. Tokens are always included; --set= only filters set files.
 */
export function loadCardsForGates(setFilter?: string): LoadedCard[] {
  const loaded: LoadedCard[] = [];

  for (const filePath of listSetFiles(setFilter)) {
    const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
    for (const card of readCardArray(filePath)) {
      loaded.push({ card, sourceFile: rel });
    }
  }

  if (fs.existsSync(TOKEN_FILE)) {
    const rel = path.relative(ROOT, TOKEN_FILE).replace(/\\/g, "/");
    for (const card of readCardArray(TOKEN_FILE)) {
      loaded.push({ card, sourceFile: rel });
    }
  }

  return loaded;
}
