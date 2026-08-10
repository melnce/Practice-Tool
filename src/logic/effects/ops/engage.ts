// src/logic/effects/ops/engage.ts
import { state } from "../../../core/gameState.js";
import { runEffects } from "../../core/effects/index.js";
import { cleanupDead } from "../../core/cleanup.js";
import { fireTrigger } from "../../core/triggers.js";
import { logEvent } from "../../../core/logger.js";
import { doAction } from "../../../core/history.js";
import type {
  Player,
  CardInstance,
  Effect,
} from "../../../core/types/index.js";
import {
  getBoard,
  getGraveyard,
  getPP,
  setPP,
  addShadows,
} from "../../../core/playerHelpers.js";

// --- Helpers ---
function boardOf(owner: Player) {
  return getBoard(state, owner);
}
// function graveOf(owner: Player) {
//     return getGraveyard(state, owner);
// }
function payEngageCost(owner: Player, cost: number) {
  // Assume PP system; no-op if you already checked affordability elsewhere.
  const cur = getPP(state, owner);
  setPP(state, owner, Math.max(0, cur - (cost | 0)));
}
function effectsNeedSelection(effects: Effect[] = []) {
  return (
    Array.isArray(effects) &&
    effects.some(
      (e) =>
        e &&
        (e.select === true ||
          (typeof e.select === "number" && e.select > 0) ||
          e.op === "select"),
    )
  );
}

function removeWithLastWords(card: CardInstance, owner: Player) {
  const board = getBoard(state, owner);
  const grave = getGraveyard(state, owner);
  const idx = board.findIndex((c) => c?.uid === card.uid);
  if (idx === -1) {
    return;
  }
  const removed = board.splice(idx, 1)[0];
  if (!removed) return;

  if (removed?.hasLastWords && Array.isArray(removed.lastWordsEffects)) {
    runEffects([...removed.lastWordsEffects], owner, removed);
  }

  grave.push(removed);
  addShadows(state, owner, 1);
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
export function engageAmulet(owner: Player, index: number) {
  return doAction(
    "Engage Amulet",
    () => {
      const board = boardOf(owner);
      if (index < 0 || index >= board.length) return;

      const card = board[index];
      if (!card || card.type !== "Amulet" || !card.hasEngage) return;

      const s = card.keywordState;
      const engageOncePerTurn =
        s?.engageOncePerTurn ?? card.engageOncePerTurn ?? true;
      if (engageOncePerTurn !== false && s?.engagedThisTurn) {
        // console.warn(`[Engage] ${card.name} already engaged this turn`);
        logEvent("engageSkipped", { reason: "limit", name: card.name });
        return;
      }

      const cost = Number(s?.engageCost ?? card.engageCost ?? 0);

      // Affordability check (optional; keep if your UI doesn't pre-check)
      const pp = getPP(state, owner);
      if (pp < cost) return;

      logEvent("engageStart", { owner, name: card.name, uid: card.uid, cost });
      // Pay + mark
      payEngageCost(owner, cost);
      logEvent("ppSpend", { owner, amount: cost, reason: "engage" });

      // Fire the global engage trigger BEFORE effects so listeners (e.g., Mainyu) see it.
      // Provide minimal context for listeners if needed later.
      fireTrigger("engage", owner, { sourceCard: card });

      const engageEffects = s?.engageEffects ?? card.engageEffects;
      const effects = (
        Array.isArray(engageEffects) ? engageEffects.slice() : []
      ) as Effect[];
      const needsSelection = effectsNeedSelection(effects);
      const sacrifice = !!(s?.engageSacrifice ?? card.engageSacrifice);

      // If effects require selection
      if (needsSelection) {
        // Sacrifice first so you have space; this also runs LW on the amulet if any
        if (sacrifice) {
          logEvent("sacrifice", {
            owner,
            name: card.name,
            uid: card.uid,
            context: "engage",
          });
          removeWithLastWords(card, owner);
          // Render removed - UI layer
          cleanupDead();
        }

        // Run the full queue so handlers can attach resumeEffects properly
        runEffects([...effects], owner, card);
        if (!card.keywordState) card.keywordState = {};
        card.keywordState.engagedThisTurn = true;

        // Render removed - UI layer
        cleanupDead();
        return;
      }

      // --- Rest of the function remains the same ---
      if (sacrifice) {
        // Remove first, then perform engage effects with space available
        logEvent("sacrifice", {
          owner,
          name: card.name,
          uid: card.uid,
          context: "engage",
        });
        removeWithLastWords(card, owner);
        // Render removed - UI layer
        cleanupDead();

        runEffects([...effects], owner, card);
        if (!card.keywordState) card.keywordState = {};
        card.keywordState.engagedThisTurn = true;
        // Render removed - UI layer
        return;
      }

      // Normal (non-sacrifice) engage:
      runEffects([...effects], owner, card);
      if (!card.keywordState) card.keywordState = {};
      card.keywordState.engagedThisTurn = true;

      // Only Countdown amulets can die here
      if (card.hasCountdown && Number(card.countdown ?? 0) <= 0) {
        logEvent("countdownZero", {
          owner,
          name: card.name,
          uid: card.uid,
          context: "engage",
        });
        // console.log(`[Engage] Countdown reached 0 for ${card.name} (${owner}) - UID: ${card.uid}`);
        removeWithLastWords(card, owner);
        // Render removed - UI layer
        cleanupDead();
        return;
      }

      cleanupDead();
      // Render removed - UI layer
    },
    { owner, index },
    { autoRender: true },
  );
}

// Optional: reset per-turn flags; call this from your turn-advance logic.
export function resetEngageFlagsAtTurnStart(owner: Player) {
  const board = boardOf(owner);
  for (const c of board) {
    if (c && c.type === "Amulet" && c.keywordState)
      c.keywordState.engagedThisTurn = false;
  }
}
