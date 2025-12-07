import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { dealDamage, popBarrier } from "@logic/core/barrier.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { handleBanish } from "@logic/effects/ops/banish.js";
import { runEffects } from "@logic/core/effects.js";
import { logEvent } from "@core/logger.js";




export function cleanupDead() {
  // Skip cleanup while a “batch” (like crest EOT) is running.
  if (state.suppressCleanup) return;
  const triggerLastWords = (card, owner) => {
    if (card?._lwFired) return;              // guard against re-entry
    if (!card?.hasLastWords) return;
    if (!Array.isArray(card.lastWordsEffects)) return;
    card._lwFired = true;                    // mark fired
    runEffects([...card.lastWordsEffects], owner, card);
  };

  const cleanSide = (board, grave, owner) => {
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
      const defLE0 = isFollower && ((parseInt(c.defense) || 0) <= 0);
      const countdown0 = isAmulet && c.hasCountdown && ((parseInt(c.countdown) || 0) <= 0);
      const shouldDestroy = defLE0 || countdown0;

      if (!shouldDestroy) continue;

      // Log only when we actually destroy something
      const cause = defLE0 ? "defense<=0" : (countdown0 ? "countdown==0" : "unknown");
      logEvent("destroyQueued", { card: c.name, owner, type: c.type, cause });

      if (isFollower) {
        // leave-field trigger
        fireTrigger("follower_leaves_field", owner);

        // Shikigami bookkeeping (unchanged)
        if (Array.isArray(c.tribes) && c.tribes.includes("Shikigami")) {
          const aBase = parseInt(c.base_attack ?? c.attack) || 0;
          const dBase = parseInt(c.base_defense ?? c.defense) || 0;
          if (owner === "blue") {
            if (!state.shikigamiDeathsThisTurnBlue) state.shikigamiDeathsThisTurnBlue = [];
            state.shikigamiDeathsThisTurnBlue.push({ attack: aBase, defense: dBase });
          } else {
            if (!state.shikigamiDeathsThisTurnRed) state.shikigamiDeathsThisTurnRed = [];
            state.shikigamiDeathsThisTurnRed.push({ attack: aBase, defense: dBase });
          }
        }

        // Emit only for destroyed (not banish/bounce) Wards
        if (defLE0 && c.hasWard && !c.hasBanishOnDeath) {
          fireTrigger("ally_ward_destroyed", owner, { destroyedCard: c });
        }
      }

      // Strip volatile fields
      delete c.buffs;
      delete c.potential_attack;
      delete c.potential_defense;
      delete c._death_snapshot;

      if (c.hasBanishOnDeath) {
        logEvent("banishOnDeath", { card: c.name, owner });
        // handleBanish will remove the card from the correct board.
        // Only splice here if, for some reason, it didn't.
        const before = board[i];
        handleBanish(c);
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
        if (owner === "blue") state.blueDestroyedHistory.push(histEntry);
        else state.redDestroyedHistory.push(histEntry);
        // Remove from board before LWs
        board.splice(i, 1);

        const lwCount = Array.isArray(c.lastWordsEffects) ? c.lastWordsEffects.length : 0;
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
