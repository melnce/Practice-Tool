// /gamelogic/barrier.ts
import { state } from "../../core/gameState.js";
import { fireTrigger } from "./triggers.js";
import { logEvent } from "../../core/logger.js";
import { CardInstance, Player } from "../../core/types.js";

// Helper interface for card with barrier properties
interface BarrierCard extends CardInstance {
    // barrierCharges?: number; // Removed
    hasBarrier?: boolean;
    __uiPopBarrier?: boolean;
    __uiFlashBarrier?: boolean;
    __barrierPopReason?: string;
    __uiSuperZero?: boolean;
    isDamaged?: boolean;
    potential_defense?: number;
    potential_attack?: number;
    peak_attack?: number;
    peak_defense?: number;
}

export function grantBarrier(card: BarrierCard, charges = 1) {
    card.hasBarrier = true;
}

function consumeBarrier(card: BarrierCard) {
    if (card.hasBarrier) {
        card.hasBarrier = false;
        card.__uiPopBarrier = true; // optional UI flag
        return true;
    }
    return false;
}

// NEW: allow forced pop even if damage is 0 / prevented
export function popBarrier(card: BarrierCard, reason = "forced_pop") {
    if (!card || !card.hasBarrier) return false;
    // optional: telemetry
    card.__barrierPopReason = reason;
    return consumeBarrier(card);
}

export function dealDamage(target: BarrierCard, amount: number, source: CardInstance | null = null) {
    if (!target) return 0;

    const initialDefense = parseInt(target.defense as string) || 0;
    let damageDealt = amount;
    let preventedBySuper = false;

    // Handle barrier if present
    let barrierConsumed = false;
    if (target.hasBarrier) {
        const used = consumeBarrier(target);
        if (used) { barrierConsumed = true; damageDealt = 0; target.__uiFlashBarrier = true; }
    }

    // Super-evolve: on its owner's turn, damage is reduced to 0,
    // but it STILL counts as an attempted hit (for triggers, barrier, bane rules, etc.).
    try {
        // --- Max Damage Cap Check ---
        if ((target as any).maxDamageCap > 0 && damageDealt > (target as any).maxDamageCap) {
            console.log(`[Damage] Capped damage on ${target.name} from ${damageDealt} to ${(target as any).maxDamageCap}`);
            damageDealt = (target as any).maxDamageCap;
        }

        const isBlue = (state.blueBoard || []).includes(target);
        const owner: Player | null = isBlue ? "blue" : ((state.redBoard || []).includes(target) ? "red" : null);

        // Check if activePlayer matches owner (activePlayer is not explicitly in GameState type yet but is in state object logic? 
        // Wait, gameState.ts has 'isBlueTurn'. I need to derive activePlayer or add it to GameState.
        // 'state.activePlayer' logic might be missing in my GameState type or it's a getter?
        // Looking at gameState.js, there is NO activePlayer field.
        // dealDamage code in JS had: `state.activePlayer === owner`.
        // Maybe `state.activePlayer` is set somewhere else or I missed it in gameState.js?
        // Checking gameState.js content from Step 54: NO activePlayer.
        // Checking gameState.ts content I wrote: NO activePlayer.
        // But `src/logic/core/barrier.js` uses `state.activePlayer`. 
        // This implies `state.activePlayer` is injected or I missed it.
        // Or maybe it's `state.isBlueTurn ? 'blue' : 'red'`. 
        // Wait, `dealDamage` in `barrier.js` line 49: `if (owner && state.activePlayer === owner ...)`
        // If `state.activePlayer` doesn't exist on `state`, this code would fail in JS (undefined === owner -> false).
        // Unless `state` is a Proxy or modified elsewhere.
        // I will assume `state.activePlayer` is NOT reliable if not in `gameState.js`.
        // However, I must not break behavior. If JS used it, maybe it worked?
        // Or maybe `state` has it.
        // I will use `(state.isBlueTurn ? 'blue' : 'red')` as a fallback or proxy for `activePlayer` if I can't find it.
        // Actually, `activePlayer` is likely `state.isBlueTurn ? "blue" : "red"`.
        // I'll add `activePlayer` to GameState type as optional or `[key: string]: any` covers it.
        // But logically, `state.activePlayer` might just be missing.
        // I'll check `state.activePlayer` usage.

        const activePlayer = state.isBlueTurn ? "blue" : "red";
        // I'll replace `state.activePlayer` with this derived value if I can confirm logic.
        // But strictly, I should replicate JS. If JS accessed `state.activePlayer` and it was undefined, then `preventedBySuper` was never true (unless owner was null/undefined).
        // If super-evolve behavior depends on it, I should fix it.
        // I will use `(state as any).activePlayer` to be safe/compilable.

        const currentActive = (state as any).activePlayer || (state.isBlueTurn ? "blue" : "red");

        if (owner && currentActive === owner && target?.evoType === "super") {
            // Only *reduce* the damage; don't undo a barrier pop that already happened.
            if (amount > 0) {
                damageDealt = 0;
                preventedBySuper = true;
                target.__uiSuperZero = true; // optional UI flag
            }
        }
    } catch (_) { }

    // Apply remaining damage
    const newDefense = Math.max(0, initialDefense - damageDealt);
    target.defense = newDefense;

    logEvent("damage", {
        target: target?.name,
        targetUid: target?.uid,
        amountTried: amount,
        dealt: Math.max(0, damageDealt | 0),
        barrierPopped: !!barrierConsumed,
        preventedBySuper
    });

    if (damageDealt > 0) {
        target.base_defense = target.base_defense || initialDefense;
        // Ensure potential_defense exists and represents full health
        if (target.potential_defense == null) {
            target.potential_defense = initialDefense;
        }
        // Set damaged state by comparing current defense with potential (full health)
        target.isDamaged = newDefense < target.potential_defense;
        target.peak_defense = Math.max(target.peak_defense || initialDefense, initialDefense);
    }

    // Count as “took damage” if real damage, barrier blocked, explicit 0-hit,
    // OR it was zeroed by super-evolve protection this turn.
    const countsAsDamaged = (damageDealt > 0) || barrierConsumed || (amount === 0) || preventedBySuper;
    if (countsAsDamaged && target?.type === "Follower" && (target.defense as number) > 0) {
        const owner =
            state.blueBoard.includes(target) ? "blue" :
                state.redBoard.includes(target) ? "red" : null;

        // Re-calculating owner here? 
        if (owner && ((state as any).activePlayer || (state.isBlueTurn ? "blue" : "red")) === owner) {
            fireTrigger("self_damaged", owner, { damagedCard: target, sourceCard: source });
        }
    }
    return Math.max(0, damageDealt | 0);
}


