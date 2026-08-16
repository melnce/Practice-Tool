// src/boot/boot.ts — thin composition root for browser entry
import { initWindowGlobals } from "./windowGlobals.js";
import { initAdapter } from "./adapterBoot.js";
import { initContextMenu } from "./contextMenu.js";
import { initDeckSelection } from "./deckSelection.js";
import { initSeedUx } from "./seedUx.js";
import { initGameStart } from "./gameStart.js";
import { initInitialRender } from "./initialRender.js";
import { initHotkeysBoot } from "./hotkeysBoot.js";
import { initSidePanels } from "./sidePanels.js";
import { initUndoRedo } from "./undoRedo.js";
import { initGodMode } from "./godMode.js";
import { initPerspectiveFlip } from "./perspectiveFlip.js";

// Module-load: globals + adapter before any DOMContentLoaded (onclick handlers / engine)
initWindowGlobals();
initAdapter();

// Main DOMContentLoaded — order is behavior (wire controls before first render; panels after hotkeys)
window.addEventListener("DOMContentLoaded", () => {
  initSeedUx();
  initGameStart();
  initInitialRender();
  initHotkeysBoot();
  initSidePanels();
  initUndoRedo();
  initGodMode();
  initPerspectiveFlip();
});

// Context menu listener sits between the two DOMContentLoaded registrations (original boot.ts order)
initContextMenu();

// Second DOMContentLoaded — registered after the main handler so populateDeckSelects runs last
initDeckSelection();
