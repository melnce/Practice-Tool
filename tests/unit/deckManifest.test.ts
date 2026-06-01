import { describe, it, expect } from "vitest";
import {
  buildManifestFromFilenames,
  DECK_FILE_EXCLUDE,
} from "../../src/data/deckManifest.js";

describe("deckManifest", () => {
  it("excludes non-deck files and groups test decks", () => {
    const manifest = buildManifestFromFilenames([
      "index.json",
      "all_cards.json",
      "manifest.json",
      "starter_deck.json",
      "0_testing_basic.json",
      "vanilla_deck.json",
    ]);

    expect(manifest.entries.map((e) => e.file)).toEqual([
      "starter_deck.json",
      "vanilla_deck.json",
      "0_testing_basic.json",
    ]);
    expect(DECK_FILE_EXCLUDE.has("index.json")).toBe(true);
    expect(manifest.entries[0]!.category).toBe("deck");
    expect(manifest.entries[2]!.category).toBe("test");
  });
});
