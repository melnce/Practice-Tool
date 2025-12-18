
import { CardInstance } from "../../../core/types.js";
import { makeOncePerTurnKey } from "./keys.js";
import { TriggerSpec, TriggerEventName, TriggerContext } from "./types.js";
import { logEvent } from "../../../core/logger.js";

// --- Dedupe map for "one fuse → one ping" invariant ---
const _seenLootFuseThisTurn = new WeakMap<CardInstance, number>();

// Helper to access the hidden __onceByTurn property
function getOnceByTurnStore(hostCard: CardInstance): Record<string, number> {
    if (!(hostCard as any).__onceByTurn) {
        (hostCard as any).__onceByTurn = Object.create(null);
    }
    return (hostCard as any).__onceByTurn;
}

// LEGACY: Special global dedupe for Loot Fusion (one ping per turn rule)
export function handleLootFusedDedupe(initiator: CardInstance, turn: number): boolean {
    const prevTurn = _seenLootFuseThisTurn.get(initiator);
    if (prevTurn === turn) {
        logEvent("triggerDeduped", {
            event: "loot_fused",
            initiator: initiator.name || "(unknown)",
            turn: turn
        });
        return true; // Deduped (skip)
    }
    _seenLootFuseThisTurn.set(initiator, turn);
    return false; // Not deduped (proceed)
}

export function shouldFire(
    trigger: TriggerSpec,
    hostCard: CardInstance,
    event: TriggerEventName,
    currentTurn: number,
    context?: TriggerContext
): boolean {
    // 1. Once Per Turn
    if (trigger.once_per_turn) {
        const key = makeOncePerTurnKey(trigger, event);
        const store = getOnceByTurnStore(hostCard);
        if (store[key] === currentTurn) {
            logEvent("triggerSkip", {
                event: event,
                card: hostCard?.name,
                reason: "once_per_turn"
            });
            return false;
        }
    }

    return true;
}

export function markFired(
    trigger: TriggerSpec,
    hostCard: CardInstance,
    event: TriggerEventName,
    currentTurn: number,
    context?: TriggerContext
): void {
    // 1. Once Per Turn
    if (trigger.once_per_turn) {
        const key = makeOncePerTurnKey(trigger, event);
        const store = getOnceByTurnStore(hostCard);
        store[key] = currentTurn;
        trigger.usedThisTurn = true; // Legacy/Compat flag
    }
}
