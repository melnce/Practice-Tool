import { Player } from "../../../../core/types.js";
import { TriggerContext, TriggerEventName } from "../types.js";
import { getAllZoneCandidates, getCrestCandidates } from "../utils.js";
import { processCandidateTriggers } from "../process.js";

// Handles ally/enemy_follower_enter, engage, super_evolve
// These events have specific owner/source constraints but follow generic logic otherwise.
export function handleRestrictedZoneEvent(
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) {
  const crests = getCrestCandidates(activePlayer);
  processCandidateTriggers(crests, { event, activePlayer, context });

  const zones = getAllZoneCandidates();
  processCandidateTriggers(zones, {
    event,
    activePlayer,
    context,
    // Standard pipeline but with extra restrictions (predicate)
    predicate: (trigger, cand) => {
      if (event === "ally_super_evolve") return cand.owner === activePlayer;
      if (event === "enemy_super_evolve") return cand.owner !== activePlayer;
      if (event === "engage") return cand.owner === activePlayer;

      const enteringCard = context.enteringCard ?? context.invokedCard ?? null;
      const enteringOwner = context.enteringOwner;

      if (event === "ally_follower_enter") {
        if (!enteringCard) return false;
        if (cand.owner !== enteringOwner) return false;
        if (cand.source !== "board") return false;
        return true;
      }

      if (event === "enemy_follower_enter") {
        if (!enteringCard) return false;
        if (cand.owner === enteringOwner) return false; // Must be enemy
        if (cand.source !== "board") return false;
        return true;
      }

      return true;
    },
  });
}
