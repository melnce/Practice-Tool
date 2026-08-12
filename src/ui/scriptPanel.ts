/**
 * Sparring-line UI — record / load a scripted dummy (NOT labeled AI/opponent).
 */
import {
  startRecording,
  stopRecording,
  loadScriptForPlayback,
  clearScript,
  getScriptRuntimeSnapshot,
  onScriptRuntimeChange,
  setHiddenHandEnabled,
  isHiddenHandEnabled,
  getRecordingDocument,
  restoreScriptProgress,
} from "../logic/script/runtime.js";
import { parseScriptDocument, scriptToJson } from "../core/script/parse.js";
import { ScriptSchemaError } from "../core/script/types.js";
import { showToast } from "./toast.js";
import { adapter } from "../core/adapter.js";
import type { Player } from "../core/types/index.js";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function refreshScriptStatus(): void {
  const el = $("scriptStatus");
  if (!el) return;
  const snap = getScriptRuntimeSnapshot();
  if (!snap.doc) {
    el.textContent = "Line: none";
    el.classList.remove("active", "diverged");
  } else if (snap.progress?.diverged) {
    el.textContent = snap.progress.divergeReason || "Line diverged";
    el.classList.add("diverged");
    el.classList.remove("active");
  } else if (snap.mode === "recording") {
    el.textContent = `Recording ${snap.doc.scriptedSide} · ${snap.doc.steps.length} steps`;
    el.classList.add("active");
    el.classList.remove("diverged");
  } else {
    el.textContent = `Line ${snap.doc.name} · step ${snap.progress?.cursor ?? 0}/${snap.doc.steps.length}${snap.mode === "idle" ? " (stopped)" : ""}`;
    el.classList.add("active");
    el.classList.remove("diverged");
  }

  const banner = $("scriptDivergeBanner");
  if (banner) {
    if (snap.progress?.diverged) {
      banner.style.display = "block";
      banner.textContent = snap.progress.divergeReason || "Script diverged";
    } else {
      banner.style.display = "none";
      banner.textContent = "";
    }
  }
}

function readSide(): Player {
  const sel = $("scriptSideSelect") as HTMLSelectElement | null;
  return sel?.value === "first" ? "first" : "second";
}

export function initScriptPanel(): void {
  const recordBtn = $("scriptRecordBtn") as HTMLButtonElement | null;
  const stopBtn = $("scriptStopRecordBtn") as HTMLButtonElement | null;
  const exportBtn = $("scriptExportBtn") as HTMLButtonElement | null;
  const importBtn = $("scriptImportBtn") as HTMLButtonElement | null;
  const clearBtn = $("scriptClearBtn") as HTMLButtonElement | null;
  const fileInput = $("scriptImportInput") as HTMLInputElement | null;
  const hiddenToggle = $("scriptHiddenHandToggle") as HTMLInputElement | null;

  if (hiddenToggle) {
    hiddenToggle.checked = isHiddenHandEnabled();
    hiddenToggle.addEventListener("change", () => {
      setHiddenHandEnabled(hiddenToggle.checked);
      adapter.render();
    });
  }

  recordBtn?.addEventListener("click", () => {
    const name =
      prompt("Name this sparring line:", "practice-line") || "practice-line";
    const seedInput = $("seedInput") as HTMLInputElement | null;
    const blue = $("blueDeckSelect") as HTMLSelectElement | null;
    const red = $("redDeckSelect") as HTMLSelectElement | null;
    const opts: {
      name: string;
      scriptedSide: Player;
      seed?: number;
      deckAId?: string;
      deckBId?: string;
    } = { name, scriptedSide: readSide() };
    if (seedInput?.value) opts.seed = Number(seedInput.value);
    if (blue?.value) opts.deckAId = blue.value;
    if (red?.value) opts.deckBId = red.value;
    startRecording(opts);
    showToast(`Recording line for ${opts.scriptedSide}`);
    refreshScriptStatus();
  });

  stopBtn?.addEventListener("click", () => {
    const doc = stopRecording();
    if (doc) {
      showToast(`Stopped · ${doc.steps.length} steps`);
      // Keep doc loaded for export; switch to idle but retain via getRecordingDocument
    }
    refreshScriptStatus();
  });

  exportBtn?.addEventListener("click", () => {
    const doc = getRecordingDocument() || getScriptRuntimeSnapshot().doc;
    if (!doc) {
      showToast("No line to export");
      return;
    }
    const blob = new Blob([scriptToJson(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name.replace(/\s+/g, "_")}.svwb-line.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const doc = parseScriptDocument(JSON.parse(text));
      loadScriptForPlayback(doc);
      showToast(`Loaded line "${doc.name}" (${doc.steps.length} steps)`);
      adapter.render();
      maybeKickPlayback();
    } catch (e) {
      const msg =
        e instanceof ScriptSchemaError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      showToast(`Import failed: ${msg}`);
    }
  });

  clearBtn?.addEventListener("click", () => {
    clearScript();
    showToast("Cleared sparring line");
    adapter.render();
  });

  onScriptRuntimeChange(() => {
    refreshScriptStatus();
  });
  refreshScriptStatus();
}

function maybeKickPlayback(): void {
  void import("./playerDispatch.js").then(({ maybeAdvanceScriptFromUi }) => {
    maybeAdvanceScriptFromUi();
  });
}

/** Used by position save/load to embed / restore script cursor. */
export function getScriptProgressForPosition() {
  return getScriptRuntimeSnapshot().progress;
}

export function applyScriptProgressFromPosition(
  progress: NonNullable<ReturnType<typeof getScriptProgressForPosition>>,
): void {
  restoreScriptProgress(progress);
}
