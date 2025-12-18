import { state } from "../../core/gameState.js";
import { CardInstance, Player } from "../../core/types.js";
import { TriggerContext, TriggerEventName } from "./triggers/types.js";
import { dispatchEvent } from "./triggers/dispatcher.js";
import { registerRunEffectsInProcess } from "./triggers/process.js";
import { handleLootFusedDedupe } from "./triggers/tracking.js";

// Re-export for external consumers if needed
export type { TriggerContext } from "./triggers/types.js";

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
// --------------------------------

export function registerRunEffects(fn: any) {
    registerRunEffectsInProcess(fn);
}

// --- Main Entry Point ---

export function fireTrigger(eventName: TriggerEventName, activePlayer: Player, context: TriggerContext = {}) {
    const _turnToken =
        Number.isFinite(state.turnNumber) ? state.turnNumber
            : ((state.roundCount || 0) * 2 + (state.isBlueTurn ? 0 : 1));

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
            context.enteringOwner = state.blueBoard.includes(enteringCard) ? 'blue'
                : state.redBoard.includes(enteringCard) ? 'red'
                    : null;
        } else {
            context.enteringOwner = null;
        }
    }

    // 3. Dispatch
    dispatchEvent(eventName, activePlayer, context);
}

// Helper kept for compatibility/utility if used externally, though not used in refactor
export function hasCrest(player: Player, crestName: string) {
    const crests = player === 'blue' ? state.blueCrests : state.redCrests;
    return crests.some((c: any) => c.name === crestName);
}
