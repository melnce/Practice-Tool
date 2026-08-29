import type {
  CardInstance,
  Effect,
  Player,
} from "../../../core/types/index.js";
import { logEvent } from "../../../core/logger.js";
import type { TriggerContext, TriggerEventName, TriggerSpec } from "./types.js";
import { shouldFire, markFired } from "./tracking.js";
import { evalCommonConditions } from "./conditions.js";
import { DEBUG_TRIGGERS } from "./debug.js";
import { triggerMatchesCandidateZone } from "./utils.js";

// Cycle breaker for runEffects
let runEffects: (
  effects: Effect[],
  owner: Player,
  source: CardInstance,
  context: any,
) => void = () => {
  console.warn("runEffects called before registration");
};

export function registerRunEffectsInProcess(fn: typeof runEffects) {
  runEffects = fn;
}

// P2-2: Type safety note for ProcessingCandidate.card
// Currently `any` due to polymorphic usage (CardInstance | Crest).
// TODO: Define union type `TriggerableEntity = CardInstance | CrestInstance`
export interface ProcessingCandidate {
  card: any; // P2-2: CardInstance for board/hand, Crest for crests
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

// P0-4 FIX: Maximum trigger chain depth to prevent infinite loops
const MAX_CHAIN_DEPTH = 100;

export function processCandidateTriggers(
  candidates: ProcessingCandidate[],
  options: ProcessOptions,
) {
  const { event, activePlayer, context, predicate } = options;

  // P0-4 FIX: Chain depth guard to prevent infinite trigger recursion
  const currentDepth = ((context as any)._chainDepth ?? 0) as number;
  if (currentDepth > MAX_CHAIN_DEPTH) {
    console.error(
      `[Triggers] Chain depth exceeded ${MAX_CHAIN_DEPTH} for event "${event}". ` +
        `Possible infinite loop. Aborting trigger processing.`,
    );
    return;
  }
  // Increment depth for nested trigger calls
  (context as any)._chainDepth = currentDepth + 1;

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

      // Ownership check for ally/enemy events:
      // ally_* events should only fire for cards whose owner matches activePlayer
      // enemy_* events should only fire for cards whose owner is the opponent of activePlayer
      if (event.startsWith("ally_") && owner !== activePlayer) continue;
      if (event.startsWith("enemy_") && owner === activePlayer) continue;

      // Rulebook §317: a dying follower does not observe its own leave/destruction.
      if (
        (event === "ally_follower_leaves_field" ||
          event === "enemy_follower_leaves_field") &&
        context.leavingCard &&
        cand.card?.uid === context.leavingCard.uid
      ) {
        continue;
      }

      // Shorthand Logic: end_of_turn_own means must be owner's turn
      if (trigger.type === "end_of_turn_own") {
        if (activePlayer !== owner) continue;
      }

      // 1. Zone scope — board triggers do not fire from hand (C2/C1)
      if (!triggerMatchesCandidateZone(trigger, source, card)) continue;

      // 2. Custom Predicate (Event-specific logic)
      if (predicate && !predicate(trigger, cand)) {
        DEBUG_TRIGGERS.log({
          event,
          card: card.name,
          triggerId: trigger.event,
          result: "skip_predicate",
          source: cand.source,
        });
        continue;
      }

      // 3. Common Conditions
      if (!options.skipCommonConditions) {
        if (
          !evalCommonConditions(trigger, card, owner, activePlayer, context)
        ) {
          DEBUG_TRIGGERS.log({
            event,
            card: card.name,
            triggerId: trigger.event,
            result: "skip_conditions",
          });
          continue;
        }
      }

      // 4. Tracking / Once Per Turn (always enforce once_per_turn and max_per_turn)
      const enforceTracking =
        trigger.once_per_turn ||
        (trigger.max_per_turn != null && trigger.max_per_turn > 0);

      if (enforceTracking) {
        if (!shouldFire(trigger, card, event, currentTurn, context)) {
          DEBUG_TRIGGERS.log({
            event,
            card: card.name,
            triggerId: trigger.event,
            result: trigger.once_per_turn
              ? "skip_once_per_turn"
              : "skip_max_per_turn",
          });
          continue;
        }
      } else if (!options.skipTracking) {
        if (!shouldFire(trigger, card, event, currentTurn, context)) {
          DEBUG_TRIGGERS.log({
            event,
            card: card.name,
            triggerId: trigger.event,
            result: "skip_tracking",
          });
          continue;
        }
      }

      // 5. Execute
      DEBUG_TRIGGERS.log({
        event,
        card: card.name,
        triggerId: trigger.event,
        result: "fire",
      });
      logEvent("trigger", {
        event: event,
        card: card?.name,
        cardUid: card?.uid,
      });

      // PERF: Pass effects array directly without spread (runEffects doesn't mutate it)
      runEffects(trigger.effects || [], owner, card, context);

      // 6. Mark Fired
      if (enforceTracking || !options.skipTracking) {
        markFired(trigger, card, event, currentTurn, context);
      }
      // Phase 4: REMOVED legacy usedThisTurn fallback in skipTracking branch
    }
  }
}
