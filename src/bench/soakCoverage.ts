// src/bench/soakCoverage.ts
// Track which of the 735 main-pool cards were exercised during soak.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getGlobalCardIndex } from "../data/cardIndex.js";

export type CoverageBucket =
  | "playedFromHand"
  | "evolved"
  | "superEvolved"
  | "engaged"
  | "appearedOnBoard"
  | "appearedInGraveyard";

export type SoakCoverage = {
  totalPool: number;
  touched: number;
  untouched: number;
  byBucket: Record<CoverageBucket, number>;
  /** Sorted card ids never exercised in any bucket. */
  untouchedIds: string[];
  untouchedNames: string[];
  /** id → name for touched cards */
  touchedDetails: Record<string, { name: string; buckets: CoverageBucket[] }>;
};

/** Canonical 735-card pool from cards/all.json (excludes tokens + vanilla lab). */
export function loadMainPoolIds(): Map<string, string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const allPath = path.resolve(here, "../../cards/all.json");
  const all = JSON.parse(fs.readFileSync(allPath, "utf-8")) as Array<{
    id?: string;
    name?: string;
  }>;
  const map = new Map<string, string>();
  for (const c of all) {
    if (c.id != null && c.name) map.set(String(c.id), c.name);
  }
  return map;
}

export class CoverageTracker {
  private readonly poolIds: Set<string>;
  private readonly idToName: Map<string, string>;
  private readonly buckets = new Map<CoverageBucket, Set<string>>();

  constructor() {
    this.idToName = loadMainPoolIds();
    this.poolIds = new Set(this.idToName.keys());
    if (this.poolIds.size < 700) {
      throw new Error(
        `[soakCoverage] Expected ~735 main cards, got ${this.poolIds.size}`,
      );
    }

    for (const b of [
      "playedFromHand",
      "evolved",
      "superEvolved",
      "engaged",
      "appearedOnBoard",
      "appearedInGraveyard",
    ] as const) {
      this.buckets.set(b, new Set());
    }
  }

  mark(bucket: CoverageBucket, cardId: string | null | undefined): void {
    if (!cardId) return;
    const id = String(cardId);
    if (!this.poolIds.has(id)) return;
    this.buckets.get(bucket)!.add(id);
  }

  markByName(bucket: CoverageBucket, name: string | null | undefined): void {
    if (!name) return;
    const index = getGlobalCardIndex();
    const card = index?.byName.get(name);
    if (card?.id != null) this.mark(bucket, String(card.id));
  }

  report(): SoakCoverage {
    const touchedSet = new Set<string>();
    const touchedDetails: SoakCoverage["touchedDetails"] = {};
    const byBucket = {} as Record<CoverageBucket, number>;

    for (const [bucket, set] of this.buckets) {
      byBucket[bucket] = set.size;
      for (const id of set) {
        touchedSet.add(id);
        const entry = touchedDetails[id] ?? {
          name: this.idToName.get(id) ?? id,
          buckets: [],
        };
        entry.buckets.push(bucket);
        touchedDetails[id] = entry;
      }
    }

    const untouchedIds = [...this.poolIds]
      .filter((id) => !touchedSet.has(id))
      .sort();
    const untouchedNames = untouchedIds.map(
      (id) => this.idToName.get(id) ?? id,
    );

    return {
      totalPool: this.poolIds.size,
      touched: touchedSet.size,
      untouched: untouchedIds.length,
      byBucket,
      untouchedIds,
      untouchedNames,
      touchedDetails,
    };
  }
}
