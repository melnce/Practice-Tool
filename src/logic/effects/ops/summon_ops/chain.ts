import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { makeUid } from "../../../../core/rng.js";
import { fireTrigger } from "../../../core/triggers.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { boardOf } from "./utils.js";

// =============== Generic Board Fill Chain ===============

/**
 * Create a specialized clone of the previous instance, apply -1 DEF,
 * and mark it as chain-spawned to suppress re-entry cascade.
 * 
 * Logic generalized from Congregant of Unkilling to work for any card.
 */
export function makeChainDecayClone(prev: CardInstance, owner: Player): CardInstance {
    // START MANUAL CLONE to avoid circular JSON failures
    // We only take the properties we need or are safe to copy.
    const clone: CardInstance = {
        ...prev, // Shallow copy first (primitives + references)
        // Overwrite references we need to be unique
        triggers: Array.isArray(prev.triggers) ? [...prev.triggers] : [], // Shallow copy array
        keywords: Array.isArray(prev.keywords) ? [...prev.keywords] : [],
        buffs: prev.buffs ? { ...prev.buffs } : { attack: 0, defense: 0 },
        // Clear dangerous circular refs if they exist in shallow copy
        __state: undefined,
    } as any;
    // END MANUAL CLONE

    // Identity/placement
    clone.uid = makeUid();
    clone.owner = owner;
    clone.zone = "board";
    clone.selected = false;
    clone.selectable = false;
    clone.glow = false;

    // Normalize numbers from prev
    const prevAtk = parseInt(String(prev.attack)) || 0;
    const prevDef = parseInt(String(prev.defense)) || 0;
    // @ts-ignore
    const prevBaseA = Number.isFinite(prev.base_attack) ? prev.base_attack : prevAtk - (parseInt(prev.buffs?.attack) || 0);
    // @ts-ignore
    const prevBaseD = Number.isFinite(prev.base_defense) ? prev.base_defense : prevDef - (parseInt(prev.buffs?.defense) || 0);
    const buffA = parseInt(String(prev.buffs?.attack)) || 0;
    const buffD = parseInt(String(prev.buffs?.defense)) || 0;

    // DECAY: -1 to the MAX HP (base_defense)
    const newBaseD = Math.max(0, (prevBaseD as number) - 1);

    // Attack copies exactly (base + buffs)
    clone.base_attack = (prevBaseA as number);
    clone.attack = (prevBaseA as number) + buffA;

    // Defense copies with reduced MAX: base_defense -1, keep buffs
    clone.base_defense = newBaseD;
    clone.defense = newBaseD + buffD;

    // Keep potentials aligned so DEF is white (not damaged)
    // @ts-ignore
    clone.potential_attack = (clone.base_attack as number) + buffA;
    // @ts-ignore
    clone.potential_defense = (clone.base_defense as number) + buffD;

    // Peak is this instance's full current DEF
    clone.peak_defense = clone.defense;
    clone.peak_attack = Math.max(clone.peak_attack ?? clone.attack, clone.attack);

    // Turn/attack flags
    clone.justPlayed = true;
    clone.hasAttacked = false;
    // @ts-ignore
    clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn) ? clone.attacks_per_turn : 1;
    // @ts-ignore
    clone.attacks_left = clone.attacks_per_turn;

    // Rush/Storm handling
    if (clone.hasStorm) {
        clone.can_attack = true;
        clone.can_attack_followers = true;
        clone.isRush = false;
    } else if (clone.hasRush) {
        clone.can_attack = true;         // followers only this turn
        clone.can_attack_followers = true;
        clone.isRush = true;
    } else {
        clone.can_attack = false;
        clone.can_attack_followers = false;
        clone.isRush = false;
    }

    // Prevent re-entrant cascade from chain-spawned copies
    // Renamed from _spawnedByCongregant to generic _spawnedByChain
    // @ts-ignore
    clone._spawnedByChain = true;

    // Ensure UI "damaged" flag is false (white DEF)
    // @ts-ignore
    clone.isDamaged = false;

    return clone;
}

/**
 * Fills the board with copies of the entering card, each with -1 MAX DEF than previous.
 * Stops when DEF hits 0 or board is full.
 * 
 * Logic generalized from Congregant of Unkilling to work for any card.
 */
export function handleFillBoardChainDecay(owner: Player, enteringCard: CardInstance) {
    if (!enteringCard || enteringCard.type !== "Follower") return;

    // Don’t start a new cascade from chain-spawned copies
    // @ts-ignore
    if (enteringCard._spawnedByChain || enteringCard._spawnedByCongregant) return;

    const board = boardOf(owner);

    // Chain from the *latest* instance; stop if DEF would drop to 0 or board is full.
    let prev = enteringCard;
    while (board.length < 5) {
        const nextDef = (parseInt(String(prev.defense), 10) || 0) - 1;
        if (nextDef <= 0) break;

        const clone = makeChainDecayClone(prev, owner);

        // Respect max board size
        if (board.length >= 5) break;
        board.push(clone);
        // @ts-ignore
        logEvent("chainSpawn", { owner, name: clone.name, uid: clone.uid, base_defense: clone.base_defense });

        // Rally for followers
        if (owner === "blue") state.blueRally++;
        else state.redRally++;

        // Per-enter hooks & triggers (keep parity with pushToBoard)
        // @ts-ignore
        // medicalAssassinOnFollowerEnter(owner, clone);
        fireTrigger("ally_follower_enter", owner, { enteringCard: clone });
        fireTrigger("enemy_follower_enter", owner, { enteringCard: clone });

        // Next link in the chain is the clone we just placed
        prev = clone;
    }
}
