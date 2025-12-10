// src/logic/effects/ops/misc.ts
import { state } from "@core/gameState.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { handleDamageAll, handleDamageRandom } from "@logic/effects/ops/damage.js";
import { destroyAlliedAmulets } from "@logic/effects/ops/destroy.js";
import { applyLeaderDamage, handleHealLeader } from "@logic/effects/leader.js";
// destroy_allied_amulets_then_damage
export function handleDestroyAlliedAmuletsThenDamage(owner) {
    const x = destroyAlliedAmulets(owner) | 0;
    if (x > 0) {
        handleDamageAll({ op: "damage_all", target: "enemy:follower", amount: x }, owner);
        handleDamageAll({ op: "damage_all", target: "enemy:leader", amount: x }, owner);
    }
}
// damage_enemy_leader_by_other_allies
export function handleDamageEnemyLeaderByOtherAllies(owner, sourceCard) {
    const myBoard = owner === "blue" ? state.blueBoard : state.redBoard;
    const x = (myBoard || []).filter(c => c && (!sourceCard || c.uid !== sourceCard.uid)).length | 0;
    const enemy = owner === "blue" ? "red" : "blue";
    if (x > 0)
        applyLeaderDamage(enemy, x);
}
// destroy_random_other_allies
export function handleDestroyRandomOtherAllies(owner, sourceCard, context) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const x = (board || []).filter(c => c && (!sourceCard || c.uid !== sourceCard.uid)).length | 0;
    for (let i = 0; i < x; i++) {
        handleDamageRandom({ op: "destroy_random", target: "enemy:follower", count: 1 }, owner
        // Note: original code called handleDestroyRandom but op was "destroy_random".
        // effects.js line 231 passed { op: "destroy_random" ... } as eff.
        );
    }
}
// restore_full_defense_self
export function handleRestoreFullDefenseSelf(sourceCard, context) {
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
        const restored = Math.max(0, full - curr);
        // @ts-ignore
        sourceCard.defense = full;
        // make available to chained effects in this sequence
        // @ts-ignore
        sourceCard.__lastRestored = restored;
        if (context)
            context.__restored_amount = restored;
    }
}
// restore_self_and_heal_leader
export function handleRestoreSelfAndHealLeader(owner, sourceCard) {
    if (sourceCard?.type !== "Follower")
        return;
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
    const restored = Math.max(0, full - curr);
    if (restored > 0) {
        // @ts-ignore
        sourceCard.defense = full;
        handleHealLeader(owner, { amount: restored });
    }
    render();
}
