import type { CardInstance } from "../../../core/types/index.js";
import { makeOncePerTurnKey } from "./keys.js";
import type { TriggerSpec, TriggerEventName, TriggerContext } from "./types.js";
import { logEvent } from "../../../core/logger.js";

// --- Dedupe map for "one fuse → one ping" invariant ---
// P2-4: WeakMap is acceptable here since:
// 1. Cards stay alive during the turn they're fused
// 2. If GC'd between fuses (rare), a new fusion is legitimate
// 3. Cleared implicitly when cards are removed from game
const _seenLootFuseThisTurn = new WeakMap<CardInstance, number>();

// Phase 3: Helper to access the __onceByTurn store (now typed on CardInstance)
function getOnceByTurnStore(hostCard: CardInstance): Record<string, number> {
  if (!hostCard.__onceByTurn) {
    hostCard.__onceByTurn = Object.create(null);
  }
  return hostCard.__onceByTurn!;
}

// LEGACY: Special global dedupe for Loot Fusion (one ping per turn rule)
export function handleLootFusedDedupe(
  initiator: CardInstance,
  turn: number,
): boolean {
  const prevTurn = _seenLootFuseThisTurn.get(initiator);
  if (prevTurn === turn) {
    logEvent("triggerDeduped", {
      event: "loot_fused",
      initiator: initiator.name || "(unknown)",
      turn: turn,
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
  _context?: TriggerContext,
): boolean {
  // 1. Max activations per turn (count stored in __onceByTurn)
  if (trigger.max_per_turn != null && trigger.max_per_turn > 0) {
    const key = `${makeOncePerTurnKey(trigger, event)}:count:${currentTurn}`;
    const store = getOnceByTurnStore(hostCard);
    const count = (store[key] as number) || 0;
    if (count >= trigger.max_per_turn) {
      logEvent("triggerSkip", {
        event: event,
        card: hostCard?.name,
        reason: "max_per_turn",
      });
      return false;
    }
  }

  // 2. Once Per Turn
  if (trigger.once_per_turn) {
    const key = makeOncePerTurnKey(trigger, event);
    const store = getOnceByTurnStore(hostCard);
    if (store[key] === currentTurn) {
      logEvent("triggerSkip", {
        event: event,
        card: hostCard?.name,
        reason: "once_per_turn",
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
  _context?: TriggerContext,
): void {
  // 1. Once Per Turn
  if (trigger.once_per_turn) {
    const key = makeOncePerTurnKey(trigger, event);
    const store = getOnceByTurnStore(hostCard);
    store[key] = currentTurn;
    // Phase 4: REMOVED trigger.usedThisTurn assignment
  }

  if (trigger.max_per_turn != null && trigger.max_per_turn > 0) {
    const key = `${makeOncePerTurnKey(trigger, event)}:count:${currentTurn}`;
    const store = getOnceByTurnStore(hostCard);
    store[key] = ((store[key] as number) || 0) + 1;
  }
}
