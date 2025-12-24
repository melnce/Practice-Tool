/**
 * Pure helper functions for stat operations.
 * Extracted from handleStatOrchestrator for single responsibility.
 */
import { state } from "../../../../core/gameState.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { StatOp } from "./types.js";
import { logEvent } from "../../../../core/logger.js";
import { getPlaysThisTurn, getHand, getHP, setHP, setMaxHP } from "../../../../core/playerHelpers.js";

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export function validateStatOp(eff: StatOp): void {
    const hasMode = !!(eff as any).mode;
    const hasAction = !!eff.action;
    const hasTarget = eff.target !== undefined;

    if (!hasMode && !hasAction) {
        throw new Error(
            `[stat] Missing required field: "action". Must be "give" or "set". Effect: ${JSON.stringify(eff)}`,
        );
    }

    if (!hasMode && !hasTarget) {
        throw new Error(
            `[stat] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
        );
    }
}

// -----------------------------------------------------------------------------
// Special Modes
// -----------------------------------------------------------------------------

export function isSpecialMode(eff: StatOp): boolean {
    const mode = (eff as any).mode;
    return mode === "combo_repeat" || mode === "double";
}

export function getComboCount(owner: Player): number {
    return getPlaysThisTurn(state, owner);
}

// -----------------------------------------------------------------------------
// Special Targets Detection
// -----------------------------------------------------------------------------

export type SpecialTarget =
    | "self"
    | "ally:leader"
    | "enemy:leader"
    | "hand"
    | "last_added_to_hand"
    | null;

export function detectSpecialTarget(eff: StatOp): SpecialTarget {
    const target = String(eff.target || "").toLowerCase();

    if (target === "self") return "self";
    if (target === "ally:leader") return "ally:leader";
    if (target === "enemy:leader") return "enemy:leader";
    if (target === "hand") return "hand";
    if (target === "last_added_to_hand") return "last_added_to_hand";

    return null;
}

// -----------------------------------------------------------------------------
// Leader Stat Handling
// -----------------------------------------------------------------------------

export function applyLeaderStat(
    targetOwner: Player,
    action: string | undefined,
    defense: number,
): void {
    if (action === "set") {
        setMaxHP(state, targetOwner, defense);
        setHP(state, targetOwner, Math.min(getHP(state, targetOwner), defense));
        logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: defense });
    }
}

// -----------------------------------------------------------------------------
// Hand Buff Handling
// -----------------------------------------------------------------------------

export function applyHandBuff(
    owner: Player,
    eff: StatOp,
): void {
    const hand = getHand(state, owner);
    const a = parseInt((eff.attack as any) ?? 0) || 0;
    const d = parseInt((eff.defense as any) ?? 0) || 0;

    for (const card of hand) {
        if (!matchesHandFilter(card, eff)) continue;

        if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
        card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
        card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
        card.attack = (parseInt(String(card.attack)) || 0) + a;
        card.defense = (parseInt(String(card.defense)) || 0) + d;

        logEvent("buffHand", { owner, target: card.name, uid: card.uid, a, d });
    }
}

function matchesHandFilter(card: CardInstance, eff: StatOp): boolean {
    if (card.type !== "Follower") return false;
    if ((eff as any).class && card.class !== (eff as any).class) return false;
    if (
        (eff as any).tribe &&
        (!Array.isArray(card.tribes) || !card.tribes.includes((eff as any).tribe))
    ) return false;
    if (eff.condition?.class && card.class !== eff.condition.class) return false;
    if (
        eff.condition?.tribe &&
        (!Array.isArray(card.tribes) || !card.tribes.includes(eff.condition.tribe))
    ) return false;
    return true;
}

// -----------------------------------------------------------------------------
// Last Added To Hand Buff
// -----------------------------------------------------------------------------

export function applyLastAddedToHandBuff(owner: Player, eff: StatOp): void {
    const card = state.lastAddedToHand;
    if (!card) return;

    const a = parseInt((eff.attack as any) ?? 0) || 0;
    const d = parseInt((eff.defense as any) ?? 0) || 0;

    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
    card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
    card.attack = (parseInt(String(card.attack)) || 0) + a;
    card.defense = (parseInt(String(card.defense)) || 0) + d;

    logEvent("buffLastAddedToHand", {
        owner,
        name: card.name,
        uid: card.uid,
        a,
        d,
    });
}

// -----------------------------------------------------------------------------
// Random Selection
// -----------------------------------------------------------------------------

export function pickRandomFromPool(
    pool: CardInstance[],
    count: number,
): CardInstance[] {
    if (count <= 0) return [];

    const chosen: CardInstance[] = [];
    const bag = [...pool];

    for (let i = 0; i < count && bag.length; i++) {
        const idx = state.rng.nextInt(bag.length);
        const picked = bag.splice(idx, 1)[0];
        if (picked) chosen.push(picked);
    }

    return chosen;
}















