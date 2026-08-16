import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";
import { readShareParams } from "./shareUrl.js";
import { importedDeckManifestEntries } from "../data/importedDeckStore.js";

function appendDeckOption(select: HTMLElement, entry: DeckManifestEntry) {
  const opt = document.createElement("option");
  opt.value = entry.id;
  opt.textContent = entry.label;
  select.appendChild(opt);
}

function populateSelectFromManifest(
  select: HTMLElement,
  entries: DeckManifestEntry[],
) {
  select.innerHTML = "";

  const decks = entries.filter((e) => e.category === "deck");
  const tests = entries.filter((e) => e.category === "test");

  if (decks.length > 0 && tests.length > 0) {
    const deckGroup = document.createElement("optgroup");
    deckGroup.label = "Decks";
    for (const entry of decks) appendDeckOption(deckGroup, entry);

    const testGroup = document.createElement("optgroup");
    testGroup.label = "Test decks";
    for (const entry of tests) appendDeckOption(testGroup, entry);

    select.appendChild(deckGroup);
    select.appendChild(testGroup);
    return;
  }

  for (const entry of entries) appendDeckOption(select, entry);
}

async function listDeckEntries(): Promise<DeckManifestEntry[]> {
  let shipped: DeckManifestEntry[] = [];
  try {
    const r = await fetch("decks/manifest.json", { cache: "no-cache" });
    if (r.ok) {
      const contentType = r.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        const manifest = (await r.json()) as DeckManifest;
        if (Array.isArray(manifest.entries) && manifest.entries.length) {
          shipped = manifest.entries;
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (shipped.length === 0) {
    console.warn(
      "[Decks] decks/manifest.json missing — run npm run decks:discover (or npm run dev, which runs it automatically)",
    );
    shipped = [
      {
        file: "starter_deck.json",
        id: "starter_deck",
        label: "Starter",
        category: "deck",
      },
    ];
  }

  // Session-imported decks sit alongside shipped ones (not on disk / not in git)
  const imported = importedDeckManifestEntries();
  if (imported.length === 0) return shipped;

  // Keep tests grouped; put imported with playable decks
  const decks = shipped.filter((e) => e.category === "deck");
  const tests = shipped.filter((e) => e.category === "test");
  return [...decks, ...imported, ...tests];
}

export async function populateDeckSelects(opts?: {
  preserveSelection?: boolean;
  applyShareParams?: boolean;
}) {
  const blue = document.getElementById(
    "blueDeckSelect",
  ) as HTMLSelectElement | null;
  const red = document.getElementById(
    "redDeckSelect",
  ) as HTMLSelectElement | null;
  if (!blue || !red) return;

  const prevBlue = blue.value;
  const prevRed = red.value;
  const entries = await listDeckEntries();

  populateSelectFromManifest(blue, entries);
  populateSelectFromManifest(red, entries);

  if (opts?.preserveSelection) {
    if (prevBlue && [...blue.options].some((o) => o.value === prevBlue)) {
      blue.value = prevBlue;
    }
    if (prevRed && [...red.options].some((o) => o.value === prevRed)) {
      red.value = prevRed;
    }
  }

  // Prefill from ?seed=&a=&b= (URL is the reload/share persistence)
  if (opts?.applyShareParams !== false && !opts?.preserveSelection) {
    applyShareParamsFromUrl(blue, red);
  }
}

function applyShareParamsFromUrl(
  blue: HTMLSelectElement,
  red: HTMLSelectElement,
): void {
  const share = readShareParams();
  const seedInput = document.getElementById(
    "seedInput",
  ) as HTMLInputElement | null;
  if (share.seed !== undefined && seedInput) {
    seedInput.value = String(share.seed);
  }
  if (share.deckAId) {
    const opt = [...blue.options].find((o) => o.value === share.deckAId);
    if (opt) blue.value = share.deckAId;
  }
  if (share.deckBId) {
    const opt = [...red.options].find((o) => o.value === share.deckBId);
    if (opt) red.value = share.deckBId;
  }
}

/** Second DOMContentLoaded listener — runs after the main boot handler (registration order). */
export function initDeckSelection(): void {
  window.addEventListener("DOMContentLoaded", () => {
    void populateDeckSelects();
  });
}
