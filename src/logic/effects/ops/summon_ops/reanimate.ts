import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { Player } from "../../../../core/types.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { adapter } from "../../../../core/adapter.js";
import { makeCardFromDB, pushToBoard } from "./core.js";
import { boardOf } from "./utils.js";

export function reanimateSummon(c: any, owner: Player) {
    if (!c || c.type !== "Follower") return;

    const board = boardOf(owner);
    if (board.length >= 5) return;

    const base = getCardDetails(c.name);
    if (!base) return;

    const copy = makeCardFromDB(base, owner);

    // Reanimates enter 'justPlayed', but Rush/Storm should still work this turn:
    // - Storm: can attack leaders & followers
    // - Rush:  can attack followers only
    copy.hasAttacked = false;
    copy.attacks_left = copy.attacks_per_turn ?? 1;
    if (copy.hasStorm) {
        copy.can_attack = true;
        copy.can_attack_followers = true;
        copy.isRush = false;
    } else if (copy.hasRush) {
        // Allow follower attacks this turn; leader swings are blocked in attackLeader().
        copy.can_attack = true;
        copy.can_attack_followers = true;
        copy.isRush = true;
    }

    // ✅ Ensure reanimated units gain the Departed tribe
    copy.tribes = Array.isArray(copy.tribes) ? copy.tribes : [];
    if (!copy.tribes.includes("Departed")) copy.tribes.push("Departed");
    // (Optional) mark provenance if you ever need it:
    // copy.wasReanimated = true;

    if (pushToBoard(board, owner, copy)) {
        logEvent("reanimateSummon", { owner, card: copy.name, uid: copy.uid });
        if (state.lastSummoned) { state.lastSummoned.length = 0; state.lastSummoned.push(copy); }
    }
    adapter.render();
}
