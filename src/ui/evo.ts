// src/ui/evo.ts
import { byId } from "./dom.js";
import type { GameState } from "../core/types/index.js";
import { enableEvoButtonDrag } from "./drag.js";

export function updateEvoButtonsUI(state: GameState) {
  /** @type {HTMLButtonElement} */
  const bNE = byId("blueNormalEvo") as HTMLButtonElement;
  /** @type {HTMLButtonElement} */
  const bSE = byId("blueSuperEvo") as HTMLButtonElement;
  /** @type {HTMLButtonElement} */
  const rNE = byId("redNormalEvo") as HTMLButtonElement;
  /** @type {HTMLButtonElement} */
  const rSE = byId("redSuperEvo") as HTMLButtonElement;

  if (!bNE || !bSE || !rNE || !rSE) return;

  bNE.textContent = `Evo (${state.players.first.evoCharges ?? 0})`;
  bSE.textContent = `Super (${state.players.first.superEvoCharges ?? 0})`;
  rNE.textContent = `Evo (${state.players.second.evoCharges ?? 0})`;
  rSE.textContent = `Super (${state.players.second.superEvoCharges ?? 0})`;

  const redNormalUnlocked = state.roundCount >= 4;
  const blueNormalUnlocked = state.roundCount >= 5;
  const redSuperUnlocked = state.roundCount >= 6;
  const blueSuperUnlocked = state.roundCount >= 7;

  // Use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";

  bNE.disabled = !(
    isFirstActive &&
    blueNormalUnlocked &&
    !state.players.first.evoUsedThisTurn &&
    state.players.first.evoCharges > 0
  );
  bSE.disabled = !(
    isFirstActive &&
    blueSuperUnlocked &&
    !state.players.first.evoUsedThisTurn &&
    state.players.first.superEvoCharges > 0
  );
  rNE.disabled = !(
    !isFirstActive &&
    redNormalUnlocked &&
    !state.players.second.evoUsedThisTurn &&
    state.players.second.evoCharges > 0
  );
  rSE.disabled = !(
    !isFirstActive &&
    redSuperUnlocked &&
    !state.players.second.evoUsedThisTurn &&
    state.players.second.superEvoCharges > 0
  );

  [bNE, bSE, rNE, rSE].forEach((btn) => {
    btn.removeAttribute("draggable");
    enableEvoButtonDrag(btn, !btn.disabled);
    // Evo sits on the leader attack bar — stop clicks bubbling into
    // canTargetLeader / leader onclick (evolve must never become an attack).
    if (!btn.dataset.evoClickGuard) {
      btn.dataset.evoClickGuard = "1";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }
  });
}
