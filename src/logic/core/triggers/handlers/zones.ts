import type { Player } from "../../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "../types.js";
import { dispatchOrderedTriggers } from "./common.js";

// Handles ally/enemy_follower_enter, engage, super_evolve
// These events have specific owner/source constraints but follow generic logic otherwise.
export function handleRestrictedZoneEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  dispatchOrderedTriggers(event, activePlayer, context, {
    predicate: (trigger, cand) => {
      if (event === "ally_super_evolve") return cand.owner === activePlayer;
      if (event === "enemy_super_evolve") return cand.owner !== activePlayer;
      if (event === "ally_evolve") return cand.owner === activePlayer;
      if (event === "engage") return cand.owner === activePlayer;

      const enteringCard = context.enteringCard ?? context.invokedCard ?? null;
      const enteringOwner = context.enteringOwner;

      if (event === "ally_follower_enter") {
        if (!enteringCard) return false;
        if (cand.owner !== enteringOwner) return false;
        // Hand "activates in hand" cards (Calge, Unfeeling Eld Axe, …) listen too.
        if (
          cand.source !== "board" &&
          cand.source !== "crest" &&
          cand.source !== "hand"
        )
          return false;
        return true;
      }

      if (event === "enemy_follower_enter") {
        if (!enteringCard) return false;
        if (cand.owner === enteringOwner) return false;
        if (cand.source !== "board" && cand.source !== "crest") return false;
        return true;
      }

      return true;
    },
  });
}
