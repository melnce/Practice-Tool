/* eslint-disable */
// src/ui/counts.ts
import { byId, $ } from "./dom.js";
import { GameState } from "../core/types.js";

export function updateCounts(state: GameState) {
  const updateIfExists = (id: string, value: any) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`Element with id "${id}" not found - creating it`);
      // Create the element if it doesn't exist (fallback)
      const statsDiv = id.includes("blue")
        ? byId("blueStats")
        : byId("redStats");
      if (statsDiv) {
        const newSpan = document.createElement("span");
        newSpan.innerHTML = `☠️ <span id="${id}">${value}</span>`;
        statsDiv.appendChild(newSpan);
      }
      return;
    }
    el.textContent = String(value);
  };

  updateIfExists("blueHandCount", state.blueHand.length);
  updateIfExists("blueDeckCount", state.blueDeck.length);
  updateIfExists("blueGraveCount", state.blueGraveyard.length);
  updateIfExists("blueShadows", state.blueShadows); // Note capital 'S'

  updateIfExists("redHandCount", state.redHand.length);
  updateIfExists("redDeckCount", state.redDeck.length);
  updateIfExists("redGraveCount", state.redGraveyard.length);
  updateIfExists("redShadows", state.redShadows); // Note capital 'S'

  const endBlue = byId("endTurnBlue");
  const endRed = byId("endTurnRed");

  if (!endBlue || !endRed) return;

  if (!state.gameStarted) {
    endBlue.style.display = "none";
    endRed.style.display = "none";
    return;
  }

  endBlue.style.display = state.isBlueTurn ? "inline-block" : "none";
  endRed.style.display = !state.isBlueTurn ? "inline-block" : "none";

  endBlue.style.backgroundColor = state.isBlueTurn ? "#00f" : "white";
  endRed.style.backgroundColor = !state.isBlueTurn ? "#f00" : "white";
  endBlue.style.color = state.isBlueTurn ? "white" : "black";
  endRed.style.color = !state.isBlueTurn ? "white" : "black";
}
