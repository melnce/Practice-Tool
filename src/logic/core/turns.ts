// src/logic/core/turns.ts
import { state } from "../../core/gameState.js";
import { drawCard } from "../../core/utils.js";
import { adapter } from "../../core/adapter.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { fireTrigger } from "./triggers.js";
import { cleanupDead } from "./cleanup.js";
import { clearTemporaryBuffs } from "../effects/self.js";
import { runEffects } from "./effects/index.js";
import { tickCrests, processCrestEvent, resetCrestOncePerTurn } from "../effects/crest.js";
import { clearExpiredCantAttackAtEOT } from "./keywords/eot.js";
import { resetEngageFlagsAtTurnStart } from "../effects/ops/engage.js";
import { handleInvoke } from "../effects/ops/summon.js";
import { dealDamage } from "./barrier.js";
import { logEvent } from "../../core/logger.js";
import { beginAction, commitAction } from "../../core/history.js";
import { CardInstance, Player } from "../../core/types.js";


/**
 * Helper: at the start of a player's turn, refresh their followers.
 * - reset temporary flags
 * - restore number of attacks based on attacks_per_turn (default 1)
 * - allow attacking this turn (standard rule: once you've survived to your owner's turn)
 */
function refreshBoardForNewTurn(board: CardInstance[]) {
    board.forEach(card => {
        if (card?.type !== "Follower") return;

        // Reset swing counters for multi-attack followers
        const perTurn = Number.isFinite((card as any).attacks_per_turn) ? (card as any).attacks_per_turn : 1;
        (card as any).attacks_per_turn = perTurn;
        (card as any).attacks_left = perTurn;

        // Respect summoning sickness unless Rush/Storm, but never allow attacking while locked
        const isLocked = (card as any).cantAttack || (card as any).cantAttackFollowers || (card as any).cantAttackLeaders;
        const canSwing = (!card.justPlayed) || card.hasRush || card.hasStorm;
        (card as any).can_attack = canSwing && !isLocked;

        // Legacy/UI flag
        card.hasAttacked = false;

        // NEW: reset per-turn usage counter so EOT checks are accurate
        (card as any).attacks_used_this_turn = 0;
    });
}

function clearTempHandCostMods(endedPlayer: Player) {
    const hand = endedPlayer === "blue" ? state.blueHand : state.redHand;
    for (const card of hand) {
        const delta = parseInt((card as any).temp_cost_mod_until_eot) || 0;
        if (delta !== 0) {
            (card as any).cost_mod = (parseInt((card as any).cost_mod) || 0) - delta;
            delete (card as any).temp_cost_mod_until_eot;
        }
    }
}


function applyBleedAllBoardsAtEndOfTurn() {
    const sides = [
        { owner: 'blue', board: state.blueBoard },
        { owner: 'red', board: state.redBoard },
    ];

    for (const { owner, board } of sides) {
        for (const card of board) {
            if (!card || card.type !== 'Follower') continue;
            if (!(card as any).hasBleed || !(card as any).bleed) continue;

            const toLeader = Number((card as any).bleed.toLeader || 0);
            const toSelf = Number((card as any).bleed.toSelf || 0);

            if (toLeader > 0) {
                if (owner === "blue") {
                    state.blueHP = Math.max(0, state.blueHP - toLeader);
                } else {
                    state.redHP = Math.max(0, state.redHP - toLeader);
                }
            }
            if (toSelf > 0) dealDamage(card, toSelf);     // the follower itself
        }
    }
}

function tickAmuletCountdowns(owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    for (const card of board) {
        if (card?.type === "Amulet" && card.hasCountdown && typeof (card as any).countdown === "number" && (card as any).countdown > 0) {
            (card as any).countdown -= 1;
        }
    }
}

