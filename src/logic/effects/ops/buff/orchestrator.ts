
import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { BuffOp, BuffContext } from "./types.js";
import { filterBuffCandidates } from "./utils.js";
import { withBuffDuration } from "./duration.js";
import { applyStatBuff, applyKeywordBuff, applyAttacksPerTurnBuff, checkPostBuffTriggers } from "./core.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";


export function handleBuffOrchestrator(
    eff: BuffOp,
    owner: Player,
    sourceCard: CardInstance | null,
    effectsQueue: any,
    context: any = {}
) {
    // 1. Get raw pool
    // pass context so targets like "entering_follower" work
    const rawPool = getPool(eff.target as any, owner, null, eff.condition, context);

    // 2. Filter candidates
    const pool = filterBuffCandidates(rawPool, eff, sourceCard);

    console.log('BUFF pool uids:', pool.map(c => c.uid), 'source:', sourceCard?.uid, 'include_self:', !!eff.include_self);

    if (!pool.length) return "done";

    // 3. Selection
    if ((eff as any).select) {
        setPendingTarget({
            eff,
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: parseInt((eff as any).select_count ?? 1),
            context
        } as any);
        highlightSelectable(pool);
        return "pending";
    }

    // 4. Random Selection
    let chosen = pool;
    if (eff.random) {
        const k = Math.max(0, parseInt((eff.count as any) ?? 1, 10));
        if (k <= 0) return "done";

        chosen = [];
        const bag = [...pool];
        for (let i = 0; i < k && bag.length; i++) {
            const idx = state.rng.nextInt(bag.length);
            const picked = bag.splice(idx, 1)[0];
            if (picked) chosen.push(picked);
        }
        console.log("[Buff] Random chose:", chosen.map(c => c.uid));
    }

    // 5. Apply Buffs
    const mode = eff.random ? "random" : "all";

    for (const target of chosen) {
        // Use the duration wrapper for stats
        withBuffDuration(target, eff, ({ attack: a, defense: d }) => {
            applyStatBuff(target, a, d, owner);
            logEvent("buff", { owner, target: target.name, uid: target.uid, a, d, mode });

            // Post-buff triggers relate mainly to stats
            checkPostBuffTriggers(target, a, d, owner);
        });

        // Apply keywords
        applyKeywordBuff(target, eff);

        // Apply attacks per turn
        applyAttacksPerTurnBuff(target, eff, owner);
    }

    // 6. Cleanup
    cleanupDead();
    return "done";
}
