import { state } from "../../core/gameState.js";
import type { Player } from "../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "./triggers/types.js";
import { dispatchEvent } from "./triggers/dispatcher.js";
import { registerRunEffectsInProcess } from "./triggers/process.js";
import { handleLootFusedDedupe } from "./triggers/tracking.js";
import { enrichContextWithUids } from "./triggers/resolve.js";
import { getBoard, getCrests } from "../../core/playerHelpers.js";

// Re-export for external consumers if needed
export type { TriggerContext } from "./triggers/types.js";

// --- Chain Depth Protection ---
// P0-1 FIX: Prevents infinite trigger loops by limiting chain depth.
// A trigger chain is when a trigger fires an effect that causes another trigger.
const MAX_TRIGGER_CHAIN_DEPTH = 100;
let _triggerChainDepth = 0;

// Exposed for testing/debugging
export function getTriggerChainDepth(): number {
  return _triggerChainDepth;
}

export function resetTriggerChainDepth(): void {
  _triggerChainDepth = 0;
}

// --- RunEffects Registration ---
// We keep the registration API on this module to maintain backward compatibility
// but forward the function to the process module where it's used.
// --- Architectural Guarantees ---
// 1. EXTENSIBILITY: Adding a new trigger event requires:
//    - Adding the event name to `TriggerEventName` inside `types.ts` (Strict Union).
//    - Adding a handler in `dispatcher.ts` (or relying on `handleGenericEvent`).
//    - Potentially adding a condition in `conditions.ts` if it uses generic logic.
//    - NEVER modifying `process.ts` for event-specific logic (use predicates or handlers).
//
// 2. ISOLATION:
//    - `tracking.ts` manages "once_per_turn" and global deduplication state.
//    - `utils.ts` handles candidate gathering (Crests/Zones).
//    - `handlers/*.ts` contain domain-specific logic (e.g., Combat, Fuse).
//
// 3. INVARIANTS:
//    - Execution Order: Crests -> Board -> Hand (Hand is last).
//    - Trace hooks are available via `DEBUG_TRIGGERS` (see `debug.ts`).
//    - Chain depth is limited to MAX_TRIGGER_CHAIN_DEPTH (100).
// --------------------------------

export function registerRunEffects(fn: any) {
  registerRunEffectsInProcess(fn);
}

// --- Main Entry Point ---

export function fireTrigger(
  eventName: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext = {},
) {
  // P0-1 FIX: Chain depth protection
  if (_triggerChainDepth >= MAX_TRIGGER_CHAIN_DEPTH) {
    const msg = `[Triggers] Chain depth exceeded ${MAX_TRIGGER_CHAIN_DEPTH}. ` +
      `Event: ${eventName}, Player: ${activePlayer}. ` +
      `This indicates an infinite loop in trigger effects.`;
    console.error(msg);
    throw new Error(msg);
  }

  _triggerChainDepth++;

  try {
    // P0-2 FIX: Enrich context with UIDs for deterministic serialization
    // PERF: Skip enrichment when DISABLE_UID_ENRICH is set (benchmarks/training)
    if (process.env.DISABLE_UID_ENRICH !== "1") {
      enrichContextWithUids(context);
    }

    const _turnToken = Number.isFinite(state.turnNumber)
      ? state.turnNumber
      : (state.roundCount || 0) * 2 + (state.activePlayer === "first" ? 0 : 1);

    // Enhance context with turn info for internal modules
    // Using a non-enumerable or specific prop to pass this down
    context._turnNumber = _turnToken;

    // 1. Loot Fused Dedupe
    if (eventName === "loot_fused" && context?.initiator) {
      if (handleLootFusedDedupe(context.initiator, _turnToken)) {
        return;
      }
    }

    // 2. Entering Owner Calc
    // Derived once here to save re-calculation deeply/repeatedly
    if (context.enteringOwner === undefined) {
      const enteringCard = context.enteringCard ?? context.invokedCard ?? null;
      if (enteringCard) {
        context.enteringOwner = getBoard(state, "first").includes(enteringCard)
          ? "first"
          : getBoard(state, "second").includes(enteringCard)
            ? "second"
            : null;
      } else {
        context.enteringOwner = null;
      }
    }

    // 3. Dispatch
    dispatchEvent(eventName, activePlayer, context);
  } finally {
    _triggerChainDepth--;
  }
}

// Helper kept for compatibility/utility if used externally, though not used in refactor
export function hasCrest(player: Player, crestName: string) {
  const crests = getCrests(state, player);
  return crests.some((c: any) => c.name === crestName);
}















