// src/boot/boot.ts
// Ensure global handlers (useRedBoost, endTurnBlue/Red) are registered
import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import "@fontsource-variable/inter/wght.css";
import "../ui/styles/tokens.css";
import "../ui/styles/arena.css";
import "../ui/styles/chrome.css";
import "../ui/styles/motion.css";
import * as engine from "../engine.js";

// Entry points
import { render as baseRender } from "../ui/render.js";
import { wrapRender } from "../ui/motion/wrapRender.js";
import { wireMotionSettingsUi } from "../ui/motion/motion.js";
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
import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";

// Expose globals for UI onclick handlers
window.endTurnBlue = endTurnBlue;
window.endTurnRed = endTurnRed;
window.useRedBoost = useRedBoost;

const render = wrapRender(baseRender);

// Initialize Logic -> UI Adapter (wire ALL targeting UI functions)
injectAdapter({
  render,
  showChoiceModal,
  showTargetConfirmationButton,
  hideTargetConfirmation,
  triggerConfirmButtonClick,
});

window.addEventListener("DOMContentLoaded", () => {
  wireMotionSettingsUi();

  wireClick("startGameBtn", async () => {
    const blueSelect = document.getElementById(
      "blueDeckSelect",
    ) as HTMLSelectElement;
    const redSelect = document.getElementById(
      "redDeckSelect",
    ) as HTMLSelectElement;
    const seedInput = document.getElementById("seedInput") as HTMLInputElement;

    // Default or read value
    const deckAId = blueSelect?.value || "starter_deck";
    const deckBId = redSelect?.value || "starter_deck";

    // Empty seed → generate one so games stay reproducible once surfaced to the user
    let seed: number;
    if (
      seedInput &&
      seedInput.value.trim() !== "" &&
      !Number.isNaN(Number(seedInput.value))
    ) {
      seed = Number(seedInput.value);
    } else {
      seed = Date.now();
      if (seedInput) seedInput.value = String(seed);
      console.log(`[RNG] Generated seed: ${seed}`);
    }

    try {
      await engine.startNewGame({ deckAId, deckBId, seed });
    } catch (err) {
      console.error("[Start Game] Failed to start:", err);
    }
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
    state.players.first.pp = Math.min(state.players.first.maxPP, state.players.first.pp + 1);
    render();
  });
  wireClick("godMinus", () => {
    state.players.first.pp = Math.max(0, state.players.first.pp - 1);
    render();
  });
  wireClick("godRefill", () => {
    state.players.first.pp = state.players.first.maxPP;
    render();
  });
  wireClick("godSetMax", () => {
    const val = prompt("Set Max PP (and fill):", "10");
    if (val) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) {
        state.players.first.maxPP = n;
        state.players.first.pp = n;
        render();
      }
    }
  });

  // God Mode: EP
  wireClick("godEPPlus", () => {
    state.players.first.evoCharges = (state.players.first.evoCharges || 0) + 1;
    render();
  });
  wireClick("godEPMinus", () => {
    state.players.first.evoCharges = Math.max(0, (state.players.first.evoCharges || 0) - 1);
    render();
  });
  wireClick("godEPRefill", () => {
    state.players.first.evoCharges = 3; // Max EP for P2 is 3, usually enough.
    render();
  });

  wireClick("godSetEvoCount", () => {
    const inp = document.getElementById("godEvoCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        // Determine delta to update Skybound Art (SBA)
        const oldVal = state.players.first.evoCount || 0;
        state.players.first.evoCount = val;

        // If we increased evolutions, manually trigger SBA increments
        // so cards in hand "witness" these god-mode evolutions.
        const delta = val - oldVal;
        if (delta > 0) {
          void import("../logic/effects/skybound.js").then(
            ({ incrementSkyboundArt }) => {
              for (let i = 0; i < delta; i++) {
                incrementSkyboundArt("first");
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
        state.players.first.playsThisTurn = val;
        render();
      }
    }
  });

  wireClick("godSetShadows", () => {
    const inp = document.getElementById("godShadowsVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val) && val >= 0) {
        state.players.first.shadows = val;
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

function appendDeckOption(select: HTMLElement, entry: DeckManifestEntry) {
  const opt = document.createElement("option");
  opt.value = entry.id;
  opt.textContent = entry.label;
  select.appendChild(opt);
}

function populateSelectFromManifest(select: HTMLElement, entries: DeckManifestEntry[]) {
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
  try {
    const r = await fetch("decks/manifest.json", { cache: "no-cache" });
    if (r.ok) {
      const contentType = r.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        const manifest = (await r.json()) as DeckManifest;
        if (Array.isArray(manifest.entries) && manifest.entries.length) {
          return manifest.entries;
        }
      }
    }
  } catch {
    /* ignore */
  }

  console.warn(
    "[Decks] decks/manifest.json missing — run npm run decks:discover (or npm run dev, which runs it automatically)",
  );
  return [
    {
      file: "starter_deck.json",
      id: "starter_deck",
      label: "Starter",
      category: "deck",
    },
  ];
}

async function populateDeckSelects() {
  const entries = await listDeckEntries();
  const blue = document.getElementById("blueDeckSelect");
  const red = document.getElementById("redDeckSelect");
  if (!blue || !red) return;

  populateSelectFromManifest(blue, entries);
  populateSelectFromManifest(red, entries);
}

window.addEventListener("DOMContentLoaded", populateDeckSelects);














