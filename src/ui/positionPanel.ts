/**
 * Practice UI for saved positions + checkpoint/reroll status.
 * Core logic lives in positionStore — this module is DOM only.
 */
import {
  savePosition,
  listPositions,
  loadPosition,
  renamePosition,
  deletePosition,
  downloadPositionJson,
  importPositionFromJson,
  setCheckpoint,
  restoreCheckpoint,
  rerollFromCheckpoint,
  getCheckpointInfo,
  onPositionLibraryChange,
  onCheckpointInfoChange,
  PositionSchemaError,
  type SavedPosition,
} from "../core/positionStore.js";
import { showToast } from "./toast.js";
import {
  getScriptProgressForPosition,
  applyScriptProgressFromPosition,
} from "./scriptPanel.js";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function refreshPositionSelect(): void {
  const sel = $("positionSelect") as HTMLSelectElement | null;
  if (!sel) return;
  const previous = sel.value;
  const items = listPositions();
  sel.innerHTML = "";
  if (items.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no saved positions)";
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const p of items) {
      const opt = document.createElement("option");
      opt.value = p.id;
      const turn = p.meta.turnNumber;
      const when = new Date(p.savedAt).toLocaleTimeString();
      opt.textContent = `${p.name} · T${turn} · ${when}`;
      sel.appendChild(opt);
    }
    if (previous && items.some((p) => p.id === previous)) {
      sel.value = previous;
    }
  }
  updatePositionButtons();
}

function selectedPositionId(): string | null {
  const sel = $("positionSelect") as HTMLSelectElement | null;
  if (!sel || !sel.value) return null;
  return sel.value;
}

function updatePositionButtons(): void {
  const has = !!selectedPositionId();
  for (const id of [
    "loadPositionBtn",
    "renamePositionBtn",
    "deletePositionBtn",
    "exportPositionBtn",
  ]) {
    const btn = $(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = !has;
  }
}

function refreshCheckpointStatus(): void {
  const el = $("checkpointStatus");
  if (!el) return;
  const info = getCheckpointInfo();
  if (!info.active) {
    el.textContent = "Checkpoint: none";
    el.classList.remove("active");
  } else {
    el.textContent = `Checkpoint: T${info.setAtTurn} · rerolls ${info.rerollCount}`;
    el.classList.add("active");
  }
  const restoreBtn = $("restoreCheckpointBtn") as HTMLButtonElement | null;
  const rerollBtn = $("rerollCheckpointBtn") as HTMLButtonElement | null;
  if (restoreBtn) restoreBtn.disabled = !info.active;
  if (rerollBtn) rerollBtn.disabled = !info.active;
}

function readDeckMeta(): { deckAId?: string; deckBId?: string } {
  const blue = $("blueDeckSelect") as HTMLSelectElement | null;
  const red = $("redDeckSelect") as HTMLSelectElement | null;
  const out: { deckAId?: string; deckBId?: string } = {};
  if (blue?.value) out.deckAId = blue.value;
  if (red?.value) out.deckBId = red.value;
  return out;
}

function onSave(): void {
  const chosen = prompt("Name this position:", "Position");
  if (chosen === null) return;
  const progress = getScriptProgressForPosition();
  const metaExtra: Partial<import("../core/positionStore.js").PositionMeta> = {
    ...readDeckMeta(),
  };
  if (progress) {
    metaExtra.scriptProgress = {
      schemaVersion: progress.schemaVersion,
      name: progress.name,
      scriptedSide: progress.scriptedSide,
      cursor: progress.cursor,
      ...(progress.diverged !== undefined
        ? { diverged: progress.diverged }
        : {}),
      ...(progress.divergeReason !== undefined
        ? { divergeReason: progress.divergeReason }
        : {}),
    };
  }
  const record = savePosition(chosen.trim() || "Untitled position", {
    meta: metaExtra,
  });
  refreshPositionSelect();
  const sel = $("positionSelect") as HTMLSelectElement | null;
  if (sel) sel.value = record.id;
  updatePositionButtons();
  showToast(`Saved “${record.name}”`);
}

function onLoad(): void {
  const id = selectedPositionId();
  if (!id) return;
  try {
    const record = loadPosition(id);
    if (record.meta.scriptProgress) {
      const sp = record.meta.scriptProgress;
      applyScriptProgressFromPosition({
        schemaVersion: 1,
        name: sp.name,
        scriptedSide: sp.scriptedSide,
        cursor: sp.cursor,
        ...(sp.diverged !== undefined ? { diverged: sp.diverged } : {}),
        ...(sp.divergeReason !== undefined
          ? { divergeReason: sp.divergeReason }
          : {}),
      });
    }
    showToast(`Loaded “${record.name}”`);
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onRename(): void {
  const id = selectedPositionId();
  if (!id) return;
  const items = listPositions();
  const cur = items.find((p) => p.id === id);
  const next = prompt("Rename position:", cur?.name || "");
  if (next === null) return;
  try {
    renamePosition(id, next);
    refreshPositionSelect();
    const sel = $("positionSelect") as HTMLSelectElement | null;
    if (sel) sel.value = id;
    showToast("Renamed");
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onDelete(): void {
  const id = selectedPositionId();
  if (!id) return;
  const items = listPositions();
  const cur = items.find((p) => p.id === id);
  if (!confirm(`Delete saved position “${cur?.name ?? id}”?`)) return;
  deletePosition(id);
  refreshPositionSelect();
  showToast("Deleted");
}

function onExport(): void {
  const id = selectedPositionId();
  if (!id) return;
  try {
    downloadPositionJson(id);
    showToast("Exported JSON");
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onImportFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result ?? "");
      const record = importPositionFromJson(text, { load: false });
      refreshPositionSelect();
      const sel = $("positionSelect") as HTMLSelectElement | null;
      if (sel) sel.value = record.id;
      updatePositionButtons();
      showToast(`Imported “${record.name}”`);
    } catch (e) {
      const msg =
        e instanceof PositionSchemaError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      showToast(msg, 3200);
      console.error("[Positions] Import failed:", e);
    }
  };
  reader.onerror = () => showToast("Failed to read file");
  reader.readAsText(file);
}

/** Wire buttons/selects once the control panel exists. */
export function initPositionPanel(): void {
  const saveBtn = $("savePositionBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", () => onSave());
  $("loadPositionBtn")?.addEventListener("click", () => onLoad());
  $("renamePositionBtn")?.addEventListener("click", () => onRename());
  $("deletePositionBtn")?.addEventListener("click", () => onDelete());
  $("exportPositionBtn")?.addEventListener("click", () => onExport());

  const importBtn = $("importPositionBtn");
  const importInput = $("importPositionInput") as HTMLInputElement | null;
  importBtn?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) onImportFile(file);
    importInput.value = "";
  });

  ($("positionSelect") as HTMLSelectElement | null)?.addEventListener(
    "change",
    () => updatePositionButtons(),
  );

  $("setCheckpointBtn")?.addEventListener("click", () => {
    setCheckpoint();
    showToast("Checkpoint set (F6)");
  });
  $("restoreCheckpointBtn")?.addEventListener("click", () => {
    if (restoreCheckpoint()) showToast("Checkpoint restored");
  });
  $("rerollCheckpointBtn")?.addEventListener("click", () => {
    try {
      const info = rerollFromCheckpoint();
      showToast(`Reroll #${info.rerollCount} (F8)`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  });

  onPositionLibraryChange(() => refreshPositionSelect());
  onCheckpointInfoChange(() => refreshCheckpointStatus());
  refreshPositionSelect();
  refreshCheckpointStatus();
}

/** Expose for tests / debugging. */
export type { SavedPosition };
