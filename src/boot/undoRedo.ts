import * as engine from "../engine.js";
import { wireClick } from "../ui/dom.js";
import { undo, redo } from "../core/history.js";

export function initUndoRedo(): void {
  wireClick("undoBtn", () => {
    undo();
  });
  wireClick("redoBtn", () => {
    redo();
  });

  // Enable/disable undo/redo buttons from history stack
  engine.onHistoryUpdate(({ canUndo, canRedo }) => {
    const u = document.getElementById("undoBtn") as HTMLButtonElement | null;
    const r = document.getElementById("redoBtn") as HTMLButtonElement | null;
    if (u) u.disabled = !canUndo;
    if (r) r.disabled = !canRedo;
  });
}
