// src/logic/core/turns.ts
import { state } from "../../core/gameState.js";
import { drawCard } from "../../core/utils.js";
// @ts-ignore
// @ts-ignore
import { adapter } from "../../core/adapter.js";
import { recordEvent } from "../../core/debugTimeline.js";
import { fireTrigger } from "./triggers.js";
import { cleanupDead } from "./cleanup.js";
// @ts-ignore
import { clearTemporaryBuffs } from "../effects/self.js";
import { runEffects } from "./effects/index.js";
// @ts-ignore
import { tickCrests, processCrestEvent, resetCrestOncePerTurn } from "../effects/crest.js";
import { clearExpiredCantAttackAtEOT } from "./keywords.js";
// @ts-ignore
import { resetEngageFlagsAtTurnStart } from "../effects/ops/engage.js";
// @ts-ignore

// @ts-ignore
// import { processHimekaDelayedBanish } from "@logic/effects/cards/havencraft/himeka.js";
import { dealDamage } from "./barrier.js";
import { logEvent } from "../../core/logger.js";
import { beginAction, commitAction } from "../../core/history.js";
import { CardInstance, Player } from "../../core/types.js";

const isHeadless = () => (typeof globalThis !== "undefined" && (globalThis as any).HEADLESS);
const safeRender = () => {
    // console.log("turns.ts: HEADLESS check =", isHeadless());
    if (!isHeadless()) adapter.render();
};



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

/**
 * Handles the end of the blue player's turn and sets up the red player's turn.
 */
export function endTurnBlue() {
    if (!state.isBlueTurn) return;
    recordEvent({ type: "end_turn", payload: { player: "blue" } });
    beginAction("End Turn (Blue)");

    clearTempHandCostMods("blue");
    state.blueBoard.forEach(card => clearTemporaryBuffs(card));
    fireTrigger("end_of_turn", "blue");
    // processHimekaDelayedBanish("blue");
    safeRender();

    // ✅ Blue: run crest effects one by one, then cleanup once
    {
        const fx = processCrestEvent("blue", "end_of_turn");
        if (fx.length) {
            state.suppressCleanup = true;            // <— start atomic crest phase
            for (const eff of fx) {
                console.log("[Turns] Running crest effect op:", eff.op);
                runEffects([eff], "blue", null);
            }
            state.suppressCleanup = false;           // <— end atomic crest phase
        }
        cleanupDead();                             // resolve deaths + Last Words once
    }

    clearCantAttackUntilOpponentEOT(state.blueBoard);
    applyBleedAllBoardsAtEndOfTurn();

    state.redMaxPP = Math.min(state.roundCount + (state.redPermPP || 0), 10);
    state.redPP = state.redMaxPP;

    // Reset evolution usage flag
    state.blueEvoUsedThisTurn = false;

    clearSummoningSickness(state.redBoard);

    resetCrestOncePerTurn("red");
    resetEngageFlagsAtTurnStart("red");
    {
        const redStartFx = processCrestEvent("red", "start_of_turn");
        if (redStartFx.length) runEffects([...redStartFx], "red", null);
    }

    {
        const redCrestFx = tickCrests("red");
        if (redCrestFx.length) runEffects([...redCrestFx], "red", null);
    }
    cleanupDead();

    drawCard(state.redHand, state.redDeck, "red");
    logEvent("draw", { player: "red", count: 1 }); // in endTurnBlue()
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

    safeRender();
    logEvent("endTurn", { from: "blue" });
    commitAction({ autoRender: false });
}

export function endTurnRed() {
    if (state.isBlueTurn) return;
    beginAction("End Turn (Red)");

    clearTempHandCostMods("red");
    state.redBoard.forEach(card => clearTemporaryBuffs(card));
    fireTrigger("end_of_turn", "red");
    // processHimekaDelayedBanish("red");
    safeRender();

    // ✅ Red: run crest effects one by one, then cleanup once
    {
        const fx = processCrestEvent("red", "end_of_turn");
        if (fx.length) {
            state.suppressCleanup = true;
            for (const eff of fx) runEffects([eff], "red", null);
            state.suppressCleanup = false;
        }
        cleanupDead();
    }
    clearCantAttackUntilOpponentEOT(state.redBoard);
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
    {
        const blueStartFx = processCrestEvent("blue", "start_of_turn");
        if (blueStartFx.length) runEffects([...blueStartFx], "blue", null);
    }

    {
        const blueCrestFx = tickCrests("blue");
        if (blueCrestFx.length) runEffects([...blueCrestFx], "blue", null);
    }
    cleanupDead();

    drawCard(state.blueHand, state.blueDeck, "blue");
    logEvent("draw", { player: "blue", count: 1 }); // in endTurnRed()
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

    safeRender();
    logEvent("endTurn", { from: "red" });
    commitAction({ autoRender: false });
}


function handleCountdowns(owner: Player) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    board.forEach(card => {
        if (card?.type === "Amulet" && card.hasCountdown) {
            (card as any).countdown = (Number((card as any).countdown) || 0) - 1;
        }
    });
}

function clearSummoningSickness(board: CardInstance[]) {
    board.forEach(card => {
        if (card?.type === "Follower") {
            card.justPlayed = false;
        }
    });
}

function clearCantAttackUntilOpponentEOT(board: CardInstance[]) {
    board.forEach(card => {
        if (!card || card.type !== "Follower") return;
        if (!(card as any).cantAttackUntilOpponentEOT) return;

        // Drop all functional + UI flags
        delete (card as any).cantAttack;
        delete (card as any).cantAttackFollowers;
        delete (card as any).cantAttackLeaders;
        delete (card as any).cantAttackUntilOpponentEOT;
        delete (card as any).hasCantAttack;           // <-- fixes your CSS overlay never dropping

        // Make sure attackability is recalculated for UI/logic
        const perTurn = Number.isFinite((card as any).attacks_per_turn) ? (card as any).attacks_per_turn : 1;
        if ((card as any).attacks_left == null) (card as any).attacks_left = perTurn;
        // Respect rush/storm/summoning-sickness
        const eligible = (!!card.hasStorm) || (!card.justPlayed) || (!!card.hasRush);
        (card as any).can_attack = eligible && ((card as any).attacks_left > 0);
    });
}

function resetShikigamiDeathLogs() {
    state.shikigamiDeathsThisTurnBlue = [];
    state.shikigamiDeathsThisTurnRed = [];
}

