// src/logic/core/turns.ts
import { state } from "../../core/gameState.js";
import { drawCard } from "../../core/utils.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { fireTrigger } from "./triggers.js";
import { cleanupDead } from "./cleanup.js";
import { clearTemporaryBuffs } from "../effects/self.js";
import { runEffects } from "./effects/index.js";
import {
  tickCrests,
  processCrestEvent,
  resetCrestOncePerTurn,
} from "../effects/crest.js";
import { clearExpiredCantAttackAtEOT } from "./keywords/eot.js";
import { resetEngageFlagsAtTurnStart } from "../effects/ops/engage.js";
import { handleInvoke } from "../effects/ops/summon.js";
import { dealDamage } from "./barrier.js";
import { logEvent } from "../../core/logger.js";
import { beginAction, commitAction } from "../../core/history.js";
import { CardInstance, Player } from "../../core/types.js";
import { isFirstPlayer, getHand, getBoard, getDeck, setHP, getHP, getEvoCount, getPP, setPP, getMaxPP, setMaxPP, getPermPP, setPlaysThisTurn, setEvoUsedThisTurn, setAnyAllyAttackedThisTurn } from "../../core/playerHelpers.js";

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

    // Respect summoning sickness unless Rush/Storm, but never allow attacking while locked
    const isLocked =
      (card as any).cantAttack ||
      (card as any).cantAttackFollowers ||
      (card as any).cantAttackLeaders;
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
  const s = state as any;

  // Check first player's effects (if second player ended turn)
  if (!isFirst) {
    if (s.blueLeaderMaxDamageCapExpiry === "opponent_turn_end") {
      delete s.blueLeaderMaxDamageCap;
      delete s.blueLeaderMaxDamageCapExpiry;
      logEvent("leaderEffectExpired", {
        owner: "first",
        effect: "max_damage_cap",
      });
    }
  }

  // Check second player's effects (if first player ended turn)
  if (isFirst) {
    if (s.redLeaderMaxDamageCapExpiry === "opponent_turn_end") {
      delete s.redLeaderMaxDamageCap;
      delete s.redLeaderMaxDamageCapExpiry;
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
        const currentHP = getHP(state, owner);
        setHP(state, owner, Math.max(0, currentHP - toLeader));
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
    // User wants explicit. Let's strict match if present, else default?
    // Better: strict match. Sandalphon now has explicit.
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
 * Handles the end of the blue player's turn and sets up the red player's turn.
 */
export function endTurnBlue() {
  if (state.activePlayer !== "first") return;

  try {
    recordEvent({ type: "end_turn", payload: { player: "first" } });
    beginAction("End Turn (Blue)");

    clearTempHandCostMods("first");
    getBoard(state, "first").forEach((card) => clearTemporaryBuffs(card));

    try {
      fireTrigger("end_of_turn", "first");
    } catch (e) {
      console.error("Error firing end_of_turn triggers:", e);
    }

    // processHimekaDelayedBanish("first");
    // Render removed - UI orchestrator handles rendering

    // Check End of Turn Invokes
    try {
      scanDeckForInvokes("first", "end_of_turn");
    } catch (e) {
      console.error("Error in Invoke scan:", e);
    }

    // ? Blue: run crest effects one by one, then cleanup once
    try {
      const fx = processCrestEvent("first", "end_of_turn");
      if (fx.length) {
        state.suppressCleanup = true; // <� start atomic crest phase
        for (const eff of fx) {
          runEffects([eff], "first", null);
        }
        state.suppressCleanup = false; // <� end atomic crest phase
      }
    } catch (e) {
      console.error("Error in Crest effects:", e);
      state.suppressCleanup = false;
    }
    cleanupDead(); // resolve deaths + Last Words once

    clearExpiredCantAttackAtEOT("first");
    applyBleedAllBoardsAtEndOfTurn();
    clearExpiredLeaderEffects("first");

    setMaxPP(state, "second", Math.min(state.roundCount + getPermPP(state, "second"), 10));
    setPP(state, "second", getMaxPP(state, "second"));

    // Reset evolution usage flag
    setEvoUsedThisTurn(state, "first", false);

    clearSummoningSickness(getBoard(state, "second"));

    resetCrestOncePerTurn("second");
    resetEngageFlagsAtTurnStart("second");
    try {
      const redStartFx = processCrestEvent("second", "start_of_turn");
      if (redStartFx.length) runEffects([...redStartFx], "second", null);
    } catch (e) {
      console.error("Error in Red start effects:", e);
    }

    try {
      const redCrestFx = tickCrests("second");
      if (redCrestFx.length) runEffects([...redCrestFx], "second", null);
    } catch (e) {
      console.error("Error in Red tick crests:", e);
    }
    cleanupDead();

    // Draw for Red
    drawCard(getHand(state, "second"), getDeck(state, "second"), "second");
    logEvent("draw", { player: "second", count: 1 });
    // Invoke Phase (Start of Turn)
    try {
      scanDeckForInvokes("second", "start_of_turn");
    } catch (e) {
      console.error("Error in Red Invoke Start:", e);
    }

    setPlaysThisTurn(state, "second", 0);

    refreshBoardForNewTurn(getBoard(state, "second"));

    // isBlueTurn removed - activePlayer is source of truth

    tickAmuletCountdowns("second");
    cleanupDead();
    state.activePlayer = "second";
    logEvent("startTurn", {
      player: state.activePlayer,
      round: state.roundCount,
    });
    // Fire start_of_turn trigger for red's turn
    try {
      fireTrigger("start_of_turn", "second");
    } catch (e) {
      console.error("Error firing start_of_turn triggers (red):", e);
    }
    setAnyAllyAttackedThisTurn(state, "second", false);
    setEvoUsedThisTurn(state, "second", false);
    resetShikigamiDeathLogs();

    // Render removed - UI orchestrator handles rendering
    logEvent("endTurn", { from: "blue" });
    commitAction({ autoRender: false });
  } catch (criticalError) {
    console.error("CRITICAL ERROR IN END_TURN (Blue):", criticalError);
    // Force turn flip to avoid stuck state
    // isBlueTurn removed - activePlayer is source of truth
    state.activePlayer = "second";
    // Render removed - UI orchestrator handles rendering
  }
}

export function endTurnRed() {
  if (state.activePlayer === "first") return;
  try {
    beginAction("End Turn (Red)");

    clearTempHandCostMods("second");
    getBoard(state, "second").forEach((card) => clearTemporaryBuffs(card));

    try {
      fireTrigger("end_of_turn", "second");
    } catch (e) {
      console.error("Error firing end_of_turn triggers (red):", e);
    }

    // Render removed - UI orchestrator handles rendering

    try {
      scanDeckForInvokes("second", "end_of_turn");
    } catch (e) {
      console.error("Error in Red Invoke EOT:", e);
    }

    try {
      const fx = processCrestEvent("second", "end_of_turn");
      if (fx.length) {
        state.suppressCleanup = true;
        for (const eff of fx) runEffects([eff], "second", null);
        state.suppressCleanup = false;
      }
    } catch (e) {
      console.error("Error in Red Crest EOT:", e);
      state.suppressCleanup = false;
    }
    cleanupDead();

    clearExpiredCantAttackAtEOT("second");
    applyBleedAllBoardsAtEndOfTurn();
    clearExpiredLeaderEffects("second");

    if (state.secondPlayerPPBoostPending) {
      if (state.roundCount <= 5) state.secondPlayerPPBoostUsedEarly = true;
      else state.secondPlayerPPBoostUsedLate = true;
      state.secondPlayerPPBoostPending = false;
    }

    state.roundCount++;

    setMaxPP(state, "first", Math.min(state.roundCount + getPermPP(state, "first"), 10));
    setPP(state, "first", getMaxPP(state, "first"));

    // Reset evolution usage flag
    setEvoUsedThisTurn(state, "second", false);

    clearSummoningSickness(getBoard(state, "first"));

    resetCrestOncePerTurn("first");
    resetEngageFlagsAtTurnStart("first");
    try {
      const blueStartFx = processCrestEvent("first", "start_of_turn");
      if (blueStartFx.length) runEffects([...blueStartFx], "first", null);
    } catch (e) {
      console.error("Error in Blue Start effects:", e);
    }

    try {
      const blueCrestFx = tickCrests("first");
      if (blueCrestFx.length) runEffects([...blueCrestFx], "first", null);
    } catch (e) {
      console.error("Error in Blue Tick Crests:", e);
    }
    cleanupDead();

    // Draw for Blue
    drawCard(getHand(state, "first"), getDeck(state, "first"), "first");
    logEvent("draw", { player: "first", count: 1 });
    // Invoke Phase (Start of Turn)
    try {
      scanDeckForInvokes("first", "start_of_turn");
    } catch (e) {
      console.error("Error in Blue Start Invoke:", e);
    }

    setPlaysThisTurn(state, "first", 0);

    refreshBoardForNewTurn(getBoard(state, "first"));

    // isBlueTurn removed - activePlayer is source of truth
    tickAmuletCountdowns("first");

    cleanupDead();
    state.activePlayer = "first";
    logEvent("startTurn", {
      player: state.activePlayer,
      round: state.roundCount,
    });
    // Fire start_of_turn trigger for blue's turn
    try {
      fireTrigger("start_of_turn", "first");
    } catch (e) {
      console.error("Error firing start_of_turn triggers (blue):", e);
    }
    setAnyAllyAttackedThisTurn(state, "first", false);
    setEvoUsedThisTurn(state, "first", false);
    resetShikigamiDeathLogs();

    // Render removed - UI orchestrator handles rendering
    logEvent("endTurn", { from: "second" });
    commitAction({ autoRender: false });
  } catch (criticalError) {
    console.error("CRITICAL ERROR IN END_TURN (Red):", criticalError);
    // Force turn flip
    // isBlueTurn removed - activePlayer is source of truth
    state.activePlayer = "first";
    state.roundCount++; // Ensure round count increments if failed before
    // Render removed - UI orchestrator handles rendering
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















