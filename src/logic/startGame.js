import { state, resetGameState } from "@core/gameState.js";
import { loadBlueDeck, loadRedDeck } from "@data/deckLoader.js";
import { render } from "@ui/render.js";
import { loadCardDatabase } from "@data/cardDatabase.js";
import { drawCard } from "@core/utils.js";
import { beginMulligan } from "@logic/mulligan.js";
import { runEffects } from "@logic/core/effects.js";
import { setSeed, getSeed } from "@core/rng.js";
import { logEvent } from "@core/logger.js";



function resetEvoButtons() {
  ["blueNormalEvo", "blueSuperEvo", "redNormalEvo", "redSuperEvo"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = false;              // re-enable
    el.classList.remove("used", "spent", "disabled"); // clean any flags you added
    el.draggable = true;              // keep drag active
  });
}

export async function startGame() {
  const blueChoice = document.getElementById("blueDeckSelect")?.value || "sample_blue";
  const redChoice = document.getElementById("redDeckSelect")?.value || "sample_red";

  // ↓↓↓ INSERTED: seed RNG before any shuffles/draws happen
  const seedValue = document.getElementById("seedInput")?.value;
  if (seedValue !== undefined && seedValue !== null && String(seedValue).trim() !== "" && !Number.isNaN(Number(seedValue))) {
    setSeed(Number(seedValue));
    console.log(`[RNG] Using provided seed: ${seedValue}`);
  } else {
    const autoSeed = Date.now() >>> 0;
    setSeed(autoSeed);
    console.log(`[RNG] Using auto seed: ${autoSeed}`);
  }

  logEvent("gameStart", { blueDeck: blueChoice, redDeck: redChoice, seed: getSeed() });
  resetGameState();
  state.blueAnyAllyAttackedThisTurn = false;
  state.redAnyAllyAttackedThisTurn = false;
  await loadCardDatabase();
  await import("@core/card_validation.js").then(({ validateCardDatabase }) => validateCardDatabase());
  await Promise.all([loadBlueDeck(blueChoice), loadRedDeck(redChoice)]);

  // === Faith crest bootstrap: if Sham-Nacha is in a deck, that player starts with Faith ===
  const hasSham = (deck, hand) => {
    const check = (arr) => (arr || []).some(c => String(c?.name).toLowerCase() === "sham-nacha, heir to entwining");
    return check(deck) || check(hand);
  };

  if (hasSham(state.blueDeck, state.blueHand)) {
    runEffects([{
      op: "gain_crest",
      name: "Faith",
      image: "images/crests/faith.png",
      description: "Faith starts at 0. Whenever you select Modes, increase Faith by 1.",
      triggers: [{
        event: "select_mode",
        effects: [{ op: "crest_add_counter", crest: "Faith", counter: "faith", amount: 1 }]
      }]
    }], "blue", null);
  }

  if (hasSham(state.redDeck, state.redHand)) {
    runEffects([{
      op: "gain_crest",
      name: "Faith",
      image: "images/crests/faith.png",
      description: "Faith starts at 0. Whenever you select Modes, increase Faith by 1.",
      triggers: [{
        event: "select_mode",
        effects: [{ op: "crest_add_counter", crest: "Faith", counter: "faith", amount: 1 }]
      }]
    }], "red", null);
  }

  const redBoost = document.getElementById("redBoost");
  redBoost?.classList.remove("used");
  if (redBoost) { redBoost.disabled = false; redBoost.style.backgroundColor = "orange"; }

  // ✅ evolve charges & turn locks
  state.blueEvoCharges = 2;
  state.blueSuperEvoCharges = 2;
  state.redEvoCharges = 2;
  state.redSuperEvoCharges = 2;

  state.blueEvoUsedThisTurn = false;
  state.redEvoUsedThisTurn = false;


  state.gameStarted = true;
  render();          // show opening hands

  resetEvoButtons();                  // ✅ reset evo UI

  // Enter mulligan phase (pauses before turn 1)
  beginMulligan();
}
