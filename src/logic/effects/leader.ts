import { state } from "../../core/gameState.js";
import { logEvent } from "../../core/logger.js";
import { Effect, Player, GameState } from "../../core/types.js";
import { fireTrigger } from "../core/triggers.js";

/**
 * Handles healing a leader's defense.
 * Now respects the dynamic maximum HP for each player.
 */
export function handleHealLeader(owner: Player, eff: Effect) {
    const amt = parseInt(eff.amount) || 0;

    const targetPlayerIsBlue =
        (eff.player || "self") === "self" ? owner === "blue" : owner !== "blue";

    logEvent("healLeader", { target: targetPlayerIsBlue ? "blue" : "red", amount: amt });

    // Apply healing, respecting the new dynamic max HP
    if (targetPlayerIsBlue) {
        state.blueHP = Math.max(0, Math.min(state.blueMaxHP, state.blueHP + amt));
    } else {
        state.redHP = Math.max(0, Math.min(state.redMaxHP, state.redHP + amt));
    }
}

/**
 * NEW: Sets a leader's maximum HP to a specific value.
 */
export function handleSetMaxHP(eff: Effect, owner: Player) {
    const targetPlayerString = eff.player || "self"; // 'self' or 'opponent'
    const amount = parseInt(eff.amount) || 20;

    const isOpponent = targetPlayerString === "opponent";
    const targetOwner: Player = isOpponent ? (owner === "blue" ? "red" : "blue") : owner;

    logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: amount });

    if (targetOwner === "blue") {
        state.blueMaxHP = amount;
        // Clamp current HP to the new max (no accidental +amt)
        state.blueHP = Math.max(0, Math.min(state.blueMaxHP, state.blueHP));
    } else {
        state.redMaxHP = amount;
        state.redHP = Math.max(0, Math.min(state.redMaxHP, state.redHP));
    }
}

/**
 * Handles recovering a player's play points for the current turn.
 * (This function is unchanged)
 */
export function handleRecoverPP(owner: Player, eff: Effect) {
    // Determine target side
    const targetIsBlue =
        (eff.player || "self") === "self" ? owner === "blue" : owner !== "blue";

    const cur = targetIsBlue ? state.bluePP : state.redPP;
    const max = targetIsBlue ? state.blueMaxPP : state.redMaxPP;

    // Allow symbolic "full" refills (your card uses "currentMaxPP")
    let amt;
    if (
        typeof eff.amount === "string" &&
        eff.amount.toLowerCase() === "currentmaxpp"
    ) {
        amt = Math.max(0, max - cur);
    } else {
        amt = parseInt(eff.amount) || 0;
    }

    const next = Math.min(max, cur + amt);
    if (targetIsBlue) state.bluePP = next;
    else state.redPP = next;
}

/**
 * (This function is unchanged but will now work correctly
 * because it calls the updated handleHealLeader)
 */
export function handleDynamicHealLeader(owner: Player, eff: Effect) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const amt = hand.length; // X is number of cards in hand
    handleHealLeader(owner, { ...eff, amount: amt });
}

/* ---------- NEW: leader barrier state ops ---------- */
export function grantLeaderBarrier(owner: Player, _charges = 1) {
    // Ignore extra charges: once the leader has Barrier, do nothing.
    const key = owner === "blue" ? "blueLeaderBarrier" : "redLeaderBarrier";
    if (state[key]) return; // already has Barrier

    const s = state as any; // Allow dynamic access for now or update GameState to have index signature
    s[key] = 1;
    logEvent("leaderBarrierGrant", { owner });
}

export function popLeaderBarrier(owner: Player, reason = "damage_prevent") {
    const key = owner === "blue" ? "blueLeaderBarrier" : "redLeaderBarrier";
    const s = state as any;
    if (!s[key]) return false;

    logEvent("leaderBarrierPop", { owner, reason });
    s[key] = 0;
    const fxKey =
        owner === "blue" ? "blueLeaderBarrierPopped" : "redLeaderBarrierPopped";
    s[fxKey] = reason;
    return true;
}

/** Centralized leader damage that respects barrier and max HP */
export function applyLeaderDamage(owner: Player, amount: number) {
    const hpKey = owner === "blue" ? "blueHP" : "redHP";
    // const maxKey = owner === "blue" ? "blueMaxHP" : "redMaxHP"; // Unused

    if ((amount | 0) <= 0) return 0;

    logEvent("leaderDamage", { owner, amount });

    // Barrier soaks the *whole packet* and consumes 1 charge
    if (popLeaderBarrier(owner, "leader_hit")) return 0;

    const s = state as any;
    const cur = s[hpKey] | 0;
    const next = Math.max(0, cur - (amount | 0));
    s[hpKey] = next;

    const actualDamage = cur - next;

    // Fire leader_damaged trigger AFTER damage is applied
    if (actualDamage > 0) {
        fireTrigger("leader_damaged", owner, {
            damagedLeader: owner,
            amount: actualDamage
        });
    }

    return actualDamage;
}

/* ---------- NEW: effect op for cards ---------- */
export function handleLeaderBarrierOp(owner: Player, eff: Effect) {
    const target: Player =
        (eff.player || "self") === "self"
            ? owner
            : owner === "blue"
                ? "red"
                : "blue";
    // Ignore eff.charges / eff.amount > 1
    grantLeaderBarrier(target, 1);
}
// NEW: Recover Evolution Points (capped at starting max)
export function handleRecoverEP(owner: Player, eff: Effect) {
    const amt = parseInt(eff.amount) || 0;
    const isBlue = (eff.player || "self") === "self" ? owner === "blue" : owner !== "blue";
    const MAX_EP = 2; // Starting maximum for both players
    if (isBlue) {
        state.blueEvoCharges = Math.min(MAX_EP, (state.blueEvoCharges || 0) + amt);
    } else {
        state.redEvoCharges = Math.min(MAX_EP, (state.redEvoCharges || 0) + amt);
    }
    logEvent("recoverEP", { owner: isBlue ? "blue" : "red", amount: amt });
}

