
import { state } from "../../../../core/gameState.js";

import { applyKeyword } from "../../../core/keywords.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { BuffOp } from "./types.js";
import { fireTrigger } from "../../../core/triggers.js";

/**
 * Applies stat changes to a card.
 * Handles `buffs`, `attack`, `defense`, `peak_defense`, `potential_*`.
 */
export function applyStatBuff(target: CardInstance, a: number, d: number, _owner: Player) {
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
    target.buffs.attack = (target.buffs.attack ?? 0) + a;
    target.buffs.defense = (target.buffs.defense ?? 0) + d;

    (target as any).attack = (parseInt(String(target.attack)) || 0) + a;
    (target as any).defense = (parseInt(String(target.defense)) || 0) + d;
    target.peak_defense = Math.max(target.peak_defense ?? Number(target.defense), Number(target.defense));

    if (!target.potential_attack) target.potential_attack = (target.base_attack || Number(target.attack) || 0) as number;
    if (!target.potential_defense) target.potential_defense = (target.base_defense || Number(target.defense) || 0) as number;
    target.potential_attack! += a;
    target.potential_defense! += d;
}

/**
 * Applies keywords from the effect.
 */
export function applyKeywordBuff(target: CardInstance, eff: BuffOp) {
    const grantListRaw = eff.keywords || (eff as any).keyword || null;
    if (grantListRaw) {
        const grantList = Array.isArray(grantListRaw) ? grantListRaw : [grantListRaw];
        for (const kw of grantList) {
            const name = (typeof kw === "string" ? kw : kw?.name) || "";
            const options = (typeof kw === "object" ? kw : undefined);
            if (name) applyKeyword(target, name, options);
        }
    }
}

/**
 * Applies "attacks_per_turn" setting.
 */
export function applyAttacksPerTurnBuff(target: CardInstance, eff: BuffOp, owner: Player) {
    if ((eff as any).attacks_per_turn !== undefined) {
        const n = parseInt((eff as any).attacks_per_turn) || 1;
        target.attacks_per_turn = n;
        // Give them the attacks immediately if they can attack
        if (target.hasStorm || target.hasRush || !target.justPlayed) {
            target.attacks_left = n;
            target.can_attack = true;
        }
        logEvent("attacksPerTurn", { owner, target: target.name, uid: target.uid, value: n });
    }
}

/**
 * Checks and fires post-buff triggers.
 */
export function checkPostBuffTriggers(target: CardInstance, a: number, d: number, owner: Player) {
    // NEW: notify when a positive buff is applied to a follower on the field
    // LEGACY: explicit trigger firing preserved for determinism/replay compatibility — do not simplify to reactive system
    if ((a > 0 || d > 0) && (state.blueBoard.includes(target) || state.redBoard.includes(target))) {
        fireTrigger("self_buffed_up", owner, { target });
    }

    // Fire "enemy_follower_defense_down" if we actually reduced DEF on an enemy follower
    if (d < 0 && target?.type === "Follower") {
        const targetOwner = state.blueBoard.includes(target) ? "blue" :
            state.redBoard.includes(target) ? "red" : null;
        const debufferOwner = owner; // the player executing this buff/debuff op
        if (targetOwner && debufferOwner) {
            fireTrigger("enemy_follower_defense_down", debufferOwner, { target });
        }
    }
}
