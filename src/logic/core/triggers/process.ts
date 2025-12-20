import { CardInstance, Effect, Player } from "../../../core/types.js";
import { logEvent } from "../../../core/logger.js";
import { TriggerContext, TriggerEventName, TriggerSpec } from "./types.js";
import { shouldFire, markFired } from "./tracking.js";
import { evalCommonConditions } from "./conditions.js";
import { DEBUG_TRIGGERS } from "./debug.js";

// Cycle breaker for runEffects
let runEffects: (effects: Effect[], owner: Player, source: CardInstance, context: any) => void = () => {
    console.warn("runEffects called before registration");
};

export function registerRunEffectsInProcess(fn: typeof runEffects) {
    runEffects = fn;
}

export interface ProcessingCandidate {
    card: CardInstance;
    owner: Player;
    source: string; // "board", "hand", "crest", etc.
    triggers: TriggerSpec[];
}

export interface ProcessOptions {
    event: TriggerEventName;
    activePlayer: Player;
    context: TriggerContext;
    predicate?: (trigger: TriggerSpec, candidate: ProcessingCandidate) => boolean;
    skipCommonConditions?: boolean;
    skipTracking?: boolean;
}

export function processCandidateTriggers(
    candidates: ProcessingCandidate[],
    options: ProcessOptions
) {
    const { event, activePlayer, context, predicate } = options;

    // We assume context has turnNumber info if needed, or we compute it.
    const currentTurn = context._turnNumber as number;

    for (const cand of candidates) {
        const { card, owner, source } = cand;

        for (const trigger of cand.triggers) {
            let checkEvent = trigger.event;

            // Shorthand: end_of_turn_own
            if (trigger.type === "end_of_turn_own") {
                checkEvent = "end_of_turn";
            }

            if (checkEvent !== event) continue;

            // Shorthand Logic: end_of_turn_own means must be owner's turn
            if (trigger.type === "end_of_turn_own") {
                if (activePlayer !== owner) continue;
            }



            // 1. Source Check
            // Legacy: Default source for followers/amulets is board-only unless specified
            if (cand.source !== 'crest') {
                const defaultSource = (card.type === "Follower" || card.type === "Amulet") ? "board" : null;
                const requiredSource = trigger.source || defaultSource;
                if (requiredSource && requiredSource !== source) continue;
            }

            // 2. Custom Predicate (Event-specific logic)
            if (predicate && !predicate(trigger, cand)) {
                DEBUG_TRIGGERS.log({ event, card: card.name, triggerId: trigger.event, result: 'skip_predicate', source: cand.source });
                continue;
            }

            // 3. Common Conditions
            if (!options.skipCommonConditions) {
                if (!evalCommonConditions(trigger, card, owner, activePlayer, context)) {
                    DEBUG_TRIGGERS.log({ event, card: card.name, triggerId: trigger.event, result: 'skip_conditions' });
                    continue;
                }
            }

            // 4. Tracking / Once Per Turn
            if (!options.skipTracking) {
                if (!shouldFire(trigger, card, event, currentTurn, context)) {
                    DEBUG_TRIGGERS.log({ event, card: card.name, triggerId: trigger.event, result: 'skip_tracking' });
                    continue;
                }
            }

            // 5. Execute
            DEBUG_TRIGGERS.log({ event, card: card.name, triggerId: trigger.event, result: 'fire' });
            logEvent("trigger", { event: event, card: card?.name });

            runEffects([...(trigger.effects || [])], owner, card, context);

            // 6. Mark Fired
            if (!options.skipTracking) {
                markFired(trigger, card, event, currentTurn, context);
            } else {
                // Compatibility for broken/legacy once_per_turn behavior in specific handlers
                if (trigger.once_per_turn) trigger.usedThisTurn = true;
            }
        }
    }
}
