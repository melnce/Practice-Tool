// src/ui/evo.ts
import { byId } from "./dom.js";
import { GameState } from "../core/types.js";

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

  bNE.textContent = `Evo (${state.blueEvoCharges ?? 0})`;
  bSE.textContent = `Super (${state.blueSuperEvoCharges ?? 0})`;
  rNE.textContent = `Evo (${state.redEvoCharges ?? 0})`;
  rSE.textContent = `Super (${state.redSuperEvoCharges ?? 0})`;

  const redNormalUnlocked = state.roundCount >= 4;
  const blueNormalUnlocked = state.roundCount >= 5;
  const redSuperUnlocked = state.roundCount >= 6;
  const blueSuperUnlocked = state.roundCount >= 7;

  bNE.disabled = !(
    state.isBlueTurn &&
    blueNormalUnlocked &&
    !state.blueEvoUsedThisTurn &&
    state.blueEvoCharges > 0
  );
  bSE.disabled = !(
    state.isBlueTurn &&
    blueSuperUnlocked &&
    !state.blueEvoUsedThisTurn &&
    state.blueSuperEvoCharges > 0
  );
  rNE.disabled = !(
    !state.isBlueTurn &&
    redNormalUnlocked &&
    !state.redEvoUsedThisTurn &&
    state.redEvoCharges > 0
  );
  rSE.disabled = !(
    !state.isBlueTurn &&
    redSuperUnlocked &&
    !state.redEvoUsedThisTurn &&
    state.redSuperEvoCharges > 0
  );

  [bNE, bSE, rNE, rSE].forEach((btn) => {
    btn.draggable = !btn.disabled;
    btn.ondragstart = (e) => {
      const btnElem = e.currentTarget as HTMLButtonElement;
      if (btnElem.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer?.setData("text/plain", btnElem.id);
    };
  });
}
