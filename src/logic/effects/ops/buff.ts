// src/logic/effects/ops/buff.ts
import { handleBuffOrchestrator } from "./buff/orchestrator.js";
import { Effect, Player, CardInstance } from "../../../core/types.js";
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import { cleanupDead } from "../../core/cleanup.js";
import { getPool } from "../../core/targeting.js"; // Needed for other handlers

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT (Refactored)
// -----------------------------------------------------------------------------
export function handleBuff(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any, context: any = {}) {
    return handleBuffOrchestrator(eff as any, owner, sourceCard, effectsQueue, context);
}

// -----------------------------------------------------------------------------
// LEGACY / SPECIALIZED HANDLERS (Preserved)
// LEGACY: Preserved for determinism/replay compatibility — specialized handlers are intentionally separate.
// -----------------------------------------------------------------------------

export function handleBuffHandTribe(eff: Effect, owner: Player) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const a = parseInt(eff.attack as any ?? 0) || 0;
    const d = parseInt(eff.defense as any ?? 0) || 0;

    for (const card of hand) {
        if (card.type === "Follower" && Array.isArray(card.tribes) && card.tribes.includes(eff.tribe)) {
            if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
            card.buffs.attack = (card.buffs.attack ?? 0) + a;
            card.buffs.defense = (card.buffs.defense ?? 0) + d;

            // @ts-ignore
            card.attack = (parseInt(card.attack) || 0) + a;
            // @ts-ignore
            card.defense = (parseInt(card.defense) || 0) + d;

            // keep previews coherent
            // @ts-ignore
            card.potential_attack = (card.potential_attack ?? card.base_attack ?? card.attack) + a;
            // @ts-ignore
            card.potential_defense = (card.potential_defense ?? card.base_defense ?? card.defense) + d;
            logEvent("buffHand", { owner, target: card.name, uid: card.uid, a: a, d: d, filter: eff.tribe });
        }
    }
}

export function handleBuffHandClass(eff: Effect, owner: Player) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const a = parseInt(eff.attack as any ?? 0) || 0;
    const d = parseInt(eff.defense as any ?? 0) || 0;
    const wantClass = String(eff.class || "").trim();

    if (!wantClass) return;

    for (const card of hand) {
        if (card.type === "Follower" && card.class === wantClass) {
            if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
            card.buffs.attack = (card.buffs.attack ?? 0) + a;
            card.buffs.defense = (card.buffs.defense ?? 0) + d;

            // @ts-ignore
            card.attack = (parseInt(card.attack) || 0) + a;
            // @ts-ignore
            card.defense = (parseInt(card.defense) || 0) + d;

            // keep previews coherent
            // @ts-ignore
            card.potential_attack = (card.potential_attack ?? card.base_attack ?? card.attack) + a;
            // @ts-ignore
            card.potential_defense = (card.potential_defense ?? card.base_defense ?? card.defense) + d;
            logEvent("buffHand", { owner, target: card.name, uid: card.uid, a: a, d: d, filter: wantClass });
        }
    }
}

export function handleBuffLastAddedToHand(eff: Effect, owner: Player) {
    const card = state.lastAddedToHand;
    if (!card) return;

    const a = parseInt(eff.attack as any ?? 0) || 0;
    const d = parseInt(eff.defense as any ?? 0) || 0;

    // Ensure base stats stay as the printed values
    // @ts-ignore
    if (card.base_attack == null) card.base_attack = parseInt(card.attack) || 0;
    // @ts-ignore
    if (card.base_defense == null) card.base_defense = parseInt(card.defense) || 0;

    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack = (card.buffs.attack ?? 0) + a;
    card.buffs.defense = (card.buffs.defense ?? 0) + d;

    // @ts-ignore
    card.attack = (parseInt(card.attack) || 0) + a;
    // @ts-ignore
    card.defense = (parseInt(card.defense) || 0) + d;

    card.potential_attack = (card.base_attack ?? 0) + (card.buffs.attack ?? 0);
    card.potential_defense = (card.base_defense ?? 0) + (card.buffs.defense ?? 0);
    logEvent("buffLastAddedToHand", { owner, name: card.name, uid: card.uid, a: a, d: d });
}

// Repeat a single buff once per current Combo (plays this turn).
export function handleComboRepeatBuff(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any[] = [], context: any = {}) {
    const plays =
        owner === "blue" ? (state.bluePlaysThisTurn || 0)
            : (state.redPlaysThisTurn || 0);
    if (plays <= 0) return;
    logEvent("comboRepeatBuff", { owner, plays });

    const inner = {
        op: "buff",
        target: eff.target,
        random: (eff as any).random,
        count: (eff as any).count,
        attack: eff.attack,
        defense: eff.defense,
        include_self: (eff as any).include_self,
        condition: eff.condition
    };

    for (let i = 0; i < plays; i++) {
        const res = handleBuff(inner as any, owner, sourceCard, effectsQueue, context);
        if (res === "pending") return res;
    }
}

// NEW: set all matched targets' attack to a fixed value
export function handleSetAttackTo(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any, context: any = {}) {
    const pool = getPool(eff.target as any, owner, null, eff.condition, context)
        .filter(c => c.type === "Follower");

    if (!pool.length) return "done";

    const to = parseInt((eff.value ?? (eff as any).set_to ?? (eff as any).attack_to ?? 0) as any) || 0;

    for (const target of pool) {
        // @ts-ignore
        const current = parseInt(target.attack) || 0;
        const delta = to - current;

        // ensure buffs container
        if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

        // Apply as a buff delta
        target.buffs.attack = (target.buffs.attack ?? 0) + delta;
        // @ts-ignore
        target.attack = current + delta;

        // keep previews coherent
        // @ts-ignore
        if (!target.potential_attack) target.potential_attack = target.base_attack || target.attack;
        target.potential_attack! += delta;
        logEvent("setAttackTo", { owner, target: target.name, uid: target.uid, to });
    }
    return "done";
}

// NEW: set all matched targets' stats to fixed values
export function handleSetStats(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any, context: any = {}) {
    let pool = (context?.targets && context.targets.length)
        ? context.targets
        : getPool(eff.target as any, owner, null, eff.condition, context)
            .filter(c => c.type === "Follower");

    pool = pool.filter((c: CardInstance) => c.type === "Follower");

    if (!pool.length) return "done";

    const setA = (eff.attack !== undefined) ? (parseInt(eff.attack as any) || 0) : null;
    const setD = (eff.defense !== undefined) ? (parseInt(eff.defense as any) || 0) : null;

    for (const target of pool) {
        if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

        if (setA !== null) {
            // @ts-ignore
            const currentA = parseInt(target.attack) || 0;
            const deltaA = setA - currentA;
            target.buffs.attack = (target.buffs.attack ?? 0) + deltaA;
            // @ts-ignore
            target.attack = setA;
            // @ts-ignore
            if (!target.potential_attack) target.potential_attack = target.base_attack || currentA;
            target.potential_attack! += deltaA;
        }

        if (setD !== null) {
            // @ts-ignore
            const currentD = parseInt(target.defense) || 0;
            const deltaD = setD - currentD;
            target.buffs.defense = (target.buffs.defense ?? 0) + deltaD;
            // @ts-ignore
            target.defense = setD;
            // @ts-ignore
            if (!target.potential_defense) target.potential_defense = target.base_defense || currentD;
            target.potential_defense! += deltaD;

            // @ts-ignore
            target.peak_defense = Math.max(target.peak_defense ?? target.defense, target.defense);
        }

        logEvent("setStats", { owner, target: target.name, uid: target.uid, a: setA, d: setD });
    }

    cleanupDead();
    return "done";
}
