// src/logic/core/turns.ts
import { state } from "../../core/gameState.js";
import { drawCard } from "../../core/utils.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { cleanupDead } from "./cleanup.js";
import { tickCrests, resetCrestOncePerTurn } from "../effects/crest.js";
import {
  runEndOfTurnBoundary,
  runStartOfTurnBoundary,
} from "./turnBoundary.js";
import { clearExpiredCantAttackAtEOT } from "./keywords/eot.js";
import { isCantAttackLocked } from "./keywords/has.js";
import { resetEngageFlagsAtTurnStart } from "../effects/ops/engage.js";
import { handleInvoke } from "../effects/ops/summon.js";
import { dealDamage } from "./barrier.js";
import { applyLeaderDamage } from "../effects/leader.js";
import { logEvent } from "../../core/logger.js";
import { beginAction, commitAction, abortAction } from "../../core/history.js";
import type { CardInstance, Player } from "../../core/types/index.js";
import {
  isFirstPlayer,
  getHand,
  getBoard,
  getDeck,
  getEvoCount,
  getPP,
  setPP,
  getMaxPP,
  setMaxPP,
  getPermPP,
  setPlaysThisTurn,
  setEvoUsedThisTurn,
  setAnyAllyAttackedThisTurn,
} from "../../core/playerHelpers.js";

/**
 * Helper: at the start of a player's turn, refresh their followers.
 * - reset temporary flags
 * - restore number of attacks based on attacks_per_turn (default 1)
 * - allow attacking this turn (standard rule: once you've survived to your owner's turn)
 */
function refreshBoardForNewTurn(board: CardInstance[]) {
  board.forEach((card) => {
    if (card?.type !== "Follower") return;

    // Reset swing counters for multi-attack followers
    const perTurn = Number.isFinite((card as any).attacks_per_turn)
      ? (card as any).attacks_per_turn
      : 1;
    (card as any).attacks_per_turn = perTurn;
    (card as any).attacks_left = perTurn;

    // Respect summoning sickness unless Rush/Storm, but never allow attacking while locked.
    // Lock SoT is keywordState via isCantAttackLocked (keywords-contract §3).
    const isLocked = isCantAttackLocked(card);
    const canSwing = !card.justPlayed || card.hasRush || card.hasStorm;
    (card as any).can_attack = canSwing && !isLocked;

    // Legacy/UI flag
    card.hasAttacked = false;

    (card as any).attacks_used_this_turn = 0;
  });
}

function clearExpiredLeaderEffects(endedPlayer: Player) {
  // If endedPlayer just ended their turn, process expirations.
  // "opponent_turn_end" means if I am the opponent of the effect holder, and I ended my turn, it expires.
  const isFirst = isFirstPlayer(endedPlayer);

  // Check first player's effects (if second player ended turn)
  if (!isFirst) {
    if (state.players.first.leaderMaxDamageCapExpiry === "opponent_turn_end") {
      state.players.first.leaderMaxDamageCap = null;
      state.players.first.leaderMaxDamageCapExpiry = null;
      logEvent("leaderEffectExpired", {
        owner: "first",
        effect: "max_damage_cap",
      });
    }
  }

  // Check second player's effects (if first player ended turn)
  if (isFirst) {
    if (state.players.second.leaderMaxDamageCapExpiry === "opponent_turn_end") {
      state.players.second.leaderMaxDamageCap = null;
      state.players.second.leaderMaxDamageCapExpiry = null;
      logEvent("leaderEffectExpired", {
        owner: "second",
        effect: "max_damage_cap",
      });
    }
  }
}

function clearTempHandCostMods(endedPlayer: Player) {
  const hand = getHand(state, endedPlayer);
  for (const card of hand) {
    // Temporary cost *set* (e.g. Mari until-EOT → 0): restore from base_cost.
    if ((card as any).temp_cost_set_until_eot) {
      if (card.base_cost !== undefined) {
        card.cost = card.base_cost;
      }
      delete (card as any).temp_cost_set_until_eot;
    }
    const delta = parseInt((card as any).temp_cost_mod_until_eot) || 0;
    if (delta !== 0) {
      (card as any).cost_mod = (parseInt((card as any).cost_mod) || 0) - delta;
      delete (card as any).temp_cost_mod_until_eot;
    }
  }
}

