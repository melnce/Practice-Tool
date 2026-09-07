/** Filenames under decks/ that are not playable deck lists. */
export const DECK_FILE_EXCLUDE = new Set([
  "index.json",
  "all_cards.json",
  "manifest.json",
]);

export type DeckCategory = "deck" | "test";

export interface DeckManifestEntry {
  file: string;
  id: string;
  label: string;
  category: DeckCategory;
}

export interface DeckManifest {
  entries: DeckManifestEntry[];
}

export function isTestDeckFilename(file: string): boolean {
  return /^0_testing/i.test(file);
}

export function deckIdFromFilename(file: string): string {
  return file.replace(/\.json$/i, "");
}

export function deckLabelFromFilename(file: string): string {
  return file
    .replace(/\.json$/i, "")
    .replace(/_deck$/i, "")
    .replace(/_/g, " ");
}

/** Build a manifest from bare filenames (no filesystem access — safe for tests). */
/** Shipped playable deck ids from a manifest (category === "deck"), sorted by id. */
export function shippedDeckIds(manifest: DeckManifest): string[] {
  return manifest.entries
    .filter((e) => e.category === "deck")
    .map((e) => e.id)
    .sort((a, b) => a.localeCompare(b));
}

/** Shipped deck filenames from a manifest (category === "deck"), sorted by file. */
export function shippedDeckFiles(manifest: DeckManifest): string[] {
  return manifest.entries
    .filter((e) => e.category === "deck")
    .map((e) => e.file)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function buildManifestFromFilenames(
  files: readonly string[],
): DeckManifest {
  const entries = files
    .filter((f) => f.endsWith(".json") && !DECK_FILE_EXCLUDE.has(f))
    .sort((a, b) => {
      const ta = isTestDeckFilename(a);
      const tb = isTestDeckFilename(b);
      if (ta !== tb) return ta ? 1 : -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    })
    .map(
      (file): DeckManifestEntry => ({
        file,
        id: deckIdFromFilename(file),
        label: deckLabelFromFilename(file),
        category: isTestDeckFilename(file) ? "test" : "deck",
      }),
    );

  return { entries };
}
