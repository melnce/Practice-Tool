// src/boot/boot.ts
// Ensure global handlers (useRedBoost, endTurnBlue/Red) are registered
import * as engine from "../engine.js";

// Entry points
import { render } from "../ui/render.js";
import { wireClick } from "../ui/dom.js";
import { showChoiceModal } from "../ui/choiceModal.js";
import {
  showTargetConfirmationButton,
  hideTargetConfirmation,
  triggerConfirmButtonClick,
} from "../ui/targeting.js";
import { injectAdapter } from "../core/adapter.js";
import { endTurnBlue, endTurnRed } from "../logic/core/turns.js";
import { useRedBoost } from "../logic/boosts.js";
import { state } from "../core/gameState.js";

// Expose globals for UI onclick handlers
(window as any).endTurnBlue = endTurnBlue;
(window as any).endTurnRed = endTurnRed;
(window as any).useRedBoost = useRedBoost;

// Initialize Logic -> UI Adapter (wire ALL targeting UI functions)
injectAdapter({
  render,
  showChoiceModal,
  showTargetConfirmationButton,
  hideTargetConfirmation,
  triggerConfirmButtonClick,
});

window.addEventListener("DOMContentLoaded", () => {
  wireClick("startGameBtn", async () => {
    const blueSelect = document.getElementById(
      "blueDeckSelect",
    ) as HTMLSelectElement;
    const redSelect = document.getElementById(
      "redDeckSelect",
    ) as HTMLSelectElement;
    const seedInput = document.getElementById("seedInput") as HTMLInputElement;

    // Default or read value
    const deckAId = blueSelect?.value || "sample_blue";
    const deckBId = redSelect?.value || "sample_red";

    // Parse seed
    let seed: number | undefined;
    if (
      seedInput &&
      seedInput.value.trim() !== "" &&
      !Number.isNaN(Number(seedInput.value))
    ) {
      seed = Number(seedInput.value);
    }

    await engine.startNewGame({ deckAId, deckBId, seed });
  });

  try {
    render();
  } catch {
    /* ignore */
  }

  // Ctrl/Cmd+Z (undo), Ctrl+Y or Cmd+Shift+Z (redo)
  engine.initHotkeys();

  // If you later add buttons with IDs 'undoBtn'/'redoBtn', this will enable/disable them
  engine.onHistoryUpdate(({ canUndo, canRedo }) => {
    const u = document.getElementById("undoBtn") as HTMLButtonElement | null;
    const r = document.getElementById("redoBtn") as HTMLButtonElement | null;
    if (u) u.disabled = !canUndo;
    if (r) r.disabled = !canRedo;
  });

  // God Mode Handlers
  wireClick("godPlus", () => {
    state.bluePP = Math.min(state.blueMaxPP, state.bluePP + 1);
    render();
  });
  wireClick("godMinus", () => {
    state.bluePP = Math.max(0, state.bluePP - 1);
    render();
  });
  wireClick("godRefill", () => {
    state.bluePP = state.blueMaxPP;
    render();
  });
  wireClick("godSetMax", () => {
    const val = prompt("Set Max PP (and fill):", "10");
    if (val) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) {
        state.blueMaxPP = n;
        state.bluePP = n;
        render();
      }
    }
  });

  // God Mode: EP
  wireClick("godEPPlus", () => {
    state.blueEvoCharges = (state.blueEvoCharges || 0) + 1;
    render();
  });
  wireClick("godEPMinus", () => {
    state.blueEvoCharges = Math.max(0, (state.blueEvoCharges || 0) - 1);
    render();
  });
  wireClick("godEPRefill", () => {
    state.blueEvoCharges = 3; // Max EP for P2 is 3, usually enough.
    render();
  });

  wireClick("godSetEvoCount", () => {
    const inp = document.getElementById("godEvoCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        // Determine delta to update Skybound Art (SBA)
        const oldVal = state.blueEvoCount || 0;
        state.blueEvoCount = val;

        // If we increased evolutions, manually trigger SBA increments
        // so cards in hand "witness" these god-mode evolutions.
        const delta = val - oldVal;
        if (delta > 0) {
          void import("../logic/effects/skybound.js").then(
            ({ incrementSkyboundArt }) => {
              for (let i = 0; i < delta; i++) {
                incrementSkyboundArt("blue");
              }
              render();
            },
          );
        } else {
          render();
        }
      }
    }
  });

  wireClick("godSetComboCount", () => {
    const inp = document.getElementById("godComboCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        state.bluePlaysThisTurn = val;
        render();
      }
    }
  });

  wireClick("godSetShadows", () => {
    const inp = document.getElementById("godShadowsVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val) && val >= 0) {
        state.blueShadows = val;
        render();
      }
    }
  });
});

// Suppress browser context menu on game surface (cards/boards/leaders/buttons)
document.addEventListener(
  "contextmenu",
  (e) => {
    const el = e.target as HTMLElement;
    if (
      el.closest(".card") ||
      el.closest(".zone") ||
      el.closest(".leader") ||
      el.closest(".evo-btn")
    ) {
      e.preventDefault();
    }
  },
  { capture: true },
);

function toLabel(file: string) {
  return file
    .replace(/^.*\//, "")
    .replace(/\.json$/i, "")
    .replace(/_deck$/i, "")
    .replace(/_/g, " ");
}

async function listDeckFiles() {
  // 1) Preferred: parse directory listing HTML (works on Live Server/Express/nginx autoindex)
  try {
    const r = await fetch("decks/", { cache: "no-cache" });
    if (r.ok) {
      const html = await r.text();
      const files = [...html.matchAll(/href="([^"]+\.json)"/gi)]
        .map((m) => m[1])
        .filter((name): name is string => name !== undefined)
        .map((name) => decodeURIComponent(name))
        .map((name) => name.split("/").pop()) // keep only filename
        .filter(
          (name): name is string =>
            !!name &&
            !/manifest\.json$/i.test(name) &&
            !/decks_index\.json$/i.test(name),
        );
      if (files.length) return [...new Set(files)];
    }
  } catch {
    /* ignore */
  }
  // 2) Fallback: decks_index.json (if your deckbuilder created it)
  try {
    const r = await fetch("decks/decks_index.json", { cache: "no-cache" });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
        return [
          ...new Set(
            arr.map((x) =>
              String(x)
                .replace(/^decks\//, "")
                .split("/")
                .pop(),
            ),
          ),
        ];
      }
    }
  } catch {
    /* ignore */
  }
  // 3) Last resort: still show example so UI works
  return ["example_deck.json"];
}

async function populateDeckSelects() {
  const files = await listDeckFiles(); // array of filenames like "Sword_Midrange_deck.json"
  const blue = document.getElementById("blueDeckSelect");
  const red = document.getElementById("redDeckSelect");
  if (!blue || !red) return;

  for (const el of [blue, red]) {
    el.innerHTML = "";
    for (const f of files) {
      if (!f) continue;
      const opt = document.createElement("option");
      opt.value = f.replace(/\.json$/i, ""); // loader tolerates base or full
      opt.textContent = toLabel(f);
      el.appendChild(opt);
    }
  }
}

window.addEventListener("DOMContentLoaded", populateDeckSelects);