// --- Invoke Logic ---
// Helper to scan deck for Invoke cards
function scanDeckForInvokes(owner: Player, timing: "start_of_turn" | "end_of_turn") {
    const deck = owner === "blue" ? state.blueDeck : state.redDeck;
    // const board = owner === "blue" ? state.blueBoard : state.redBoard;

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
        const cardTiming = inv.timing || "start_of_turn"; // Defaulting to start for now

        // Console log for debugging the user's issue
        console.log(`[InvokeScan] Card=${card.name} Timing=${cardTiming} CurrentPhase=${timing}`);

        if (cardTiming !== timing) continue;

        // Simple condition check (extensible)
        let conditionMet = false;

        // Evolve count check
        if (typeof inv.condition.evolved_count_at_least === "number") {
            const stat = owner === "blue" ? state.blueEvoCount : state.redEvoCount;
            console.log(`[InvokeScan] ConditionCheck: Need=${inv.condition.evolved_count_at_least} Have=${stat}`);
            if (stat >= inv.condition.evolved_count_at_least) conditionMet = true;
        }

        if (conditionMet) {
            console.log(`[InvokeScan] MATCH! Invoking ${card.name}`);
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
    console.error(`[Turns] endTurnBlue called. isBlueTurn: ${state.isBlueTurn}`);
    if (!state.isBlueTurn) return;

    try {
        recordEvent({ type: "end_turn", payload: { player: "blue" } });
        beginAction("End Turn (Blue)");

        clearTempHandCostMods("blue");
        state.blueBoard.forEach(card => clearTemporaryBuffs(card));

        try {
            fireTrigger("end_of_turn", "blue");
        } catch (e) { console.error("Error firing end_of_turn triggers:", e); }

        // processHimekaDelayedBanish("blue");
        adapter.render();

        // Check End of Turn Invokes
        try {
            scanDeckForInvokes("blue", "end_of_turn");
        } catch (e) { console.error("Error in Invoke scan:", e); }

        // ✅ Blue: run crest effects one by one, then cleanup once
        try {
            const fx = processCrestEvent("blue", "end_of_turn");
            if (fx.length) {
                state.suppressCleanup = true;            // <— start atomic crest phase
                for (const eff of fx) {
                    console.log("[Turns] Running crest effect op:", eff.op);
                    runEffects([eff], "blue", null);
                }
                state.suppressCleanup = false;           // <— end atomic crest phase
            }
        } catch (e) {
            console.error("Error in Crest effects:", e);
            state.suppressCleanup = false;
        }
        cleanupDead();                             // resolve deaths + Last Words once

        clearExpiredCantAttackAtEOT("blue");
        applyBleedAllBoardsAtEndOfTurn();

        state.redMaxPP = Math.min(state.roundCount + (state.redPermPP || 0), 10);
        state.redPP = state.redMaxPP;

        // Reset evolution usage flag
        state.blueEvoUsedThisTurn = false;

        clearSummoningSickness(state.redBoard);

        resetCrestOncePerTurn("red");
        resetEngageFlagsAtTurnStart("red");
        try {
            const redStartFx = processCrestEvent("red", "start_of_turn");
            if (redStartFx.length) runEffects([...redStartFx], "red", null);
        } catch (e) { console.error("Error in Red start effects:", e); }

        try {
            const redCrestFx = tickCrests("red");
            if (redCrestFx.length) runEffects([...redCrestFx], "red", null);
        } catch (e) { console.error("Error in Red tick crests:", e); }
        cleanupDead();

        // Draw for Red
        drawCard(state.redHand, state.redDeck, "red");
        logEvent("draw", { player: "red", count: 1 });
        // Invoke Phase (Start of Turn)
        try {
            scanDeckForInvokes("red", "start_of_turn");
        } catch (e) { console.error("Error in Red Invoke Start:", e); }

        state.redPlaysThisTurn = 0;

        refreshBoardForNewTurn(state.redBoard);

        state.isBlueTurn = false;

        tickAmuletCountdowns("red");
        cleanupDead();
        state.activePlayer = "red";
        logEvent("startTurn", { player: state.activePlayer, round: state.roundCount });
        state.redAnyAllyAttackedThisTurn = false;
        state.redEvoUsedThisTurn = false;
        resetShikigamiDeathLogs();

        adapter.render();
        logEvent("endTurn", { from: "blue" });
        commitAction({ autoRender: false });
    } catch (criticalError) {
        console.error("CRITICAL ERROR IN END_TURN (Blue):", criticalError);
        // Force turn flip to avoid stuck state
        state.isBlueTurn = false;
        state.activePlayer = "red";
        adapter.render();
    }
}

export function endTurnRed() {
    if (state.isBlueTurn) return;
    try {
        console.log("I AM REAL TURNS TS");
        beginAction("End Turn (Red)");

        console.log("MARKER 0.1");
        try { clearTempHandCostMods("red"); } catch (e) { console.log("ERR 0.1", e); }
        console.log("MARKER 0.2");
        try { state.redBoard.forEach(card => clearTemporaryBuffs(card)); } catch (e) { console.log("ERR 0.2", e); }
        console.log("MARKER 0.3");
        try {
            fireTrigger("end_of_turn", "red");
        } catch (e) { console.error("Error firing end_of_turn triggers (red):", e); }

        console.log("MARKER 0.4 - Rendering");
        try { adapter.render(); } catch (e) { console.log("ERR Render", e); }
        console.log("MARKER 0.5 - Post Render");

        // Check End of Turn Invokes
        // Check End of Turn Invokes
        try {
            scanDeckForInvokes("red", "end_of_turn");
        } catch (e) { console.error("Error in Red Invoke EOT:", e); }
        console.log("MARKER 2");

        // ✅ Red: run crest effects one by one, then cleanup once
        try {
            console.log("MARKER 2.1 - CREST START");
            const fx = processCrestEvent("red", "end_of_turn");
            if (fx.length) {
                state.suppressCleanup = true;
                for (const eff of fx) runEffects([eff], "red", null);
                state.suppressCleanup = false;
            }
            console.log("MARKER 2.2 - CREST END");
        } catch (e) {
            console.error("Error in Red Crest EOT:", e);
            state.suppressCleanup = false;
        }
        console.log("MARKER 3");
        cleanupDead();

        clearExpiredCantAttackAtEOT("red");
        applyBleedAllBoardsAtEndOfTurn();


        if (state.redBoostPending) {
            if (state.roundCount <= 5) state.redBoostUsedEarly = true;
            else state.redBoostUsedLate = true;
            state.redBoostPending = false;
        }

        state.roundCount++;

        state.blueMaxPP = Math.min(state.roundCount + (state.bluePermPP || 0), 10);
        state.bluePP = state.blueMaxPP;

        // Reset evolution usage flag
        state.redEvoUsedThisTurn = false;

        clearSummoningSickness(state.blueBoard);

        resetCrestOncePerTurn("blue");
        resetEngageFlagsAtTurnStart("blue");
        try {
            const blueStartFx = processCrestEvent("blue", "start_of_turn");
            if (blueStartFx.length) runEffects([...blueStartFx], "blue", null);
        } catch (e) { console.error("Error in Blue Start effects:", e); }

        try {
            const blueCrestFx = tickCrests("blue");
            if (blueCrestFx.length) runEffects([...blueCrestFx], "blue", null);
        } catch (e) { console.error("Error in Blue Tick Crests:", e); }
        cleanupDead();

        // Draw for Blue
        drawCard(state.blueHand, state.blueDeck, "blue");
        logEvent("draw", { player: "blue", count: 1 });
        // Invoke Phase (Start of Turn)
        try {
            scanDeckForInvokes("blue", "start_of_turn");
        } catch (e) { console.error("Error in Blue Start Invoke:", e); }

        state.bluePlaysThisTurn = 0;

        refreshBoardForNewTurn(state.blueBoard);

        state.isBlueTurn = true;
        tickAmuletCountdowns("blue");

        cleanupDead();
        state.activePlayer = "blue";
        logEvent("startTurn", { player: state.activePlayer, round: state.roundCount });
        state.blueAnyAllyAttackedThisTurn = false;
        state.blueEvoUsedThisTurn = false;
        resetShikigamiDeathLogs();

        adapter.render();
        logEvent("endTurn", { from: "red" });
        commitAction({ autoRender: false });
    } catch (criticalError) {
        console.error("CRITICAL ERROR IN END_TURN (Red):", criticalError);
        // Force turn flip
        state.isBlueTurn = true;
        state.activePlayer = "blue";
        state.roundCount++; // Ensure round count increments if failed before
        adapter.render();
    }
}


// function handleCountdowns(owner: Player) {
//     const board = owner === "blue" ? state.blueBoard : state.redBoard;
//     board.forEach(card => {
//         if (card?.type === "Amulet" && card.hasCountdown) {
//             (card as any).countdown = (Number((card as any).countdown) || 0) - 1;
//         }
//     });
// }

function clearSummoningSickness(board: CardInstance[]) {
    board.forEach(card => {
        if (card?.type === "Follower") {
            card.justPlayed = false;
        }
    });
}



function resetShikigamiDeathLogs() {
    state.shikigamiDeathsThisTurnBlue = [];
    state.shikigamiDeathsThisTurnRed = [];
}