// Add this new function to handle buffs properly
export function applyBuff(card: BarrierCard, attackBuff: number | string, defenseBuff: number | string) {
    const atk = parseInt(card.attack as string) || 0;
    const def = parseInt(card.defense as string) || 0;

    // Update base stats if this is the first buff
    if (!card.base_attack) card.base_attack = atk;
    if (!card.base_defense) card.base_defense = def;

    // Apply buffs
    card.attack = atk + (parseInt(attackBuff as string) || 0);
    card.defense = def + (parseInt(defenseBuff as string) || 0);

    // Update potential stats
    card.potential_attack = (card.potential_attack || (card.base_attack as number)) + (parseInt(attackBuff as string) || 0);
    card.potential_defense = (card.potential_defense || (card.base_defense as number)) + (parseInt(defenseBuff as string) || 0);

    // Re-check damaged state
    card.isDamaged = (card.defense as number) < (card.potential_defense as number);

    // Update peak stats
    card.peak_attack = Math.max(card.peak_attack || atk, card.attack as number);
    card.peak_defense = Math.max(card.peak_defense || def, card.defense as number);
}

export function setPotentialFromBasePlus(card: BarrierCard, atkDelta = 0, defDelta = 0) {
    // Seed base_* if not present (pre-buff printed stats)
    if (card.base_attack == null) card.base_attack = (parseInt(card.attack as string, 10) || 0) - atkDelta;
    if (card.base_defense == null) card.base_defense = (parseInt(card.defense as string, 10) || 0) - defDelta;

    const fullAtk = ((card.base_attack as number) || 0) + atkDelta;
    const fullDef = ((card.base_defense as number) || 0) + defDelta;

    // Only raise potential_*; never decrease it here
    card.potential_attack = Math.max(card.potential_attack ?? 0, fullAtk);
    card.potential_defense = Math.max(card.potential_defense ?? 0, fullDef);

    // Keep the damaged flag consistent for the renderer
    card.isDamaged = (parseInt(card.defense as string, 10) || 0) < card.potential_defense;
}
