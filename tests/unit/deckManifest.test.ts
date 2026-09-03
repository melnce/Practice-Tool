import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifestFromFilenames,
  DECK_FILE_EXCLUDE,
} from "../../src/data/deckManifest.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MANIFEST_FILE = path.join(ROOT, "decks/manifest.json");

describe("deckManifest", () => {
  it("excludes non-deck files and groups test decks", () => {
    const manifest = buildManifestFromFilenames([
      "index.json",
      "all_cards.json",
      "manifest.json",
      "rally_swordcraft.json",
      "0_testing_vanilla.json",
      "0_testing_basic.json",
      "vanilla_deck.json",
    ]);

    expect(manifest.entries.map((e) => e.file)).toEqual([
      "rally_swordcraft.json",
      "vanilla_deck.json",
      "0_testing_basic.json",
      "0_testing_vanilla.json",
    ]);
    expect(DECK_FILE_EXCLUDE.has("index.json")).toBe(true);
    expect(manifest.entries[0]!.category).toBe("deck");
    expect(manifest.entries[2]!.category).toBe("test");
  });

  it("decks:discover writes manifest.json that passes prettier --check", () => {
    execSync("npm run decks:discover", { cwd: ROOT, stdio: "pipe" });
    execSync("npx prettier --check decks/manifest.json", {
      cwd: ROOT,
      stdio: "pipe",
    });
    const raw = fs.readFileSync(MANIFEST_FILE, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toMatch(/\}\n$/);
  });
});
