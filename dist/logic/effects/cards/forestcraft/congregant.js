// gamelogic/effects/cards/forestcraft/congregant.js
import { state } from "@core/gameState.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { medicalAssassinOnFollowerEnter } from "@logic/effects/cards/portalcraft/medicalAssassin.js";
import { rand, randInt, makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
function boardOf(owner) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}
/**
 * Create a deep copy of the previous instance, apply -1 DEF,
 * mark it as chain-spawned to suppress re-entry cascade.
 */
function makeChainClone(prev, owner) {
    const clone = (typeof structuredClone === "function")
        ? structuredClone(prev)
        : JSON.parse(JSON.stringify(prev));
    // Identity/placement
    clone.uid = makeUid();
    clone.owner = owner;
    clone.zone = "board";
    clone.selected = false;
    clone.selectable = false;
    clone.glow = false;
    // Ensure structures
    clone.triggers = Array.isArray(clone.triggers) ? clone.triggers : [];
    clone.keywords = Array.isArray(clone.keywords) ? clone.keywords : [];
    clone.buffs = clone.buffs || { attack: 0, defense: 0 };
    // Normalize numbers from prev
    const prevAtk = parseInt(prev.attack) || 0;
    const prevDef = parseInt(prev.defense) || 0;
    const prevBaseA = Number.isFinite(prev.base_attack) ? prev.base_attack : prevAtk - (parseInt(prev.buffs?.attack) || 0);
    const prevBaseD = Number.isFinite(prev.base_defense) ? prev.base_defense : prevDef - (parseInt(prev.buffs?.defense) || 0);
    const buffA = parseInt(prev.buffs?.attack) || 0;
    const buffD = parseInt(prev.buffs?.defense) || 0;
    // EXACT copy but with -1 to the MAX HP (base_defense)
    const newBaseD = Math.max(0, prevBaseD - 1);
    // Attack copies exactly (base + buffs)
    clone.base_attack = prevBaseA;
    clone.attack = prevBaseA + buffA;
    // Defense copies with reduced MAX: base_defense -1, keep buffs
    clone.base_defense = newBaseD;
    clone.defense = newBaseD + buffD;
    // Keep potentials aligned so DEF is white (not damaged)
    clone.potential_attack = clone.base_attack + buffA;
    clone.potential_defense = clone.base_defense + buffD;
    // Peak is this instance's full current DEF
    clone.peak_defense = clone.defense;
    clone.peak_attack = Math.max(clone.peak_attack ?? clone.attack, clone.attack);
    // Turn/attack flags
    clone.justPlayed = true;
    clone.hasAttacked = false;
    clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn) ? clone.attacks_per_turn : 1;
    clone.attacks_left = clone.attacks_per_turn;
    // Rush/Storm handling
    if (clone.hasStorm) {
        clone.can_attack = true;
        clone.can_attack_followers = true;
        clone.isRush = false;
    }
    else if (clone.hasRush) {
        clone.can_attack = true; // followers only this turn
        clone.can_attack_followers = true;
        clone.isRush = true;
    }
    else {
        clone.can_attack = false;
        clone.can_attack_followers = false;
        clone.isRush = false;
    }
    // Prevent re-entrant cascade from chain-spawned copies
    clone._spawnedByCongregant = true;
    // Ensure UI "damaged" flag is false (white DEF)
    clone.isDamaged = false;
    return clone;
}
/**
 * Public hook: call this after a follower is placed + its normal enter
 * triggers have fired. If the entering card is Congregrant, fill the board
 * with a -1 DEF chain: X/Y, X/(Y-1), X/(Y-2), ... until full or DEF would be 0.
 */
export function handleCongregantOnEnter(owner, enteringCard) {
    if (!enteringCard || enteringCard.type !== "Follower")
        return;
    if (String(enteringCard.name) !== "Congregant of Unkilling")
        return;
    // Don’t start a new cascade from chain-spawned copies
    if (enteringCard._spawnedByCongregant)
        return;
    const board = boardOf(owner);
    // Chain from the *latest* instance; stop if DEF would drop to 0 or board is full.
    let prev = enteringCard;
    while (board.length < 5) {
        const nextDef = (parseInt(prev.defense, 10) || 0) - 1;
        if (nextDef <= 0)
            break;
        const clone = makeChainClone(prev, owner);
        // Respect max board size
        if (board.length >= 5)
            break;
        board.push(clone);
        logEvent("congregantSpawn", { owner, name: clone.name, uid: clone.uid, base_defense: clone.base_defense });
        // Rally for followers
        if (owner === "blue")
            state.blueRally++;
        else
            state.redRally++;
        // Per-enter hooks & triggers (keep parity with pushToBoard)
        medicalAssassinOnFollowerEnter(owner, clone);
        fireTrigger("ally_follower_enter", owner, { enteringCard: clone });
        fireTrigger("enemy_follower_enter", owner, { enteringCard: clone });
        // Next link in the chain is the clone we just placed
        prev = clone;
    }
}