function applyBleedAllBoardsAtEndOfTurn() {
  const sides: { owner: Player; board: CardInstance[] }[] = [
    { owner: "first", board: getBoard(state, "first") },
    { owner: "second", board: getBoard(state, "second") },
  ];

  for (const { owner, board } of sides) {
    for (const card of board) {
      if (!card || card.type !== "Follower") continue;
      if (!(card as any).hasBleed || !(card as any).bleed) continue;

      const toLeader = Number((card as any).bleed.toLeader || 0);
      const toSelf = Number((card as any).bleed.toSelf || 0);

      if (toLeader > 0) {
        applyLeaderDamage(owner, toLeader);
      }
      if (toSelf > 0) dealDamage(card, toSelf); // the follower itself
    }
  }
}

function tickAmuletCountdowns(owner: Player) {
  const board = getBoard(state, owner);
  for (const card of board) {
    if (
      card?.type === "Amulet" &&
      card.hasCountdown &&
      typeof (card as any).countdown === "number" &&
      (card as any).countdown > 0
    ) {
      (card as any).countdown -= 1;
    }
  }
}

// --- Invoke Logic ---
// Helper to scan deck for Invoke cards
function scanDeckForInvokes(
  owner: Player,
  timing: "start_of_turn" | "end_of_turn",
) {
  const deck = getDeck(state, owner);

  // Safety copy to iterate while mutating deck
  const candidates = [...deck];
  const invokedNames = new Set<string>();

  for (const card of candidates) {
    // Skip if we already invoked a copy of this card
    if (invokedNames.has(card.name)) continue;

    // Run condition check
    const inv = (card as any).invoke;
    if (!inv || !inv.condition) continue;

    // Check timing (default to start_of_turn of NOT specified, for backward compat, or require explicit?)
    // User wants explicit. Sandalphon now has explicit.
    const cardTiming = inv.timing || "start_of_turn";

    if (cardTiming !== timing) continue;

    // Simple condition check (extensible)
    let conditionMet = false;

    // Evolve count check
    if (typeof inv.condition.evolved_count_at_least === "number") {
      const stat = getEvoCount(state, owner);
      if (stat >= inv.condition.evolved_count_at_least) conditionMet = true;
    }

    if (conditionMet) {
      logEvent("invoke", { owner, card: card.name });
      invokedNames.add(card.name);

      // Execute invoke logic via centralized handler
      // This ensures stats are initialized, triggers fire, and Rally increments.
      handleInvoke(owner, card);

      // "Only 1 copy of an Invoke card will activated each turn"

      // "Only 1 copy of an Invoke card will activated each turn"
      // This limit is per-name usually.
      // For now, simpler: processed one, maybe break if we want strict single invoke per name?
      // User requirement: "Only 1 copy of an Invoke card will activated each turn"
      // We should strip subsequent copies of THIS card name from candidates?
      // Naive approach: break after first success? No, different cards can invoke.
      // Correct approach: Track invoked names this turn.
    }
  }
}

/**
 * Unified end-turn logic. Handles cleanup, triggers, and turn transition.
 * @param endingPlayer - The player whose turn is ending
 */
