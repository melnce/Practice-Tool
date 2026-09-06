import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildDeckCodeCatalog,
  decodeCardToken,
  deckFileFromHash,
  diffDeckFile,
  encodeCardId,
  encodeDeckHash,
  extractDeckHash,
  parseDeckHash,
  type DeckCodeCard,
  type DeckFileObject,
} from "../../scripts/lib/deckCode.js";
import { validateDeckRaw } from "../../src/data/deckValidation.js";
import {
  buildCardIndex,
  type BuildCardIndexInput,
} from "../../src/data/cardIndex.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/deck-code");

type OfficialFixture = {
  hash: string;
  url: string;
  classId: number;
  className: string;
  cards: { name: string; count: number }[];
};

function loadFixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8"),
  ) as T;
}

function loadCatalogFromAllJson() {
  const cards = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
  ) as DeckCodeCard[];
  return buildDeckCodeCatalog(cards);
}

function loadCardIndex() {
  const mainCards = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
  ) as BuildCardIndexInput["mainCards"];
  const tokenCards = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
  ) as BuildCardIndexInput["tokenCards"];
  return buildCardIndex({ mainCards, tokenCards });
}

describe("deck code codec", () => {
  const official = loadFixture<OfficialFixture>("abysscraft-official.json");
  let catalog = buildDeckCodeCatalog([]);

  beforeAll(() => {
    catalog = loadCatalogFromAllJson();
  });

  it("encodes and decodes known card ids", () => {
    expect(encodeCardId("10001110")).toBe("c9hM");
    expect(decodeCardToken("c9hM")).toBe(10001110);
    expect(encodeCardId("10624110")).toBe("eXnk");
    expect(decodeCardToken("eXnk")).toBe(10624110);
  });

  it("decodes the official Abysscraft fixture", () => {
    const parsed = parseDeckHash(official.hash, catalog);
    expect(parsed.classId).toBe(official.classId);
    expect(parsed.className).toBe(official.className);
    expect(parsed.cardIds).toHaveLength(40);

    const deck = deckFileFromHash(
      official.hash,
      catalog,
      "Official Abysscraft",
    );
    expect(deck.class).toBe(official.className);
    expect(deck.size).toBe(40);
    expect(deck.cards).toEqual(official.cards);
  });

  it("round-trips encodeDeckHash(parseDeckHash(h)) === h", () => {
    const parsed = parseDeckHash(official.hash, catalog);
    const roundTrip = encodeDeckHash({
      formatId: parsed.formatId,
      classId: parsed.classId,
      cardIds: parsed.cardIds,
    });
    expect(roundTrip).toBe(official.hash);
  });

  it("extracts the hash from the full URL and a percent-encoded copy", () => {
    expect(extractDeckHash(official.url)).toBe(official.hash);
    const encoded = encodeURIComponent(official.url);
    expect(extractDeckHash(encoded)).toBe(official.hash);
  });

  it("rejects a token with an invalid symbol", () => {
    const badHash = official.hash.replace("er5g", "er*g");
    expect(() => parseDeckHash(badHash, catalog)).toThrow(/token "er\*g"/);
  });

  it("rejects 39 and 41 card tokens", () => {
    const parts = official.hash.split(".");
    const tooFew = parts.slice(0, -1).join(".");
    const tooMany = `${official.hash}.abcd`;
    expect(() => parseDeckHash(tooFew, catalog)).toThrow(/39 card tokens/);
    expect(() => parseDeckHash(tooMany, catalog)).toThrow(/41 card tokens/);
  });

  it("rejects a fourth copy of a card", () => {
    const parts = official.hash.split(".");
    const willsUnitedToken = parts[4];
    const fourthCopy = [...parts.slice(0, -1), willsUnitedToken].join(".");
    expect(() => parseDeckHash(fourthCopy, catalog)).toThrow(
      /Wills United \(10803310\).*4 times/,
    );
  });

  it("rejects a Swordcraft card in a class-5 hash", () => {
    const swordToken = encodeCardId("10021110");
    const parts = official.hash.split(".");
    parts[2] = swordToken;
    const badHash = parts.join(".");
    expect(() => parseDeckHash(badHash, catalog)).toThrow(
      /Flashstep Quickblader.*Swordcraft/,
    );
  });

  it("rejects token id 90021110", () => {
    expect(() => encodeCardId("90021110")).toThrow(/90021110.*token/);
  });

  it("diffDeckFile reports one removal and one addition for a swapped card", () => {
    const swapped = loadFixture<DeckFileObject>("diff-swapped.json");
    const diff = diffDeckFile(official.hash, swapped, catalog);
    expect(diff.identical).toBe(false);
    expect(diff.added).toEqual([
      { name: "Alabaster Bahamut", hashCount: 1, fileCount: 0 },
    ]);
    expect(diff.removed).toEqual([
      { name: "Flashstep Quickblader", hashCount: 0, fileCount: 1 },
    ]);
    expect(diff.countChanged).toEqual([]);
  });

  it("deckFileFromHash output passes validateDeckRaw", () => {
    const deck = deckFileFromHash(
      official.hash,
      catalog,
      "Official Abysscraft",
    );
    const index = loadCardIndex();
    const result = validateDeckRaw(deck, "official-abysscraft.json", index);
    expect(result.ok).toBe(true);
    expect(result.cardCount).toBe(40);
  });
});
