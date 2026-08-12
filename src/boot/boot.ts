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
import { doAction, undo, redo } from "../core/history.js";
import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";
import { initTestBridgeIfRequested } from "../ui/qa/testBridge.js";

// Expose globals for UI onclick handlers
window.endTurnBlue = endTurnBlue;
window.endTurnRed = endTurnRed;
window.useRedBoost = useRedBoost;

// Initialize Logic -> UI Adapter (wire ALL targeting UI functions)
injectAdapter({
  render,
  showChoiceModal,
  showTargetConfirmationButton,
  hideTargetConfirmation,
  triggerConfirmButtonClick,
});

window.addEventListener("DOMContentLoaded", () => {
  void initTestBridgeIfRequested();

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

  // God Mode Handlers — wrapped so they are undoable practice tools
  wireClick("godPlus", () => {
    doAction(
      "God Mode: +PP",
      () => {
        state.players.first.pp = Math.min(
          state.players.first.maxPP,
          state.players.first.pp + 1,
        );
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godMinus", () => {
    doAction(
      "God Mode: -PP",
      () => {
        state.players.first.pp = Math.max(0, state.players.first.pp - 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godRefill", () => {
    doAction(
      "God Mode: Refill PP",
      () => {
        state.players.first.pp = state.players.first.maxPP;
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godSetMax", () => {
    const val = prompt("Set Max PP (and fill):", "10");
    if (val) {
      const n = parseInt(val, 10);
      if (Number.isFinite(n) && n >= 0) {
        doAction(
          "God Mode: Set Max PP",
          () => {
            state.players.first.maxPP = n;
            state.players.first.pp = n;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  // God Mode: EP
  wireClick("godEPPlus", () => {
    doAction(
      "God Mode: +EP",
      () => {
        state.players.first.evoCharges =
          (state.players.first.evoCharges || 0) + 1;
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPMinus", () => {
    doAction(
      "God Mode: -EP",
      () => {
        state.players.first.evoCharges = Math.max(
          0,
          (state.players.first.evoCharges || 0) - 1,
        );
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPRefill", () => {
    doAction(
      "God Mode: Refill EP",
      () => {
        state.players.first.evoCharges = 3; // Max EP for P2 is 3, usually enough.
      },
      {},
      { autoRender: true },
    );
  });

  wireClick("godSetEvoCount", () => {
    const inp = document.getElementById("godEvoCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        const oldVal = state.players.first.evoCount || 0;
        const delta = val - oldVal;
        if (delta > 0) {
          // Resolve async import before opening the action (same rule as evolve)
          void import("../logic/effects/skybound.js").then(
            ({ incrementSkyboundArt }) => {
              doAction(
                "God Mode: Set Evo Count",
                () => {
                  state.players.first.evoCount = val;
                  for (let i = 0; i < delta; i++) {
                    incrementSkyboundArt("first");
                  }
                },
                {},
                { autoRender: true },
              );
            },
          );
        } else {
          doAction(
            "God Mode: Set Evo Count",
            () => {
              state.players.first.evoCount = val;
            },
            {},
            { autoRender: true },
          );
        }
      }
    }
  });

  wireClick("godSetComboCount", () => {
    const inp = document.getElementById("godComboCountVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val)) {
        doAction(
          "God Mode: Set Combo",
          () => {
            state.players.first.playsThisTurn = val;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  wireClick("godSetShadows", () => {
    const inp = document.getElementById("godShadowsVal") as HTMLInputElement;
    if (inp) {
      const val = parseInt(inp.value, 10);
      if (Number.isFinite(val) && val >= 0) {
        doAction(
          "God Mode: Set Shadows",
          () => {
            state.players.first.shadows = val;
          },
          {},
          { autoRender: true },
        );
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
