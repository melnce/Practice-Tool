// src/logic/startGame.ts
// ─────────────────────────────────────────────────────────────────────────────
// BROWSER-ONLY: This module is for browser game initialization with DOM access.
// Core/replay code imports dispatch.ts, not this module.
// ─────────────────────────────────────────────────────────────────────────────
import { state, resetGameState } from "../core/gameState.js";
import { loadBlueDeck, loadRedDeck } from "../data/deckLoader.js";
import { adapter } from "../core/adapter.js";
import { loadCardDatabase } from "../data/cardDatabase.js";
import { drawCard } from "../core/utils.js";
import { beginMulligan } from "./mulligan.js";
import { runEffects } from "./core/effects/index.js";
import { logEvent } from "../core/logger.js";
import { CardInstance, Player } from "../core/types.js";
import { StartGameOptions } from "../core/types.js";

function resetEvoButtons() {
    ["blueNormalEvo", "blueSuperEvo", "redNormalEvo", "redSuperEvo"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.removeAttribute("disabled");
        el.classList.remove("used", "spent", "disabled");
        el.draggable = true;
    });
}

export async function startGame(options: StartGameOptions) {
    const blueChoice = options.deckAId;
    const redChoice = options.deckBId;

    let finalSeed: number | string;
    if (options.seed !== undefined && options.seed !== null) {
        finalSeed = options.seed;
        console.log(`[RNG] Using provided seed: ${options.seed}`);
    } else {
        const autoSeed = Date.now() >>> 0;
        finalSeed = autoSeed;
        console.log(`[RNG] Using auto seed: ${autoSeed}`);
    }

    logEvent("gameStart", { blueDeck: blueChoice, redDeck: redChoice, seed: finalSeed });
    resetGameState(finalSeed);
    state.blueAnyAllyAttackedThisTurn = false;
    state.redAnyAllyAttackedThisTurn = false;
    await loadCardDatabase();
    await import("../core/card_validation.js").then(({ validateCardDatabase }) => validateCardDatabase());
    await Promise.all([loadBlueDeck(blueChoice), loadRedDeck(redChoice)]);

    // === Faith crest bootstrap: if Sham-Nacha is in a deck, that player starts with Faith ===
    const hasSham = (deck: CardInstance[], hand: CardInstance[]) => {
        const check = (arr: CardInstance[]) => (arr || []).some(c => String(c?.name).toLowerCase() === "sham-nacha, heir to entwining");
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
        }], "blue", null, { targets: [] });
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
        }], "red", null, { targets: [] });
    }

    // Reset red boost button (DOM)
    const redBoost = document.getElementById("redBoost");
    redBoost?.classList.remove("used");
    if (redBoost) { redBoost.removeAttribute("disabled"); (redBoost as HTMLElement).style.backgroundColor = "orange"; }

    // ✅ evolve charges & turn locks
    state.blueEvoCharges = 2;
    state.blueSuperEvoCharges = 2;
    state.redEvoCharges = 2;
    state.redSuperEvoCharges = 2;

    state.blueEvoUsedThisTurn = false;
    state.redEvoUsedThisTurn = false;


    state.gameStarted = true;
    adapter.render();          // show opening hands

    resetEvoButtons();                  // ✅ reset evo UI

    // Enter mulligan phase (pauses before turn 1)
    beginMulligan();
}
