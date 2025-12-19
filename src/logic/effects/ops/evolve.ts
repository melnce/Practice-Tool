// src/logic/effects/ops/evolve.ts
import { onEvolve } from "../../evolveUtils.js";
import { logEvent } from "../../../core/logger.js";
import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";

function canEvolve(owner: Player, card: CardInstance, mode = "normal") {
    if (!card || card.type !== "Follower" || card.hasEvolved) return false;
    const isBlue = owner === "blue";
    const usedThisTurn = isBlue ? state.blueEvoUsedThisTurn : state.redEvoUsedThisTurn;
    const normalUnlocked = isBlue ? state.roundCount >= 5 : state.roundCount >= 4;
    const superUnlocked = isBlue ? state.roundCount >= 7 : state.roundCount >= 6;
    if (mode === "super") {
        const charges = isBlue ? (state.blueSuperEvoCharges | 0) : (state.redSuperEvoCharges | 0);
        return superUnlocked && !usedThisTurn && charges > 0;
    } else {
        const charges = isBlue ? (state.blueEvoCharges | 0) : (state.redEvoCharges | 0);
        return normalUnlocked && !usedThisTurn && charges > 0;
    }
}

export function handleEvolveSelf(sourceCard: CardInstance, owner: Player, opts: any = {}) {
    const { spendPoint = true, mode = "normal", runEvoEffects = true } = opts; // <-- allow mode
    if (spendPoint && !canEvolve(owner, sourceCard, mode)) return; // engine gate

    const attackBonus = (mode === "super") ? 3 : 2;
    const defenseBonus = (mode === "super") ? 3 : 2;

    if (!sourceCard.buffs) sourceCard.buffs = { attack: 0, defense: 0 };
    sourceCard.buffs.attack = (sourceCard.buffs.attack ?? 0) + attackBonus;
    sourceCard.buffs.defense = (sourceCard.buffs.defense ?? 0) + defenseBonus;

    sourceCard.attack = (parseInt(String(sourceCard.attack)) || 0) + attackBonus;
    sourceCard.defense = (parseInt(String(sourceCard.defense)) || 0) + defenseBonus;
    sourceCard.peak_defense = Math.max(sourceCard.peak_defense ?? (sourceCard.defense as number), sourceCard.defense as number);
    logEvent("evolve", { owner, name: sourceCard.name, uid: sourceCard.uid, mode, atk: +attackBonus, def: +defenseBonus });
    if (sourceCard.evo_image) sourceCard.base_image = sourceCard.evo_image;

    if (sourceCard.hasStorm) {
        sourceCard.isRush = false;
        sourceCard.can_attack = true;
    } else {
        sourceCard.hasRush = true;
        sourceCard.isRush = true;
        sourceCard.can_attack = true;
    }

    // Spend counters, set evo flags, and (optionally) run the card’s evolve/superevolve script.
    onEvolve(sourceCard, owner, mode, { spendPoint, skipEffects: !runEvoEffects });
}

export function handleEvolveTarget(eff: any, owner: Player, context: any = {}) {
    const target = (context && (context.targetCard || context.selectedCard || context.playedCard || context.enteringCard || (context.targets && context.targets[0]))) || null;
    if (!target) {
        console.warn("handleEvolveTarget: No target found in context.");
        return;
    }
    const mode = eff.mode || "normal";
    const spendPoint = eff.spendPoint === true;

    handleEvolveSelf(target, owner, { mode, spendPoint, runEvoEffects: true });
}

export function handleEvolveLastSummoned(owner: Player) {
    console.log(`[evolve_last_summoned] LastSummoned length: ${state.lastSummoned?.length}`);
    if (!state.lastSummoned || state.lastSummoned.length === 0) return;

    // Create a copy to avoid mutation issues during iteration if evolve triggers further summons (unlikely but safe)
    const targets = [...state.lastSummoned];

    for (const card of targets) {
        console.log(`[evolve_last_summoned] Checking card: ${card.name} (${card.uid}) Zone: ${card.zone} Type: ${card.type} Evolved: ${card.hasEvolved}`);
        if (card.zone === "board" && card.type === "Follower" && !card.hasEvolved) {
            handleEvolveSelf(card, owner, { spendPoint: false });
        }
    }
}
