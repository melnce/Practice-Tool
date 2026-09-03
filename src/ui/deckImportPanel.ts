/**
 * Paste-import / export UI for community decklists.
 *
 * Durable persistence is file export (JSON or paste text). Session memory holds
 * imported decks for the deck selectors; localStorage is not used.
 */
import { loadCardDatabase } from "../data/cardDatabase.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import {
  exportDecklistText,
  importDecklistFromText,
  type DeckImportResult,
} from "../data/deckImport.js";
import {
  downloadDecklistText,
  downloadImportedDeckJson,
  importDeckFromJsonText,
  ImportedDeckSchemaError,
  importedDeckManifestEntries,
  onImportedDeckLibraryChange,
  saveImportedDeck,
  type ImportedDeckRecord,
} from "../data/importedDeckStore.js";
import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";
import { isRawDeckObject, type RawDeck } from "../data/rawDeck.js";
import { showToast } from "./toast.js";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

let lastImport: DeckImportResult | null = null;
let refreshSelects: (() => Promise<void>) | null = null;

async function ensureCardIndex() {
  if (!getGlobalCardIndex()) {
    await loadCardDatabase();
  }
  const index = getGlobalCardIndex();
  if (!index) throw new Error("Card database failed to load");
  return index;
}

function setStatus(html: string, kind: "ok" | "warn" | "err" | "info"): void {
  const el = $("deckImportStatus");
  if (!el) return;
  el.className = `deck-import-status ${kind}`;
  el.innerHTML = html;
}

