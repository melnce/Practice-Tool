/**
 * Decklist paste import: formats, unmatched reporting, validation, coverage,
 * round-trip export → import.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildCardIndex,
  type BuildCardIndexInput,
} from "../../src/data/cardIndex.js";
import {
  exportDecklistText,
  importDecklistFromText,
  matchDecklistEntries,
} from "../../src/data/deckImport.js";
import {
  formatDecklistText,
  normalizeCardNameKey,
  parseDecklistText,
} from "../../src/data/decklistText.js";
import {
  clearImportedDecks,
  exportImportedDeckJson,
  getImportedDeck,
  importDeckFromJsonText,
  resetImportedDeckLibraryForTests,
  saveImportedDeck,
} from "../../src/data/importedDeckStore.js";
import { expandDeckEntries } from "../../src/data/deckExpand.js";
import { REFERENCE_DECK_SIZE } from "../../src/data/deckValidation.js";
import type { RawDeckObject } from "../../src/data/rawDeck.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function loadCardIndex() {
  const mainCards = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
  ) as BuildCardIndexInput["mainCards"];
  const tokenCards = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
  ) as BuildCardIndexInput["tokenCards"];
  return buildCardIndex({ mainCards, tokenCards });
}

/** Build a valid 40-card Forest paste from the shipped house deck. */
function forestHousePaste(format: "nx" | "n" | "xn" | "plain"): string {
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "decks/forestcraft_combo.json"), "utf-8"),
  ) as RawDeckObject;
  const lines: string[] = ["Main Deck", ""];
  for (const c of raw.cards ?? []) {
    const name = c.name!;
    const count = c.count ?? 1;
    if (format === "nx") lines.push(`${count}x ${name}`);
    else if (format === "n") lines.push(`${count} ${name}`);
    else if (format === "xn") lines.push(`${name} x${count}`);
    else {
      for (let i = 0; i < count; i++) lines.push(name);
    }
  }
  lines.push("");
  lines.push("// end");
  return lines.join("\n");
}

function countsFromRaw(raw: RawDeckObject): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of expandDeckEntries(raw)) {
    const n = e.name!;
    m.set(n, (m.get(n) ?? 0) + 1);
  }
  return m;
}

describe("decklist text parse + normalize", () => {
  it("normalizes punctuation and case for matching", () => {
    expect(normalizeCardNameKey("May, Journey Elf")).toBe(
      normalizeCardNameKey("may journey elf"),
    );
    expect(normalizeCardNameKey("Remi & Rami, Two-Faced Witch")).toBe(
      normalizeCardNameKey("remi and rami two faced witch"),
    );
  });

  it("parses all four entry shapes", () => {
    const text = [
      "3x May, Journey Elf",
      "2 Fairy Tamer",
      "Bestial Swipe x3",
      "Garden's Allure",
      "Garden's Allure",
    ].join("\n");
    const parsed = parseDecklistText(text);
    expect(parsed.entries.map((e) => [e.rawName, e.count])).toEqual([
      ["May, Journey Elf", 3],
      ["Fairy Tamer", 2],
      ["Bestial Swipe", 3],
      ["Garden's Allure", 1],
      ["Garden's Allure", 1],
    ]);
  });
});

