// src/logic/core/cleanup.ts
import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { handleBanish } from "@logic/effects/ops/banish.js";
import { runEffects } from "@logic/core/effects.js";
import { logEvent } from "@core/logger.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { CardInstance, Player } from "@core/types.js";

// @ts-ignore
import { hasBanishOnDeath } from "@logic/core/utils.js"; // If needed, or just guard properties

export function cleanupDead() {
    // Skip cleanup while a “batch” (like crest EOT) is running.
    if (state.suppressCleanup) return;

    const triggerLastWords = (card: CardInstance, owner: Player) => {
        if ((card as any)._lwFired) return;              // guard against re-entry
        if (!card?.hasLastWords) return;
        if (!Array.isArray((card as any).lastWordsEffects)) return;
        (card as any)._lwFired = true;                    // mark fired
        runEffects([...(card as any).lastWordsEffects], owner, card);
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
            const defLE0 = isFollower && ((parseInt((c.defense as any)) || 0) <= 0);
            const countdown0 = isAmulet && c.hasCountdown && ((parseInt((c.countdown as any)) || 0) <= 0);
            const shouldDestroy = defLE0 || countdown0;

            if (!shouldDestroy) continue;

            // Log only when we actually destroy something
            const cause = defLE0 ? "defense<=0" : (countdown0 ? "countdown==0" : "unknown");
            logEvent("destroyQueued", { card: c.name, owner, type: c.type, cause });

            if (isFollower) {
                // leave-field trigger
                fireTrigger("follower_leaves_field", owner as any);

                // Shikigami bookkeeping (unchanged)
                if (Array.isArray(c.tribes) && c.tribes.includes("Shikigami")) {
                    const aBase = parseInt((c.base_attack ?? c.attack) as any) || 0;
                    const dBase = parseInt((c.base_defense ?? c.defense) as any) || 0;
                    if (owner === "blue") {
                        if (!state.shikigamiDeathsThisTurnBlue) state.shikigamiDeathsThisTurnBlue = [];
                        state.shikigamiDeathsThisTurnBlue.push({ attack: aBase, defense: dBase });
                    } else {
                        if (!state.shikigamiDeathsThisTurnRed) state.shikigamiDeathsThisTurnRed = [];
                        state.shikigamiDeathsThisTurnRed.push({ attack: aBase, defense: dBase });
                    }
                }

                // Emit only for destroyed (not banish/bounce) Wards
                if (defLE0 && c.hasWard && !(c as any).hasBanishOnDeath) {
                    fireTrigger("ally_ward_destroyed", owner as any, { destroyedCard: c });
                }
            }

            // Strip volatile fields
            delete (c as any).buffs;
            delete (c as any).potential_attack;
            delete (c as any).potential_defense;
            delete (c as any)._death_snapshot;

            if ((c as any).hasBanishOnDeath) {
                logEvent("banishOnDeath", { card: c.name, owner });
                // handleBanish will remove the card from the correct board.
                // Only splice here if, for some reason, it didn't.
                const before = board[i];
                handleBanish(c, owner); // Assumes handleBanish signature
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
                    // @ts-ignore
                    base_image: c?.base_image || null,
                    ts: Date.now()
                };
                if (owner === "blue") state.blueDestroyedHistory.push(histEntry as any);
                else state.redDestroyedHistory.push(histEntry as any);
                // Remove from board before LWs
                board.splice(i, 1);

                const lwCount = Array.isArray((c as any).lastWordsEffects) ? (c as any).lastWordsEffects.length : 0;
                if (lwCount > 0) logEvent("lastWords", { card: c.name, owner, count: lwCount });

                // Run LWs and then move to grave
                triggerLastWords(c, owner);
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
