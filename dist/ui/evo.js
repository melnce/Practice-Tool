import { byId } from "@ui/dom.js";
export function updateEvoButtonsUI(state) {
    /** @type {HTMLButtonElement} */
    const bNE = byId("blueNormalEvo");
    /** @type {HTMLButtonElement} */
    const bSE = byId("blueSuperEvo");
    /** @type {HTMLButtonElement} */
    const rNE = byId("redNormalEvo");
    /** @type {HTMLButtonElement} */
    const rSE = byId("redSuperEvo");
    if (!bNE || !bSE || !rNE || !rSE)
        return;
    bNE.textContent = `Evo (${state.blueEvoCharges ?? 0})`;
    bSE.textContent = `Super (${state.blueSuperEvoCharges ?? 0})`;
    rNE.textContent = `Evo (${state.redEvoCharges ?? 0})`;
    rSE.textContent = `Super (${state.redSuperEvoCharges ?? 0})`;
    const redNormalUnlocked = state.roundCount >= 4;
    const blueNormalUnlocked = state.roundCount >= 5;
    const redSuperUnlocked = state.roundCount >= 6;
    const blueSuperUnlocked = state.roundCount >= 7;
    bNE.disabled = !(state.isBlueTurn && blueNormalUnlocked && !state.blueEvoUsedThisTurn && (state.blueEvoCharges > 0));
    bSE.disabled = !(state.isBlueTurn && blueSuperUnlocked && !state.blueEvoUsedThisTurn && (state.blueSuperEvoCharges > 0));
    rNE.disabled = !(!state.isBlueTurn && redNormalUnlocked && !state.redEvoUsedThisTurn && (state.redEvoCharges > 0));
    rSE.disabled = !(!state.isBlueTurn && redSuperUnlocked && !state.redEvoUsedThisTurn && (state.redSuperEvoCharges > 0));
    [bNE, bSE, rNE, rSE].forEach(btn => {
        btn.draggable = !btn.disabled;
        btn.ondragstart = (e) => {
            const btnElem = /** @type {HTMLButtonElement} */ (e.currentTarget);
            if (btnElem.disabled) {
                e.preventDefault();
                return;
            }
            e.dataTransfer?.setData("text/plain", btnElem.id);
        };
    });
}
