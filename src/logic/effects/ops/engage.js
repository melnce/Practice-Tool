import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { runEffects } from "@logic/core/effects.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { logEvent } from "@core/logger.js";
import { doAction } from "@core/history.js";


// --- Helpers ---
function boardOf(owner) {
  return owner === "blue" ? state.blueBoard : state.redBoard;
}
function graveOf(owner) {
  return owner === "blue" ? state.blueGraveyard : state.redGraveyard;
}
function payEngageCost(owner, cost) {
  // Assume PP system; no-op if you already checked affordability elsewhere.
  const pool = owner === "blue" ? "bluePP" : "redPP";
  const cur = state[pool] | 0;
  state[pool] = Math.max(0, cur - (cost | 0));
}
function effectsNeedSelection(effects = []) {
  return Array.isArray(effects) && effects.some(e => e && (e.select === true || e.op === "select"));
}

function removeWithLastWords(card, owner) {
  const board = owner === "blue" ? state.blueBoard : state.redBoard;
  const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;
  const idx = board.findIndex(c => c?.uid === card.uid);
  if (idx === -1) {
    console.warn(`[Engage] Could not find amulet on board: ${card?.name} (${owner})`);
    return;
  }
  const removed = board.splice(idx, 1)[0];

  if (removed?.hasLastWords && Array.isArray(removed.lastWordsEffects)) {
    console.log(`[Engage] Running Last Words for ${removed.name}`);
    runEffects([...removed.lastWordsEffects], owner, removed);
  } else {
    console.log(`[Engage] No Last Words or invalid effects for ${removed?.name}`);
  }

  grave.push(removed);
  if (owner === "blue") state.blueShadows++; else state.redShadows++;
}

// --- Main API ---
/**
 * Engage an amulet on the given side/slot.
 * - Handles engage cost
 * - Fires engage trigger for listeners
 * - Runs engage effects (with or without selection)
 * - Resolves immediate expiry (Countdown <= 0) deterministically by UID
 * - Optional sacrifice support (immediate if no selection; deferred if selection is pending)
 */
export function engageAmulet(owner, index) {
  return doAction(
    "Engage Amulet",
    () => {
      const board = boardOf(owner);
      if (index < 0 || index >= board.length) return;

      const card = board[index];
      if (!card || card.type !== "Amulet" || !card.hasEngage) return;

      // Guard: once-per-turn
      if (card.engageOncePerTurn !== false && card.engagedThisTurn) {
        console.warn(`[Engage] ${card.name} already engaged this turn`);
        return;
      }

      const cost = Number(card.engageCost ?? 0) || 0;

      // Affordability check (optional; keep if your UI doesn't pre-check)
      const pp = owner === "blue" ? state.bluePP : state.redPP;
      if (pp < cost) return;

      logEvent("engageStart", { owner, name: card.name, uid: card.uid, cost });
      // Pay + mark
      payEngageCost(owner, cost);
      logEvent("ppSpend", { owner, amount: cost, reason: "engage" });

      // Fire the global engage trigger BEFORE effects so listeners (e.g., Mainyu) see it.
      // Provide minimal context for listeners if needed later.
      fireTrigger("engage", owner, { sourceCard: card });

      const effects = Array.isArray(card.engageEffects) ? card.engageEffects.slice() : [];
      const needsSelection = effectsNeedSelection(effects);
      const sacrifice = !!card.engageSacrifice;

      // If effects require selection
      if (needsSelection) {
        // Sacrifice first so you have space; this also runs LW on the amulet if any
        if (sacrifice) {
          logEvent("sacrifice", { owner, name: card.name, uid: card.uid, context: "engage" });
          removeWithLastWords(card, owner);
          render();
          cleanupDead();
        }

        // Run the full queue so handlers can attach resumeEffects properly
        runEffects([...effects], owner, card);
        card.engagedThisTurn = true;
        render();
        return;
      }


      // --- Rest of the function remains the same ---
      if (sacrifice) {
        // Remove first, then perform engage effects with space available
        logEvent("sacrifice", { owner, name: card.name, uid: card.uid, context: "engage" });
        removeWithLastWords(card, owner);
        render();
        cleanupDead();

        runEffects([...effects], owner, card);
        card.engagedThisTurn = true;
        render();
        return;
      }

      // Normal (non-sacrifice) engage:
      runEffects([...effects], owner, card);
      card.engagedThisTurn = true;

      // Only Countdown amulets can die here
      if (card.hasCountdown && Number(card.countdown ?? 0) <= 0) {
        logEvent("countdownZero", { owner, name: card.name, uid: card.uid, context: "engage" });
        console.log(`[Engage] Countdown reached 0 for ${card.name} (${owner}) - UID: ${card.uid}`);
        removeWithLastWords(card, owner);
        render();
        cleanupDead();
        return;
      }

      cleanupDead();
      render();
    },
    { owner, index },
    { autoRender: false }
  );
}

// Optional: reset per-turn flags; call this from your turn-advance logic.
export function resetEngageFlagsAtTurnStart(owner) {
  const board = boardOf(owner);
  for (const c of board) {
    if (c && c.type === "Amulet") c.engagedThisTurn = false;
  }
}