function _endTurnCore(endingPlayer: Player) {
  if (state.phase === "gameover") return;
  const nextPlayer = endingPlayer === "first" ? "second" : "first";
  const endingLabel = endingPlayer === "first" ? "Blue" : "Red";

  recordEvent({ type: "end_turn", payload: { player: endingPlayer } });
  beginAction(`End Turn (${endingLabel})`);

  try {
    // === PHASE 1: End-of-Turn boundary (C1: deferDeathTriggers, not suppressCleanup) ===
    clearTempHandCostMods(endingPlayer);

    try {
      runEndOfTurnBoundary(endingPlayer);
    } catch (e) {
      console.error(`Error in end-of-turn boundary (${endingLabel}):`, e);
    }

    try {
      scanDeckForInvokes(endingPlayer, "end_of_turn");
    } catch (e) {
      console.error(`Error in ${endingLabel} Invoke EOT:`, e);
    }

    cleanupDead();

    clearExpiredCantAttackAtEOT(endingPlayer);
    applyBleedAllBoardsAtEndOfTurn();
    clearExpiredLeaderEffects(endingPlayer);

    // === PHASE 2: Special Second Player Logic (PP Boost, Round Increment) ===
    if (endingPlayer === "second") {
      if (state.secondPlayerPPBoostPending) {
        if (state.roundCount <= 5) state.secondPlayerPPBoostUsedEarly = true;
        else state.secondPlayerPPBoostUsedLate = true;
        state.secondPlayerPPBoostPending = false;
      }
      state.roundCount++;
    }

    // === PHASE 3: Prepare Next Player's Turn ===
    setMaxPP(
      state,
      nextPlayer,
      Math.min(state.roundCount + getPermPP(state, nextPlayer), 10),
    );
    setPP(state, nextPlayer, getMaxPP(state, nextPlayer));

    // Reset evolution usage flag for ending player
    setEvoUsedThisTurn(state, endingPlayer, false);

    clearSummoningSickness(getBoard(state, nextPlayer));

    resetCrestOncePerTurn(nextPlayer);
    resetEngageFlagsAtTurnStart(nextPlayer);

    setPlaysThisTurn(state, nextPlayer, 0);
    refreshBoardForNewTurn(getBoard(state, nextPlayer));

    try {
      runStartOfTurnBoundary(nextPlayer, {
        tickCrests,
        tickAmulets: tickAmuletCountdowns,
      });
    } catch (e) {
      console.error(`Error in start-of-turn boundary (${nextPlayer}):`, e);
    }

    // Draw step 8 ? after SOT queue resolves
    drawCard(
      getHand(state, nextPlayer),
      getDeck(state, nextPlayer),
      nextPlayer,
    );
    logEvent("draw", { player: nextPlayer, count: 1 });

    try {
      scanDeckForInvokes(nextPlayer, "start_of_turn");
    } catch (e) {
      console.error(`Error in ${nextPlayer} Start Invoke:`, e);
    }

    cleanupDead();

    // === PHASE 4: Switch Active Player ===
    state.activePlayer = nextPlayer;
    state.turnNumber = (state.turnNumber || 0) + 1;
    logEvent("startTurn", {
      player: state.activePlayer,
      round: state.roundCount,
      turn: state.turnNumber,
    });

    setAnyAllyAttackedThisTurn(state, nextPlayer, false);
    setEvoUsedThisTurn(state, nextPlayer, false);
    resetShikigamiDeathLogs();

    logEvent("endTurn", { from: endingPlayer });
    commitAction({ autoRender: true });
  } catch (e) {
    abortAction({ autoRender: false });
    throw e;
  }
}

/**
 * Handles the end of the first player's (blue) turn and sets up the second player's turn.
 */
export function endTurnBlue() {
  if (state.phase === "gameover") return;
  if (state.activePlayer !== "first") return;

  try {
    _endTurnCore("first");
  } catch (criticalError) {
    console.error("CRITICAL ERROR IN END_TURN (Blue):", criticalError);
    // Force turn flip to avoid stuck state
    state.activePlayer = "second";
  }
}

/**
 * Handles the end of the second player's (red) turn and sets up the first player's turn.
 */
export function endTurnRed() {
  if (state.phase === "gameover") return;
  if (state.activePlayer === "first") return;

  try {
    _endTurnCore("second");
  } catch (criticalError) {
    console.error("CRITICAL ERROR IN END_TURN (Red):", criticalError);
    // Force turn flip
    state.activePlayer = "first";
    state.roundCount++; // Ensure round count increments if failed before
  }
}

function clearSummoningSickness(board: CardInstance[]) {
  board.forEach((card) => {
    if (card?.type === "Follower") {
      card.justPlayed = false;
    }
  });
}

function resetShikigamiDeathLogs() {
  state.players.first.shikigamiDeathsThisTurn = [];
  state.players.second.shikigamiDeathsThisTurn = [];
}
