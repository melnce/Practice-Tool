// src/logic/effects/ops/countdown/unified.ts
// Unified countdown handler - works for both amulets and crests

import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { logEvent } from "../../../../core/logger.js";
import { state } from "../../../../core/gameState.js";
import { Crest, completeCrest } from "../../crest.js";
import { getCrests } from "../../../../core/playerHelpers.js";

export type CountdownAction = "advance" | "delay";

export interface CountdownHandlerContext {
    owner: Player;
    source?: any; // CardInstance | Crest | null - using any for caller flexibility
}

/**
 * Unified countdown handler.
 * Works for both amulets (CardInstance) and crests (Crest).
 * 
 * Actions:
 * - "advance": Reduce countdown (move toward 0)
 * - "delay": Increase countdown (delay expiry)
 * 
 * Targeting:
 * - target: "self" → uses ctx.source (amulet or crest)
 * - name: "CrestName" → finds crest by name
 */
export function handleCountdown(eff: Effect, ctx: CountdownHandlerContext): void {
    const action = normalizeAction((eff as any).action);
    const amount = Number((eff as any).amount ?? 1);
    const targetSpec = (eff as any).target;
    const crestName = (eff as any).name;

    // Route to appropriate handler
    if (targetSpec === "self" && ctx.source) {
        // Instance-based: amulet or crest passed as source
        if (isCrest(ctx.source)) {
            handleCrestCountdown(ctx.source, action, amount, ctx.owner);
        } else {
            handleAmuletCountdown(ctx.source as CardInstance, action, amount);
        }
    } else if (crestName) {
        // Name-based: find crest by name
        const crest = findCrestByName(ctx.owner, crestName);
        if (crest) {
            handleCrestCountdown(crest, action, amount, ctx.owner);
        }
    } else if (ctx.source && !isCrest(ctx.source)) {
        // Default: assume amulet source
        handleAmuletCountdown(ctx.source as CardInstance, action, amount);
    }
}

/**
 * Normalize action string to canonical form (advance or delay)
 */
function normalizeAction(action: string): CountdownAction {
    if (action === "advance") {
        return "advance";
    }
    if (action === "delay") {
        return "delay";
    }
    return "advance"; // default
}

/**
 * Check if object is a Crest (not a CardInstance)
 */
function isCrest(obj: any): obj is Crest {
    return obj && typeof obj === "object" && "owner" in obj && !("uid" in obj);
}

/**
 * Find crest by name for a player
 */
function findCrestByName(owner: Player, name: string): Crest | undefined {
    const crests = getCrests(state, owner);
    return crests.find(c => c.name?.toLowerCase() === name?.toLowerCase());
}

// =============================================================================
// AMULET COUNTDOWN
// =============================================================================

function handleAmuletCountdown(card: CardInstance, action: CountdownAction, amount: number): void {
    if (card.type !== "Amulet" || !card.hasCountdown) return;

    if (action === "advance") {
        card.countdown = Math.max(0, (Number(card.countdown) || 0) - amount);
    } else {
        card.countdown = (Number(card.countdown) || 0) + amount;
    }

    logEvent("countdownChange", {
        card: card.name,
        owner: card.owner,
        value: card.countdown,
    });

    // Render removed - UI layer
    // Note: cleanupDead() handles amulet death when countdown=0
}

// =============================================================================
// CREST COUNTDOWN
// =============================================================================

function handleCrestCountdown(crest: Crest, action: CountdownAction, amount: number, owner: Player): void {
    if (!Number.isFinite(crest.countdown)) return;

    if (action === "advance") {
        (crest as any).countdown = Math.max(0, (Number(crest.countdown) || 0) - amount);

        logEvent("countdownChange", {
            card: crest.name,
            owner,
            value: crest.countdown,
        });

        if ((crest as any).countdown <= 0) {
            completeCrest(crest, owner);
        } else {
            // Render removed - UI layer
        }
    } else {
        (crest as any).countdown = (Number(crest.countdown) || 0) + amount;

        logEvent("countdownChange", {
            card: crest.name,
            owner,
            value: crest.countdown,
        });

        // Render removed - UI layer
    }
}















