// src/logic/core/cleanup.ts
import { state } from "../../core/gameState.js";
// import { render } from "../../ui/render.js";
import { handleBanish } from "../effects/ops/banish.js";
// import { runEffects } from "./effects/index.js"; // Breaking cycle
import { logEvent } from "../../core/logger.js";
import { fireTrigger } from "./triggers.js";
import { CardInstance, Player, Effect } from "../../core/types.js";

// Dependency Injection for runEffects
let runEffects: (effects: Effect[], owner: Player, source: any, context?: any) => void;
export function registerRunEffectsInCleanup(fn: any) {
    runEffects = fn;
}



export function cleanupDead() {
    // Skip cleanup while a “batch” (like crest EOT) is running.
    if (state.suppressCleanup) return;

    const triggerLastWords = (card: CardInstance, owner: Player) => {
        if ((card as any)._lwFired) return;              // guard against re-entry
        if (!card?.hasLastWords) return;
        const lw = card.keywordState?.lastWordsEffects || card.lastWordsEffects;
        if (!Array.isArray(lw)) return;
        if (!runEffects) {
            console.warn("cleanupDead: runEffects not registered!");
            return;
        }
        (card as any)._lwFired = true;                    // mark fired
        runEffects([...lw], owner, card);
    };

    const cleanSide = (board: CardInstance[], grave: CardInstance[], owner: Player) => {
        for (let i = board.length - 1; i >= 0; i--) {
            const c = board[i];

            // Guard against sparse / null slots created by other ops
            if (!c || typeof c !== "object") {
                // remove accidental holes to keep board dense
                board.splice(i, 1);
                continue;
            }

            const isFollower = c.type === "Follower";
            const isAmulet = c.type === "Amulet";
            const defLE0 = isFollower && ((parseInt(String(c.defense))) || 0) <= 0;
            const countdown0 = isAmulet && c.hasCountdown && ((parseInt(String(c.countdown))) || 0) <= 0;
            const markedForDeath = !!(c as any).pendingDestruction;
            if (markedForDeath) console.log(`[cleanupDead] Found marked card: ${c.name} (${c.uid})`);
            const shouldDestroy = defLE0 || countdown0 || markedForDeath;

            if (!shouldDestroy) continue;

            // Log only when we actually destroy something
            const cause = defLE0 ? "defense<=0" : (countdown0 ? "countdown==0" : "unknown");
            logEvent("destroyQueued", { card: c.name, owner, type: c.type, cause });

            if (isFollower) {
                // leave-field trigger - pass leavingOwner for is_ally condition
                fireTrigger("follower_leaves_field", owner as any, { leavingOwner: owner, leavingCard: c });

                // Shikigami bookkeeping (unchanged)
                if (Array.isArray(c.tribes) && c.tribes.includes("Shikigami")) {
                    const aBase = parseInt(String(c.base_attack ?? c.attack)) || 0;
                    const dBase = parseInt(String(c.base_defense ?? c.defense)) || 0;
                    if (owner === "blue") {
                        if (!state.shikigamiDeathsThisTurnBlue) state.shikigamiDeathsThisTurnBlue = [];
                        state.shikigamiDeathsThisTurnBlue.push({ attack: aBase, defense: dBase });
                    } else {
                        if (!state.shikigamiDeathsThisTurnRed) state.shikigamiDeathsThisTurnRed = [];
                        state.shikigamiDeathsThisTurnRed.push({ attack: aBase, defense: dBase });
                    }
                }

                // Emit only for destroyed (not banish/bounce) Wards
                // Use keywordState for banishOnDeath check
                const isBanishedOnDeath = c.keywordState?.banishOnDeath || (c as any).banishOnDeath;
                if (defLE0 && c.hasWard && !isBanishedOnDeath) {
                    fireTrigger("ally_ward_destroyed", owner as any, { destroyedCard: c });
                }
            }

            // Strip volatile fields
            delete (c as any).buffs;
            delete (c as any).potential_attack;
            delete (c as any).potential_defense;
            delete (c as any)._death_snapshot;

            const isBanishedOnDeath = c.keywordState?.banishOnDeath || (c as any).banishOnDeath;
            if (isBanishedOnDeath) {
                logEvent("banishOnDeath", { card: c.name, owner });
                // handleBanish will remove the card from the correct board.
                // Only splice here if, for some reason, it didn't.
                const before = board[i];
                handleBanish(c); // Assumes handleBanish signature
                // Prevent double-splice: only remove if the same object still sits at i.
                if (board[i] === before) board.splice(i, 1);
            } else {
                logEvent("death", { card: c.name, owner });
                // History: mark as destroyed (only true deaths, not banish/bounce)
                const histEntry = {
                    uid: c.uid,
                    name: c.name,
                    type: c.type,
                    cost: Number(c?.cost) || 0,
                    base_image: c?.base_image || null,
                    ts: Date.now()
                };
                if (owner === "blue") state.blueDestroyedHistory.push(histEntry as any);
                else state.redDestroyedHistory.push(histEntry as any);
                // Remove from board before LWs
                board.splice(i, 1);

                const lw = c.keywordState?.lastWordsEffects || c.lastWordsEffects;
                const lwCount = Array.isArray(lw) ? lw.length : 0;
                if (lwCount > 0) logEvent("lastWords", { card: c.name, owner, count: lwCount });

                // Run LWs and then move to grave
                triggerLastWords(c, owner);
                c.zone = "graveyard";
                grave.push(c);

                // shadows
                if (owner === "blue") state.blueShadows++;
                else state.redShadows++;
            }
        }
    };


    cleanSide(state.blueBoard, state.blueGraveyard, "blue");
    cleanSide(state.redBoard, state.redGraveyard, "red");
}
