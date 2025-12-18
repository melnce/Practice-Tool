// src/logic/effects/ops/bounce.ts
import { state } from "../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { pushToHand } from "../../../core/utils.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { fireTrigger } from "../../core/triggers.js";

import { logEvent } from "../../../core/logger.js";
import { CardInstance, Effect, Player } from "../../../core/types.js";


// Create a fresh base copy (new uid)
function freshBaseCopyByName(name: string) {
    const base = getCardDetails(name);
    if (!base) return null;
    const copy = JSON.parse(JSON.stringify(base));
    copy.uid = state.rng.makeUid();
    return copy;
}

// Remove from board and push a *reset* copy to the correct hand.
export function bounceToHand(card: CardInstance) {
    let fromArr = null;
    let toHand = null;
    let owner: Player | null = null; // FIX: Declare the 'owner' variable.

    const bi = state.blueBoard.indexOf(card);
    const ri = state.redBoard.indexOf(card);

    // FIX: Determine the owner based on which board the card was on.
    if (bi !== -1) {
        fromArr = state.blueBoard;
        toHand = state.blueHand;
        owner = "blue";
    } else if (ri !== -1) {
        fromArr = state.redBoard;
        toHand = state.redHand;
        owner = "red";
    } else {
        console.warn(`[BounceToHand] Card ${card.name}#${card.uid} not found on any board! bi=${bi} ri=${ri}`);
        return; // Card not on a board; ignore.
    }

    // FIX: Call the trigger now that 'owner' is correctly defined.
    fireTrigger("follower_leaves_field", owner);

    const [removed] = fromArr.splice(fromArr.indexOf(card), 1);
    if (!removed) return;

    const fresh = freshBaseCopyByName(removed.name);
    if (!fresh) return; // no DB entry → nothing to add

    const pushed = pushToHand(toHand, fresh);
    if (!pushed) {
        // Hand full -> Burn to graveyard
        // Shadowverse: Bounced cards that trigger burn go to graveyard (shadows +1)
        // We push the 'fresh' copy or 'removed'? Rules say "discarded".
        // Usually treated as "destroyed" from hand perspective, so 'fresh' is appropriate/safe.
        let grave: CardInstance[] | null = null;
        if (owner === "blue") grave = state.blueGraveyard;
        else if (owner === "red") grave = state.redGraveyard;

        if (grave) {
            grave.push(fresh);
            logEvent("burn_to_grave", { owner, card: fresh.name, uid: fresh.uid });
        }
    } else {
        logEvent("bounceToHand", { from: owner, name: removed.name, oldUid: removed.uid, newUid: fresh.uid });
    }
}

// Handle "return_to_hand" effect
export function handleReturnToHand(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: any) {
    // allow followers + amulets by default; narrow if filters.type is given
    console.log(`[BounceOp] HandleReturnToHand Target=${eff.target} Owner=${owner} Source=${sourceCard?.name}#${sourceCard?.uid}`);

    let pool = getPool(eff.target as any, owner, sourceCard).filter(c => c.type === "Follower" || c.type === "Amulet");
    console.log(`[BounceOp] Pool size after init: ${pool.length}`);

    if ((eff as any).filters?.type) {
        const want = String((eff as any).filters.type).toLowerCase();
        pool = pool.filter(c => (c.type || "").toLowerCase() === want);
    }

    // If there's a source card, filter it out of the pool so it can't target itself,
    // UNLESS current op target is explicitly "self".
    if (sourceCard && eff.target !== "self") {
        pool = pool.filter(c => c.uid !== sourceCard.uid);
    }

    if (!pool.length) return;

    if ((eff as any).select) {
        state.pendingTargetEffect = {
            eff,
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: parseInt((eff as any).select_count || 1),
        };
        logEvent("returnToHand_select", { owner, pool: pool.length, select: parseInt((eff as any).select_count || 1) });
        highlightSelectable(pool);
        return "pending";
    }

    // non-select → bounce all matching
    for (const t of pool) bounceToHand(t);
}
