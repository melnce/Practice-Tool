/**
 * Load card JSON from all three card-data locations required by the vocabulary
 * campaign: cards/all.json, cards/sets/*.json, and cards/token_details.json.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "../mergeSets.js";
import type { CardJson } from "./loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..", "..");

export const ALL_JSON = path.join(ROOT, "cards", "all.json");
export const TOKEN_JSON = path.join(ROOT, "cards", "token_details.json");

export type CardDataSourceKind = "all.json" | "sets" | "token_details.json";

export type CardDataEntry = {
  card: CardJson;
  sourceKind: CardDataSourceKind;
  /** Repo-relative path, e.g. cards/sets/10000_basic.json */
  sourceFile: string;
};

function readCardArray(filePath: string): CardJson[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is CardJson =>
      c != null && typeof c === "object" && typeof c.id === "string",
  );
}

/**
 * Load every card from all three card-data locations. Set files and all.json may
 * overlap by id; callers dedupe when a unique pool is required.
 */
export function loadAllCardDataEntries(): CardDataEntry[] {
  const out: CardDataEntry[] = [];

  if (fs.existsSync(ALL_JSON)) {
    const rel = path.relative(ROOT, ALL_JSON).replace(/\\/g, "/");
    for (const card of readCardArray(ALL_JSON)) {
      out.push({ card, sourceKind: "all.json", sourceFile: rel });
    }
  }

  if (fs.existsSync(SETS_DIR)) {
    const files = fs
      .readdirSync(SETS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const filePath = path.join(SETS_DIR, file);
      const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
      for (const card of readCardArray(filePath)) {
        out.push({ card, sourceKind: "sets", sourceFile: rel });
      }
    }
  }

  if (fs.existsSync(TOKEN_JSON)) {
    const rel = path.relative(ROOT, TOKEN_JSON).replace(/\\/g, "/");
    for (const card of readCardArray(TOKEN_JSON)) {
      out.push({ card, sourceKind: "token_details.json", sourceFile: rel });
    }
  }

  return out;
}

/** Unique cards by id — prefers set file over all.json when both exist. */
export function loadUniqueCardsById(): Map<string, CardDataEntry> {
  const byId = new Map<string, CardDataEntry>();
  const priority: Record<CardDataSourceKind, number> = {
    "token_details.json": 3,
    sets: 2,
    "all.json": 1,
  };
  for (const entry of loadAllCardDataEntries()) {
    const existing = byId.get(entry.card.id);
    if (
      !existing ||
      priority[entry.sourceKind] > priority[existing.sourceKind]
    ) {
      byId.set(entry.card.id, entry);
    }
  }
  return byId;
}

export function isTokenEntry(entry: CardDataEntry): boolean {
  return entry.sourceKind === "token_details.json";
}
