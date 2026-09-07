/**
 * Committed class deck library — size, copy limit, name resolution, class legality.
 * Prevents card-data churn from silently rotting decks/*.json that we ship.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildCardIndex,
  type BuildCardIndexInput,
} from "../../src/data/cardIndex.js";
import { expandDeckEntries } from "../../src/data/deckExpand.js";
import {
  REFERENCE_COPY_LIMIT,
  REFERENCE_DECK_SIZE,
  validateDeckRaw,
} from "../../src/data/deckValidation.js";
import { isRawDeckObject, type RawDeck } from "../../src/data/rawDeck.js";
import {
  shippedDeckFiles,
  type DeckManifest,
} from "../../src/data/deckManifest.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DECKS_DIR = path.join(ROOT, "decks");
const CARDS_DIR = path.join(ROOT, "cards");
const MANIFEST_FILE = path.join(DECKS_DIR, "manifest.json");

function loadCommittedClassDecks(): string[] {
  const manifest = readJson(MANIFEST_FILE) as DeckManifest;
  return shippedDeckFiles(manifest);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function loadCardIndex() {
  const mainCards = readJson(
    path.join(CARDS_DIR, "all.json"),
  ) as BuildCardIndexInput["mainCards"];
  const tokenCards = readJson(
    path.join(CARDS_DIR, "token_details.json"),
  ) as BuildCardIndexInput["tokenCards"];
  const vanillaFile = path.join(CARDS_DIR, "vanilla_lab_set.json");
  const mergedMain = fs.existsSync(vanillaFile)
    ? [
        ...mainCards,
        ...(readJson(vanillaFile) as BuildCardIndexInput["mainCards"]),
      ]
    : mainCards;
  return buildCardIndex({ mainCards: mergedMain, tokenCards });
}

describe("committed class deck library", () => {
  const index = loadCardIndex();
  const COMMITTED_CLASS_DECKS = loadCommittedClassDecks();

  it("manifest lists every shipped deck file on disk", () => {
    expect(COMMITTED_CLASS_DECKS.length).toBeGreaterThanOrEqual(7);
    for (const file of COMMITTED_CLASS_DECKS) {
      expect(fs.existsSync(path.join(DECKS_DIR, file)), `missing ${file}`).toBe(
        true,
      );
    }
  });

  it.each(COMMITTED_CLASS_DECKS)(
    "%s is valid (40 cards, copy limit, names resolve)",
    (file) => {
      const raw = readJson(path.join(DECKS_DIR, file));
      const result = validateDeckRaw(raw, file, index);
      expect(result.ok, result.issues.map((i) => i.message).join("; ")).toBe(
        true,
      );
      expect(result.warnings).toEqual([]);
      expect(result.cardCount).toBe(REFERENCE_DECK_SIZE);
    },
  );

  it.each(COMMITTED_CLASS_DECKS)(
    "%s only uses its class + Neutral cards",
    (file) => {
      const raw = readJson(path.join(DECKS_DIR, file)) as RawDeck;
      expect(isRawDeckObject(raw)).toBe(true);
      if (!isRawDeckObject(raw)) return;

      expect(typeof raw.class).toBe("string");
      expect(raw.class).not.toBe("Neutral");
      expect(raw.size).toBe(REFERENCE_DECK_SIZE);
      expect(typeof raw.deckName).toBe("string");
      expect(raw.deckName!.length).toBeGreaterThan(0);

      const entries = expandDeckEntries(raw);
      expect(entries.length).toBe(REFERENCE_DECK_SIZE);

      const counts = new Map<string, number>();
      for (const entry of entries) {
        expect(entry.name, "deck entries must use name").toBeTruthy();
        const name = entry.name!;
        counts.set(name, (counts.get(name) ?? 0) + 1);

        const card =
          index.byName.get(name) ?? index.tokensByName.get(name) ?? null;
        expect(card, `unknown card "${name}"`).toBeTruthy();
        if (!card) continue;
        expect(
          card.class === raw.class || card.class === "Neutral",
          `"${name}" is ${card.class}, deck is ${raw.class}`,
        ).toBe(true);
      }

      for (const [name, count] of counts) {
        expect(
          count,
          `"${name}" appears ${count} times (limit ${REFERENCE_COPY_LIMIT})`,
        ).toBeLessThanOrEqual(REFERENCE_COPY_LIMIT);
      }
    },
  );

  it("covers all seven craft classes", () => {
    const classes = COMMITTED_CLASS_DECKS.map((file) => {
      const raw = readJson(path.join(DECKS_DIR, file)) as RawDeck;
      expect(isRawDeckObject(raw)).toBe(true);
      return isRawDeckObject(raw) ? raw.class : undefined;
    });
    const unique = new Set(classes);
    expect(unique.size).toBe(7);
    expect([...unique].sort()).toEqual(
      [
        "Abysscraft",
        "Dragoncraft",
        "Forestcraft",
        "Havencraft",
        "Portalcraft",
        "Runecraft",
        "Swordcraft",
      ].sort(),
    );
  });
});
