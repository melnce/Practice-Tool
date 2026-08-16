import * as engine from "../engine.js";
import { wireClick } from "../ui/dom.js";
import { state } from "../core/gameState.js";
import { parseSeedInput } from "../core/seed.js";
import { writeShareParams } from "./shareUrl.js";
import { syncSeedDisplay } from "../ui/seedDisplay.js";
import { reportDeckCoverage } from "../ui/coverageBanner.js";
import { getDeck, getHand } from "../core/playerHelpers.js";

export function initGameStart(): void {
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
}