function formatImportStatus(result: DeckImportResult): {
  html: string;
  kind: "ok" | "warn" | "err" | "info";
} {
  const lines: string[] = [];
  if (result.unmatched.length > 0) {
    lines.push(
      `<strong>Unmatched lines (not imported):</strong><ul>${result.unmatched
        .map(
          (u) =>
            `<li>L${u.lineNumber}: <code>${escapeHtml(u.rawName)}</code></li>`,
        )
        .join("")}</ul>`,
    );
  }
  const hard = result.validation.issues.filter(
    (i) => i.kind !== "unmatched_line",
  );
  if (hard.length > 0) {
    lines.push(
      `<strong>Validation:</strong><ul>${hard
        .map((i) => `<li>${escapeHtml(i.message)}</li>`)
        .join("")}</ul>`,
    );
  }
  if (result.coverage.length > 0) {
    const byName = new Map(result.matched.map((m) => [m.name, m.card]));
    const names = result.coverage
      .map((c) => {
        const card = byName.get(c.name);
        const set =
          typeof card?.set === "string"
            ? card.set.replace(/^\[[^\]]+\]\s*/, "").trim()
            : "";
        return set
          ? `${c.name} (${c.status}, ${set})`
          : `${c.name} (${c.status})`;
      })
      .join(", ");
    lines.push(
      `<strong class="deck-import-coverage">Coverage warning:</strong> ${escapeHtml(
        names,
      )} — these cards have no programmed effects or use unknown ops; remaining cards are not claimed text-faithful either.`,
    );
  }
  if (result.ok) {
    lines.unshift(
      `<strong>Ready:</strong> ${result.validation.cardCount} cards` +
        (result.raw?.class ? ` · ${escapeHtml(result.raw.class)}` : "") +
        (result.raw?.deckName ? ` · ${escapeHtml(result.raw.deckName)}` : ""),
    );
    const kind = result.coverage.length > 0 ? "warn" : "ok";
    return { html: lines.join(""), kind };
  }
  if (lines.length === 0) {
    lines.push("Import failed.");
  }
  return { html: lines.join(""), kind: "err" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readPasteFields(): {
  text: string;
  deckName: string;
  deckClass: string;
} {
  const text = ($("deckImportText") as HTMLTextAreaElement | null)?.value ?? "";
  const deckName =
    ($("deckImportName") as HTMLInputElement | null)?.value?.trim() ?? "";
  const deckClass =
    ($("deckImportClass") as HTMLSelectElement | null)?.value?.trim() ?? "";
  return { text, deckName, deckClass };
}

async function runValidate(): Promise<DeckImportResult | null> {
  const { text, deckName, deckClass } = readPasteFields();
  if (!text.trim()) {
    setStatus("Paste a decklist first.", "info");
    return null;
  }
  try {
    const index = await ensureCardIndex();
    const importOpts: Parameters<typeof importDecklistFromText>[2] = {};
    if (deckName) importOpts.deckName = deckName;
    if (deckClass) importOpts.deckClass = deckClass;
    const result = importDecklistFromText(text, index, importOpts);
    lastImport = result;
    const { html, kind } = formatImportStatus(result);
    setStatus(html, kind);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(escapeHtml(msg), "err");
    return null;
  }
}

async function runSave(): Promise<void> {
  const result = lastImport ?? (await runValidate());
  if (!result) return;
  if (!result.ok || !result.raw) {
    setStatus(
      formatImportStatus(result).html +
        "<p>Fix unmatched lines and validation errors, then retry.</p>",
      "err",
    );
    return;
  }
  // Coverage is a warning, not a hard block — but it must be visible before save
  if (result.coverage.length > 0) {
    const { html } = formatImportStatus(result);
    setStatus(
      html +
        "<p><em>Saved anyway — unimplemented cards will also show when you start a game.</em></p>",
      "warn",
    );
  }

  const { deckName } = readPasteFields();
  const raw = { ...result.raw };
  if (deckName) raw.deckName = deckName;
  const record = saveImportedDeck({
    raw,
    label: deckName || result.raw.deckName || "Imported Deck",
    source: "paste",
  });
  await selectImported(record);
  showToast(`Imported “${record.label}” (session — export JSON to keep)`);
  if (result.coverage.length === 0) {
    setStatus(
      `<strong>Saved:</strong> ${escapeHtml(record.label)} is in the deck selectors. ` +
        `Session only — use <em>Export JSON</em> for a durable copy (localStorage is not used).`,
      "ok",
    );
  }
  closePanel();
}

async function selectImported(record: ImportedDeckRecord): Promise<void> {
  if (refreshSelects) await refreshSelects();
  for (const id of ["blueDeckSelect", "redDeckSelect"] as const) {
    const sel = $(id) as HTMLSelectElement | null;
    if (!sel) continue;
    const opt = [...sel.options].find((o) => o.value === record.id);
    if (opt) sel.value = record.id;
  }
}

async function exportSelectedPaste(): Promise<void> {
  const blue = $("blueDeckSelect") as HTMLSelectElement | null;
  const id = blue?.value;
  if (!id) {
    showToast("Select a deck first");
    return;
  }
  try {
    const text = await loadDecklistTextForId(id);
    const ta = $("deckImportText") as HTMLTextAreaElement | null;
    if (ta) ta.value = text;
    openPanel();
    setStatus(
      "Exported paste format into the box (Nx Name). Copy it, or use Download .txt.",
      "ok",
    );
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    showToast("Decklist copied (paste format)");
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

async function loadDecklistTextForId(deckId: string): Promise<string> {
  const { getImportedDeck } = await import("../data/importedDeckStore.js");
  const imported = getImportedDeck(deckId);
  if (imported) return exportDecklistText(imported.raw);

  const root =
    typeof window !== "undefined" ? ((window as any).APP_ROOT ?? "/") : "/";
  const file = deckId.replace(/\.json$/i, "") + ".json";
  const res = await fetch(`${root}decks/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load deck ${deckId}`);
  const raw = (await res.json()) as RawDeck;
  if (!isRawDeckObject(raw) || !Array.isArray(raw.cards)) {
    throw new Error("Deck is not in object format");
  }
  return exportDecklistText(raw);
}

function openPanel(): void {
  const panel = $("deckImportPanel");
  if (!panel) return;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  ($("deckImportText") as HTMLTextAreaElement | null)?.focus();
}

function closePanel(): void {
  const panel = $("deckImportPanel");
  if (!panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
}

function wireFileImport(): void {
  const input = $("deckImportFileInput") as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        // Prefer JSON deck files; fall back to treating as paste text
        if (
          file.name.endsWith(".json") ||
          file.name.endsWith(".svwb-deck.json") ||
          text.trimStart().startsWith("{")
        ) {
          const record = importDeckFromJsonText(text);
          await selectImported(record);
          showToast(`Loaded “${record.label}” from file`);
          setStatus(
            `<strong>Loaded file:</strong> ${escapeHtml(record.label)}. ` +
              `Validate coverage by starting a game, or paste-export to inspect.`,
            "ok",
          );
          closePanel();
          return;
        }
        const ta = $("deckImportText") as HTMLTextAreaElement | null;
        if (ta) ta.value = text;
        openPanel();
        await runValidate();
      } catch (e) {
        const msg =
          e instanceof ImportedDeckSchemaError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setStatus(escapeHtml(msg), "err");
        openPanel();
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Merge shipped manifest entries with session-imported decks and rebuild selects.
 */
export async function refreshDeckSelectsWithImports(
  populate: (entries: DeckManifestEntry[]) => void,
): Promise<void> {
  let shipped: DeckManifestEntry[] = [];
  try {
    const r = await fetch("decks/manifest.json", { cache: "no-cache" });
    if (r.ok) {
      const manifest = (await r.json()) as DeckManifest;
      if (Array.isArray(manifest.entries)) shipped = manifest.entries;
    }
  } catch {
    /* ignore */
  }
  if (shipped.length === 0) {
    shipped = [
      {
        file: "rally_swordcraft.json",
        id: "rally_swordcraft",
        label: "Rally Swordcraft",
        category: "deck",
      },
    ];
  }
  const imported = importedDeckManifestEntries();
  // Keep current selections when possible
  const blue = $("blueDeckSelect") as HTMLSelectElement | null;
  const red = $("redDeckSelect") as HTMLSelectElement | null;
  const prevBlue = blue?.value;
  const prevRed = red?.value;
  populate([...shipped, ...imported]);
  if (blue && prevBlue && [...blue.options].some((o) => o.value === prevBlue)) {
    blue.value = prevBlue;
  }
  if (red && prevRed && [...red.options].some((o) => o.value === prevRed)) {
    red.value = prevRed;
  }
}

export function initDeckImportPanel(opts: {
  refreshSelects: () => Promise<void>;
}): void {
  refreshSelects = opts.refreshSelects;

  $("importDeckBtn")?.addEventListener("click", () => openPanel());
  $("deckImportCloseBtn")?.addEventListener("click", () => closePanel());
  $("deckImportBackdrop")?.addEventListener("click", () => closePanel());
  $("deckImportValidateBtn")?.addEventListener("click", () => {
    void runValidate();
  });
  $("deckImportSaveBtn")?.addEventListener("click", () => {
    void runSave();
  });
  $("exportDecklistBtn")?.addEventListener("click", () => {
    void exportSelectedPaste();
  });
  $("deckImportDownloadTxtBtn")?.addEventListener("click", () => {
    void (async () => {
      const result = lastImport ?? (await runValidate());
      if (!result?.raw) {
        showToast("Validate a list first");
        return;
      }
      const text = exportDecklistText(result.raw);
      downloadDecklistText(text, result.raw.deckName || "decklist");
    })();
  });
  $("deckImportDownloadJsonBtn")?.addEventListener("click", () => {
    void (async () => {
      // Save first if needed
      const result = lastImport ?? (await runValidate());
      if (!result?.ok || !result.raw) {
        showToast("Fix the list before exporting JSON");
        return;
      }
      const { deckName } = readPasteFields();
      const raw = { ...result.raw };
      if (deckName) raw.deckName = deckName;
      const record = saveImportedDeck({
        raw,
        label: deckName || result.raw.deckName || "Imported Deck",
        source: "paste",
      });
      await selectImported(record);
      downloadImportedDeckJson(record.id, record.id);
      showToast("Downloaded JSON (durable copy)");
    })();
  });
  $("deckImportFromFileBtn")?.addEventListener("click", () => {
    ($("deckImportFileInput") as HTMLInputElement | null)?.click();
  });
  wireFileImport();

  onImportedDeckLibraryChange(() => {
    void opts.refreshSelects();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      const panel = $("deckImportPanel");
      if (panel && !panel.hidden) closePanel();
    }
  });
}
