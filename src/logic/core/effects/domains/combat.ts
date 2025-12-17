
import { registerOp } from "../registry.js";
import { enqueueManyFront } from "../queue.js";
import {
    handleDamage, handleDamageAll, handleDamageRandom,
    handleDamageSplitSequential, handleDamageFollowerOrLeader,
    handleDamageAllByAlliedGolems, handleDamageSplitFixed,
    handleDamageRandomSelectedDefense,
    handleDamageSplitAllEnemies, handleDamageHighestDefense
} from "../../../effects/ops/damage.js";
import {
    handleDestroy, handleDestroyHighest, destroyAlliedAmulets,
    handleDestroyAll, handleDestroyRandom, resolveDestroy
} from "../../../effects/ops/destroy.js";
import {
    handleBanish, handleBanishTargeted, handleBanishDuplicatesFromDeck,
    handleBanishAllEnemyCopies, handleBanishRandom
} from "../../../effects/ops/banish.js";
import {
    handleHealLeader, handleDynamicHealLeader, applyLeaderDamage,
    handleLeaderBarrierOp, handleSetMaxHP
} from "../../../effects/leader.js";
import { handleDestroySelf, handleBanishSelf } from "../../../effects/self.js";
import { cleanupDead } from "../../cleanup.js";
import {
    handleDamageEnemyLeaderByOtherAllies,
    handleDestroyAlliedAmuletsThenDamage,
    handleDestroyRandomOtherAllies,
    handleRestoreFullDefenseSelf,
    handleRestoreSelfAndHealLeader,
    handleRestoreAllies
} from "../../../effects/ops/misc.js";

import { DamageEffect } from "../../../../core/types.js";

