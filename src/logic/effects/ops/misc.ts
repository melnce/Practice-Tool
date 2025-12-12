// src/logic/effects/ops/misc.ts

import { state } from "../../../core/gameState.js";
// @ts-ignore
import { render } from "../../../ui/render.js";
import { handleDamageAll, handleDamageRandom } from "./damage.js";
import { destroyAlliedAmulets } from "./destroy.js";
import { applyLeaderDamage, handleHealLeader } from "../leader.js";
import { Player, CardInstance, Effect } from "../../../core/types.js";
import { addMaxPP } from "../../pp.js";

// destroy_allied_amulets_then_damage
export function handleDestroyAlliedAmuletsThenDamage(owner: Player) {
    const x = destroyAlliedAmulets(owner) | 0;
    if (x > 0) {
        handleDamageAll({ op: "damage_all", target: "enemy:follower", amount: x } as any, owner);
        handleDamageAll({ op: "damage_all", target: "enemy:leader", amount: x } as any, owner);
    }
}

// damage_enemy_leader_by_other_allies
export function handleDamageEnemyLeaderByOtherAllies(owner: Player, sourceCard: CardInstance) {
    const myBoard = owner === "blue" ? state.blueBoard : state.redBoard;
    const x = (myBoard || []).filter(c => c && (!sourceCard || c.uid !== sourceCard.uid)).length | 0;
    const enemy = owner === "blue" ? "red" : "blue";
    if (x > 0) applyLeaderDamage(enemy, x);
}

// destroy_random_other_allies
export function handleDestroyRandomOtherAllies(owner: Player, sourceCard: CardInstance, context: any) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const x = (board || []).filter(c => c && (!sourceCard || c.uid !== sourceCard.uid)).length | 0;
    for (let i = 0; i < x; i++) {
        handleDamageRandom(
            { op: "destroy_random", target: "enemy:follower", count: 1 } as any,
            owner
            // Note: original code called handleDestroyRandom but op was "destroy_random".
        );
    }
}

// restore_full_defense_self
export function handleRestoreFullDefenseSelf(sourceCard: CardInstance, context: any) {
    if (sourceCard && sourceCard.type === "Follower") {
        // @ts-ignore
        const curr = parseInt(sourceCard.defense, 10) || 0;
        const full =
            // @ts-ignore
            Number.isFinite(sourceCard.potential_defense) ? sourceCard.potential_defense :
                // @ts-ignore
                Number.isFinite(sourceCard.peak_defense) ? sourceCard.peak_defense :
                    // @ts-ignore
                    Number.isFinite(sourceCard.base_defense) ? sourceCard.base_defense :
                        curr;

        const restored = Math.max(0, (full as number) - curr);
        // @ts-ignore
        sourceCard.defense = full;

        // make available to chained effects in this sequence
        // @ts-ignore
        sourceCard.__lastRestored = restored;
        if (context) context.__restored_amount = restored;
    }
}

// restore_self_and_heal_leader
export function handleRestoreSelfAndHealLeader(owner: Player, sourceCard: CardInstance) {
    if (sourceCard?.type !== "Follower") return;

    // @ts-ignore
    const curr = parseInt(sourceCard.defense, 10) || 0;
    const full =
        // @ts-ignore
        Number.isFinite(sourceCard.potential_defense) ? sourceCard.potential_defense :
            // @ts-ignore
            Number.isFinite(sourceCard.peak_defense) ? sourceCard.peak_defense :
                // @ts-ignore
                Number.isFinite(sourceCard.base_defense) ? sourceCard.base_defense :
                    curr;

    const restored = Math.max(0, (full as number) - curr);
    if (restored > 0) {
        // @ts-ignore
        sourceCard.defense = full;
        handleHealLeader(owner, { amount: restored } as any);
    }
    render();
}

// --- Logic Moved from effects.ts ---

export function handleChooseBonusAdd(owner: Player, eff: Effect) {
    const amt = (eff.amount || 1) as number;
    if (owner === "blue") state.blueChooseBonus = (state.blueChooseBonus || 0) + amt;
    else state.redChooseBonus = (state.redChooseBonus || 0) + amt;
}

export function handleGainMaxPP(owner: Player, eff: Effect) {
    const amt = (eff.amount || 1) as number;
    addMaxPP(owner, amt, { cap: 10, recalcNow: true });
}

export function handleSetCostLastDrawn(eff: Effect) {
    // @ts-ignore
    const v = parseInt(eff.amount);
    if (!Number.isFinite(v)) return;
    const arr = state.lastDrawnCards || [];
    const target = arr[0]; // most recently drawn
    if (target) {
        if (target.base_cost === undefined) {
            // @ts-ignore
            target.base_cost = parseInt(String(target.cost)) || 0;
        }
        target.cost = Math.max(0, v);
    }
}
