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
import { state } from "../core/gameState.js";
import { doAction, undo, redo } from "../core/history.js";
import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";
import { initTestBridgeIfRequested } from "../ui/qa/testBridge.js";
import { reportDeckCoverage } from "../ui/coverageBanner.js";
import { getDeck, getHand } from "../core/playerHelpers.js";
import {
  endTurnAction,
  bonusPpAction,
  maybeAdvanceScriptFromUi,
} from "../ui/playerDispatch.js";
import { parseSeedInput } from "../core/seed.js";
import { readShareParams, writeShareParams } from "./shareUrl.js";
import { wireSeedCopyControl, syncSeedDisplay } from "../ui/seedDisplay.js";
import { importedDeckManifestEntries } from "../data/importedDeckStore.js";

// Expose globals for UI onclick handlers — routed through PlayerAction dispatch
window.endTurnBlue = () => {
  endTurnAction();
  maybeAdvanceScriptFromUi();
};
window.endTurnRed = () => {
  endTurnAction();
  maybeAdvanceScriptFromUi();
};
window.useRedBoost = () => {
  bonusPpAction("second");
};

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
  wireSeedCopyControl();

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
    let seed: number | string;
    const parsed = seedInput ? parseSeedInput(seedInput.value) : null;
    if (parsed !== null) {
      seed = parsed;
    } else {
      seed = Date.now();
      if (seedInput) seedInput.value = String(seed);
      console.log(`[RNG] Generated seed: ${seed}`);
    }

    try {
      await engine.startNewGame({ deckAId, deckBId, seed });
      // Address bar is the share + reload persistence format
      writeShareParams({ seed: state.seed, deckAId, deckBId });
      if (seedInput) seedInput.value = String(state.seed);
      syncSeedDisplay();
      void import("../core/positionStore.js").then(({ setSessionDeckIds }) => {
        setSessionDeckIds(deckAId, deckBId);
      });
      // Honest coverage signal once both decks are loaded
      reportDeckCoverage(
        [...getDeck(state, "first"), ...getHand(state, "first")],
        [...getDeck(state, "second"), ...getHand(state, "second")],
      );
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

  // Checkpoint F6 / Reroll F8
  void import("../core/positionStore.js").then(({ initCheckpointHotkeys }) => {
    initCheckpointHotkeys();
  });

  // Save/Load positions + checkpoint buttons
  void import("../ui/positionPanel.js").then(({ initPositionPanel }) => {
    initPositionPanel();
  });

  // Sparring line (scripted dummy) panel
  void import("../ui/scriptPanel.js").then(({ initScriptPanel }) => {
    initScriptPanel();
  });

  // Puzzle mode (position + goal + checker)
  void import("../ui/puzzlePanel.js").then(({ initPuzzlePanel }) => {
    initPuzzlePanel();
  });

  // Decklist paste import / export
  void import("../ui/deckImportPanel.js").then(({ initDeckImportPanel }) => {
    initDeckImportPanel({
      refreshSelects: async () => {
        await populateDeckSelects({ preserveSelection: true });
      },
    });
  });

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

  // God Mode Handlers — target the active player; wrapped for undo
  const godTarget = () => state.players[state.activePlayer];

  wireClick("godPlus", () => {
    doAction(
      "God Mode: +PP",
      () => {
        const p = godTarget();
        p.pp = Math.min(p.maxPP, p.pp + 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godMinus", () => {
    doAction(
      "God Mode: -PP",
      () => {
        const p = godTarget();
        p.pp = Math.max(0, p.pp - 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godRefill", () => {
    doAction(
      "God Mode: Refill PP",
      () => {
        const p = godTarget();
        p.pp = p.maxPP;
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
            const p = godTarget();
            p.maxPP = n;
            p.pp = n;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  // God Mode: EP — Worlds Beyond gives both players 2 EP (bible §163)
  wireClick("godEPPlus", () => {
    doAction(
      "God Mode: +EP",
      () => {
        const p = godTarget();
        p.evoCharges = (p.evoCharges || 0) + 1;
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPMinus", () => {
    doAction(
      "God Mode: -EP",
      () => {
        const p = godTarget();
        p.evoCharges = Math.max(0, (p.evoCharges || 0) - 1);
      },
      {},
      { autoRender: true },
    );
  });
  wireClick("godEPRefill", () => {
    doAction(
      "God Mode: Refill EP",
      () => {
        // Worlds Beyond: both players have 2 EP (not 3).
        godTarget().evoCharges = 2;
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
        const slot = state.activePlayer;
        const oldVal = state.players[slot].evoCount || 0;
        const delta = val - oldVal;
        if (delta > 0) {
          // Resolve async import before opening the action (same rule as evolve)
          void import("../logic/effects/skybound.js").then(
            ({ incrementSkyboundArt }) => {
              doAction(
                "God Mode: Set Evo Count",
                () => {
                  state.players[slot].evoCount = val;
                  for (let i = 0; i < delta; i++) {
                    incrementSkyboundArt(slot);
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
              state.players[slot].evoCount = val;
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
            godTarget().playsThisTurn = val;
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
            godTarget().shadows = val;
          },
          {},
          { autoRender: true },
        );
      }
    }
  });

  // Perspective flip toggle (default OFF)
  const flipToggle = document.getElementById(
    "activeOnBottomToggle",
  ) as HTMLInputElement | null;
  if (flipToggle) {
    void import("../ui/render.js").then(
      ({ isActiveOnBottom, setActiveOnBottom }) => {
        flipToggle.checked = isActiveOnBottom();
        flipToggle.addEventListener("change", () => {
          setActiveOnBottom(flipToggle.checked);
        });
      },
    );
  }
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

async function populateDeckSelects(opts?: {
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

window.addEventListener("DOMContentLoaded", () => {
  void populateDeckSelects();
});
