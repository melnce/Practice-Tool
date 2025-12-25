// src/logic/startGame.ts
// ─────────────────────────────────────────────────────────────────────────────
// BROWSER-ONLY: This module is for browser game initialization with DOM access.
// Core/replay code imports dispatch.ts, not this module.
// ─────────────────────────────────────────────────────────────────────────────
import { state, resetGameState } from "../core/gameState.js";
import { loadBlueDeck, loadRedDeck } from "../data/deckLoader.js";
import { loadCardDatabase } from "../data/cardDatabase.js";

import { beginMulligan } from "./mulligan.js";
import { runEffects } from "./core/effects/index.js";
import { logEvent } from "../core/logger.js";
import { CardInstance } from "../core/types/index.js";
import { StartGameOptions } from "../core/types/index.js";
import { setAnyAllyAttackedThisTurn, setEvoCharges, setSuperEvoCharges, setEvoUsedThisTurn, getDeck, getHand } from "../core/playerHelpers.js";

function resetEvoButtons() {
  ["blueNormalEvo", "blueSuperEvo", "redNormalEvo", "redSuperEvo"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.removeAttribute("disabled");
      el.classList.remove("used", "spent", "disabled");
      el.draggable = true;
    },
  );
}

export async function startGame(options: StartGameOptions) {
  const blueChoice = options.deckAId;
  const redChoice = options.deckBId;

  let finalSeed: number | string;
  if (options.seed !== undefined && options.seed !== null) {
    finalSeed = options.seed;
    console.log(`[RNG] Using provided seed: ${options.seed}`);
  } else {
    // P0-3 FIX: For AI training readiness, require explicit seed.
    // Browser/dev can still pass Date.now() explicitly if desired.
    throw new Error(
      "[startGame] Seed is required for determinism. " +
      "Pass { seed: Date.now() } for casual play or a fixed seed for reproducibility."
    );
  }

  logEvent("gameStart", {
    blueDeck: blueChoice,
    redDeck: redChoice,
    seed: finalSeed,
  });
  resetGameState(finalSeed);
  setAnyAllyAttackedThisTurn(state, "first", false);
  setAnyAllyAttackedThisTurn(state, "second", false);
  await loadCardDatabase();
  await import("../core/card_validation.js").then(({ validateCardDatabase }) =>
    validateCardDatabase(),
  );
  await Promise.all([loadBlueDeck(blueChoice), loadRedDeck(redChoice)]);

  // === Faith crest bootstrap: if Sham-Nacha is in a deck, that player starts with Faith ===
  const hasSham = (deck: CardInstance[], hand: CardInstance[]) => {
    const check = (arr: CardInstance[]) =>
      (arr || []).some(
        (c) =>
          String(c?.name).toLowerCase() === "sham-nacha, heir to entwining",
      );
    return check(deck) || check(hand);
  };

  if (hasSham(getDeck(state, "first"), getHand(state, "first"))) {
    runEffects(
      [
        {
          op: "crest",
          action: "gain",
          name: "Faith: Sham-Nacha, Heir to Entwining",
          image: "images/crests/faith.png",
          description:
            "Faith starts at 0. Whenever you select Modes, increase Faith by 1.",
          triggers: [
            {
              event: "select_mode",
              condition: { own_turn: true },
              effects: [
                {
                  op: "crest",
                  action: "add_counter",
                  crest: "Faith: Sham-Nacha, Heir to Entwining",
                  counter: "faith",
                  amount: 1,
                },
              ],
            },
          ],
        },
      ],
      "first",
      null,
      { targets: [], targetUids: [] },
    );
  }

  if (hasSham(getDeck(state, "second"), getHand(state, "second"))) {
    runEffects(
      [
        {
          op: "crest",
          action: "gain",
          name: "Faith: Sham-Nacha, Heir to Entwining",
          image: "images/crests/faith.png",
          description:
            "Faith starts at 0. Whenever you select Modes, increase Faith by 1.",
          triggers: [
            {
              event: "select_mode",
              condition: { own_turn: true },
              effects: [
                {
                  op: "crest",
                  action: "add_counter",
                  crest: "Faith: Sham-Nacha, Heir to Entwining",
                  counter: "faith",
                  amount: 1,
                },
              ],
            },
          ],
        },
      ],
      "second",
      null,
      { targets: [], targetUids: [] },
    );
  }

  // Reset second player PP boost button (DOM)
  const ppBoostBtn = document.getElementById("secondPlayerPPBoost");
  ppBoostBtn?.classList.remove("used");
  if (ppBoostBtn) {
    ppBoostBtn.removeAttribute("disabled");
    (ppBoostBtn as HTMLElement).style.backgroundColor = "orange";
  }

  // ✅ evolve charges & turn locks
  setEvoCharges(state, "first", 2);
  setSuperEvoCharges(state, "first", 2);
  setEvoCharges(state, "second", 2);
  setSuperEvoCharges(state, "second", 2);

  setEvoUsedThisTurn(state, "first", false);
  setEvoUsedThisTurn(state, "second", false);

  state.gameStarted = true;
  // Render removed - UI layer // show opening hands

  resetEvoButtons(); // ✅ reset evo UI

  // Enter mulligan phase (pauses before turn 1)
  beginMulligan();
}