export function registerCombatEffects() {
    registerOp("damage", (eff, ctx) => {
        if (handleDamage(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any) === "pending") return "pending";
    });
    registerOp("damage_all", (eff, ctx) => handleDamageAll(eff, ctx.owner, ctx.sourceCard));
    registerOp("damage_random", (eff, ctx) => handleDamageRandom(eff, ctx.owner));
    registerOp("damage_split_sequential", (eff, ctx) => handleDamageSplitSequential(eff, ctx.owner));
    registerOp("damage_follower_or_leader", (eff, ctx) => {
        if (handleDamageFollowerOrLeader(eff, ctx.owner, ctx.sourceCard, ctx.queue) === "pending") return "pending";
    });
    registerOp("damage_all_by_allied_golems", (eff, ctx) => handleDamageAllByAlliedGolems(eff, ctx.owner));
    registerOp("damage_split_fixed", (eff, ctx) => handleDamageSplitFixed(eff, ctx.owner, ctx.sourceCard));
    registerOp("damage_random_selected_defense", (eff, ctx) => handleDamageRandomSelectedDefense(eff, ctx.owner, ctx.sourceCard, ctx.queue, ctx.context as any));
    registerOp("damage_split_all_enemies", (eff, ctx) => handleDamageSplitAllEnemies(eff, ctx.owner, ctx.sourceCard));
    registerOp("damage_highest_defense", (eff, ctx) => handleDamageHighestDefense(eff, ctx.owner, ctx.sourceCard));

    registerOp("damage_enemy_leader_by_other_allies", (eff, ctx) => {
        if (ctx.sourceCard) handleDamageEnemyLeaderByOtherAllies(ctx.owner, ctx.sourceCard);
    });

    registerOp("damage_self", (eff, ctx) => {
        if (ctx.sourceCard && ctx.sourceCard.type === "Follower") {
            import('../../barrier.js').then(({ dealDamage }) => {
                dealDamage(ctx.sourceCard!, (eff.amount || 0) as number);
                cleanupDead();
            });
        }
    });

    // Destroy
    registerOp("destroy", (eff, ctx) => {
        if (handleDestroy(eff, ctx.owner, ctx.queue, ctx.context as any, ctx.sourceCard) === "pending") return "pending";
    });
    registerOp("destroy_all", (eff, ctx) => handleDestroyAll(eff, ctx.owner, ctx.sourceCard, ctx.context as any));
    registerOp("destroy_highest", (eff, ctx) => handleDestroyHighest(eff, ctx.owner));
    registerOp("destroy_random", (eff, ctx) => handleDestroyRandom(eff, ctx.owner, ctx.context as any));
    registerOp("destroy_random_other_allies", (eff, ctx) => handleDestroyRandomOtherAllies(ctx.owner, ctx.sourceCard!, ctx.context as any));
    registerOp("destroy_allied_amulets", (eff, ctx) => { destroyAlliedAmulets(ctx.owner); });
    registerOp("destroy_allied_amulets_then_damage", (eff, ctx) => handleDestroyAlliedAmuletsThenDamage(ctx.owner));
    registerOp("destroy_self", (eff, ctx) => {
        if (ctx.sourceCard) { handleDestroySelf(ctx.sourceCard); cleanupDead(); }
    });

    registerOp("destroy_then", (eff, ctx) => {
        const destroyed = handleDestroy(eff, ctx.owner, [], ctx.context as any, ctx.sourceCard);
        if (destroyed === "pending") return "pending";
        if (typeof destroyed === "number" && destroyed > 0) {
            if (Array.isArray(eff.effects)) enqueueManyFront(ctx, eff.effects!);
        }
    });

    registerOp("destroy_defender_if_damaged", (eff, ctx) => {
        const t = (ctx.context as any)?.defender;
        if (!t) return;
        const current = parseInt(t.defense) || 0;
        // @ts-ignore
        const base = Number.isFinite(t.peak_defense) ? t.peak_defense : (Number.isFinite(t.base_defense) ? t.base_defense : current);

        if (current < base) {
            resolveDestroy(t, ctx.owner);
            cleanupDead();
        }
    });

    registerOp("follower_strike_destroy", (eff, ctx) => {
        if (ctx.sourceCard && (ctx.context as any)?.defender) {
            resolveDestroy((ctx.context as any).defender, ctx.owner);
            cleanupDead();
        }
    });

    // Banish
    registerOp("banish", (eff, ctx) => {
        if (handleBanishTargeted(eff, ctx.owner, ctx.queue) === "pending") return "pending";
    });
    registerOp("banish_all_enemy_copies", (eff, ctx) => {
        const target = (ctx.context as any)?.selectedCard || ((ctx.context as any)?.targets?.[0] || null);
        if (target) handleBanishAllEnemyCopies(ctx.owner, target);
    });
    registerOp("banish_duplicates_from_deck", (eff, ctx) => {
        handleBanishDuplicatesFromDeck(ctx.owner);
    });
    registerOp("banish_random", (eff, ctx) => handleBanishRandom(eff, ctx.owner));
    registerOp("banish_self", (eff, ctx) => {
        if (ctx.sourceCard) handleBanishSelf(ctx.sourceCard, ctx.owner);
    });

    // Leaders / Heal
    registerOp("heal_leader", (eff, ctx) => {
        handleHealLeader(ctx.owner, eff);
        // logs handled in implementation sometimes?
        import("../../../../core/logger.js").then(({ logEvent }) => {
            logEvent("healLeader", { owner: ctx.owner, amount: eff.amount });
        });

        // Crest processing
        import("../../../effects/crest.js").then(({ processCrestEvent }) => {
            const targetOwner = (eff.player || "self") === "self" ? ctx.owner : (ctx.owner === "blue" ? "red" : "blue");
            const fx = processCrestEvent(targetOwner, "heal_leader");
            if (fx.length) enqueueManyFront(ctx, fx);
        });
    });

    registerOp("dynamic_heal_leader", (eff, ctx) => {
        handleDynamicHealLeader(ctx.owner, eff);
        import("../../../../core/logger.js").then(({ logEvent }) => logEvent("healLeader", { owner: ctx.owner, amount: eff.amount }));
    });

    registerOp("set_max_hp", (eff, ctx) => handleSetMaxHP(eff, ctx.owner));
    registerOp("leader_barrier", (eff, ctx) => handleLeaderBarrierOp(ctx.owner, eff));

    registerOp("restore_full_defense_self", (eff, ctx) => handleRestoreFullDefenseSelf(ctx.sourceCard!, ctx.context as any));
    registerOp("restore_self_and_heal_leader", (eff, ctx) => handleRestoreSelfAndHealLeader(ctx.owner, ctx.sourceCard!));
    registerOp("restore_allies", (eff, ctx) => handleRestoreAllies(ctx.owner, eff));

}

import { COMBAT_OPS } from "./combatOps.js";
export const OPS = COMBAT_OPS;
