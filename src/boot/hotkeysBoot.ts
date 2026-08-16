import * as engine from "../engine.js";

export function initHotkeysBoot(): void {
  // Ctrl/Cmd+Z (undo), Ctrl+Y or Cmd+Shift+Z (redo)
  engine.initHotkeys();

  // Checkpoint F6 / Reroll F8
  void import("../core/positionStore.js").then(({ initCheckpointHotkeys }) => {
    initCheckpointHotkeys();
  });
}