describe("decklist import", () => {
  const index = loadCardIndex();

  beforeEach(() => {
    resetImportedDeckLibraryForTests();
  });

  it("each accepted paste format parses to the same deck", () => {
    const formats = ["nx", "n", "xn", "plain"] as const;
    const results = formats.map((f) =>
      importDecklistFromText(forestHousePaste(f), index, {
        deckName: "Forest Test",
      }),
    );
    for (const r of results) {
      expect(r.unmatched, r.messages.join("; ")).toEqual([]);
      expect(r.ok, r.messages.join("; ")).toBe(true);
      expect(r.validation.cardCount).toBe(REFERENCE_DECK_SIZE);
      expect(r.raw?.class).toBe("Forestcraft");
    }
    const canonical = countsFromRaw(results[0]!.raw!);
    for (const r of results.slice(1)) {
      expect(countsFromRaw(r.raw!)).toEqual(canonical);
    }
  });

  it("reports unmatched names instead of swallowing them", () => {
    const text = [
      "3x May, Journey Elf",
      "3x Not A Real Card Name XYZ",
      "2 Fairy Tamer",
    ].join("\n");
    const result = importDecklistFromText(text, index);
    expect(result.ok).toBe(false);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.rawName).toMatch(/Not A Real Card/);
    expect(result.messages.some((m) => /Unmatched line/.test(m))).toBe(true);
    // Matched cards are still visible, but ok is false so callers cannot trap
    expect(result.matched.some((m) => m.name === "May, Journey Elf")).toBe(
      true,
    );
  });

  it("fails validation for wrong size with a clear message", () => {
    const text = "3x May, Journey Elf\n3x Fairy Tamer\n";
    const result = importDecklistFromText(text, index, {
      deckName: "Tiny",
    });
    expect(result.ok).toBe(false);
    expect(
      result.validation.issues.some(
        (i) => i.kind === "size" && /must be 40/.test(i.message),
      ),
    ).toBe(true);
  });

  it("fails validation for over-limit copies with a clear message", () => {
    // 14 unique × 3 = 42 → trim to force 4 of one card inside a 40-ish list
    const base = forestHousePaste("nx");
    const text = base.replace(/3x May, Journey Elf/, "4x May, Journey Elf");
    // 4+ rest: house deck was 40 with 3x May → now 41
    const result = importDecklistFromText(text, index);
    expect(result.ok).toBe(false);
    expect(
      result.validation.issues.some(
        (i) =>
          i.kind === "copy_limit" &&
          /May, Journey Elf/.test(i.message) &&
          /4/.test(i.message),
      ),
    ).toBe(true);
  });

  it("produces a coverage warning for unimplemented cards", () => {
    // Build a 40-card Neutral list that includes unimplemented cards
    const unimplemented = [...index.byName.values()].filter(
      (c) =>
        c.implementationStatus === "unimplemented" && c.class === "Neutral",
    );
    expect(unimplemented.length).toBeGreaterThan(0);
    const vanillas = [...index.byName.values()].filter(
      (c) =>
        c.class === "Neutral" &&
        c.implementationStatus === "implemented" &&
        c.type === "Follower",
    );
    const cards: { name: string; count: number }[] = [];
    // 3 copies of first unimplemented
    cards.push({ name: unimplemented[0]!.name!, count: 3 });
    let need = 37;
    for (const v of vanillas) {
      if (need <= 0) break;
      if (v.name === unimplemented[0]!.name) continue;
      const n = Math.min(3, need);
      cards.push({ name: v.name!, count: n });
      need -= n;
    }
    expect(need).toBe(0);
    const text = formatDecklistText(cards);
    const result = importDecklistFromText(text, index, {
      deckName: "Coverage Probe",
      deckClass: "Neutral",
    });
    expect(result.unmatched).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.coverage.length).toBeGreaterThan(0);
    expect(result.coverage.some((c) => c.status === "unimplemented")).toBe(
      true,
    );
    expect(result.messages.some((m) => /Coverage warning/.test(m))).toBe(true);
  });

  it("round-trip: import → export → import yields an identical deck", () => {
    const first = importDecklistFromText(forestHousePaste("n"), index, {
      deckName: "Round Trip",
    });
    expect(first.ok).toBe(true);
    const exported = exportDecklistText(first.raw!);
    const second = importDecklistFromText(exported, index, {
      deckName: "Round Trip",
    });
    expect(second.ok).toBe(true);
    expect(countsFromRaw(second.raw!)).toEqual(countsFromRaw(first.raw!));
    expect(second.raw!.class).toBe(first.raw!.class);
  });

  it("saves imported decks into the session library for selectors", () => {
    const result = importDecklistFromText(forestHousePaste("nx"), index, {
      deckName: "Meta Forest",
    });
    expect(result.ok).toBe(true);
    const rec = saveImportedDeck({
      raw: result.raw!,
      label: "Meta Forest",
      source: "paste",
    });
    expect(getImportedDeck(rec.id)?.label).toBe("Meta Forest");
    const json = exportImportedDeckJson(rec.id);
    clearImportedDecks();
    expect(getImportedDeck(rec.id)).toBeNull();
    const again = importDeckFromJsonText(json);
    expect(again.label).toBe("Meta Forest");
    expect(countsFromRaw(again.raw)).toEqual(countsFromRaw(result.raw!));
  });

  it("matches forgiving punctuation against the index", () => {
    const parsed = parseDecklistText("3x may journey elf");
    const match = matchDecklistEntries(parsed.entries, index);
    expect(match.unmatched).toEqual([]);
    expect(match.matched[0]?.name).toBe("May, Journey Elf");
  });
});
