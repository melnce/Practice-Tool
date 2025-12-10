// src/logic/effects/ops/evolve.ts
import { onEvolve } from "@logic/evolveUtils.js";
import { logEvent } from "@core/logger.js";
import { state } from "@core/gameState.js";
function canEvolve(owner, card, mode = "normal") {
    if (!card || card.type !== "Follower" || card.hasEvolved)
        return false;
    const isBlue = owner === "blue";
    const usedThisTurn = isBlue ? state.blueEvoUsedThisTurn : state.redEvoUsedThisTurn;
    const normalUnlocked = isBlue ? state.roundCount >= 5 : state.roundCount >= 4;
    const superUnlocked = isBlue ? state.roundCount >= 7 : state.roundCount >= 6;
    if (mode === "super") {
        const charges = isBlue ? (state.blueSuperEvoCharges | 0) : (state.redSuperEvoCharges | 0);
        return superUnlocked && !usedThisTurn && charges > 0;
    }
    else {
        const charges = isBlue ? (state.blueEvoCharges | 0) : (state.redEvoCharges | 0);
        return normalUnlocked && !usedThisTurn && charges > 0;
    }
}
export function handleEvolveSelf(sourceCard, owner, opts = {}) {
    const { spendPoint = true, mode = "normal", runEvoEffects = true } = opts; // <-- allow mode
    if (!sourceCard)
        return;
    if (spendPoint && !canEvolve(owner, sourceCard, mode))
        return; // engine gate
    const attackBonus = (mode === "super") ? 3 : 2;
    const defenseBonus = (mode === "super") ? 3 : 2;
    if (!sourceCard.buffs)
        sourceCard.buffs = { attack: 0, defense: 0 };
    sourceCard.buffs.attack += attackBonus;
    sourceCard.buffs.defense += defenseBonus;
    // @ts-ignore
    sourceCard.attack = (parseInt(sourceCard.attack) || 0) + attackBonus;
    // @ts-ignore
    sourceCard.defense = (parseInt(sourceCard.defense) || 0) + defenseBonus;
    // @ts-ignore
    sourceCard.peak_defense = Math.max(sourceCard.peak_defense ?? sourceCard.defense, sourceCard.defense);
    logEvent("evolve", { owner, name: sourceCard.name, uid: sourceCard.uid, mode, atk: +attackBonus, def: +defenseBonus });
    if (sourceCard.evo_image)
        sourceCard.base_image = sourceCard.evo_image;
    if (sourceCard.hasStorm) {
        sourceCard.isRush = false;
        sourceCard.can_attack = true;
    }
    else {
        sourceCard.hasRush = true;
        sourceCard.isRush = true;
        sourceCard.can_attack = true;
    }
    // Spend counters, set evo flags, and (optionally) run the card’s evolve/superevolve script.
    onEvolve(sourceCard, owner, mode, { spendPoint, skipEffects: !runEvoEffects });
}
