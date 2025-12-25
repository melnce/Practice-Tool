/* eslint-disable */
// src/ui/counts.ts
import { byId, $ } from "./dom.js";
import { GameState } from "../core/types/index.js";

export function updateCounts(state: GameState) {
  const updateIfExists = (id: string, value: any) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`Element with id "${id}" not found - creating it`);
      // Create the element if it doesn't exist (fallback)
      const statsDiv = id.includes("first")
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

  updateIfExists("blueHandCount", state.players.first.hand.length);
  updateIfExists("blueDeckCount", state.players.first.deck.length);
  updateIfExists("blueGraveCount", state.players.first.graveyard.length);
  updateIfExists("blueShadows", state.players.first.shadows); // Note capital 'S'

  updateIfExists("redHandCount", state.players.second.hand.length);
  updateIfExists("redDeckCount", state.players.second.deck.length);
  updateIfExists("redGraveCount", state.players.second.graveyard.length);
  updateIfExists("redShadows", state.players.second.shadows); // Note capital 'S'

  const endBlue = byId("endTurnBlue");
  const endRed = byId("endTurnRed");

  if (!endBlue || !endRed) return;

  if (!state.gameStarted) {
    endBlue.style.display = "none";
    endRed.style.display = "none";
    return;
  }
  // Use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";

  endBlue.style.display = isFirstActive ? "inline-block" : "none";
  endRed.style.display = !isFirstActive ? "inline-block" : "none";

  endBlue.style.backgroundColor = isFirstActive ? "#00f" : "white";
  endRed.style.backgroundColor = !isFirstActive ? "#f00" : "white";
  endBlue.style.color = isFirstActive ? "white" : "black";
  endRed.style.color = !isFirstActive ? "white" : "black";
}














