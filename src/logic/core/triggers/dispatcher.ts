import type { Player } from "../../../core/types/index.js";
import type { TriggerContext, TriggerEventName } from "./types.js";
import { handleGenericEvent } from "./handlers/common.js";
import { handleCombatEvent } from "./handlers/combat.js";
import { handlePlayEvent } from "./handlers/play.js";
import { handleTurnEvent } from "./handlers/turn.js";
import { handleFuseEvent } from "./handlers/fuse.js";
import { handleDamageEvent, handleBuffEvent } from "./handlers/self.js";
import { handleRestrictedZoneEvent } from "./handlers/zones.js";

type EventHandler = (
  event: TriggerEventName,
  activePlayer: Player,
  context: TriggerContext,
) => void;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  // Turn events
  start_of_turn: handleTurnEvent,
  end_of_turn: handleTurnEvent,

  // Combat - Strike family (attacker only)
  strike: handleCombatEvent, // Any attack target
  follower_strike: handleCombatEvent, // Attacking follower only
  leader_strike: handleCombatEvent, // Attacking leader only

  // Combat - Clash (follower combat, both parties eligible)
  clash: handleCombatEvent,

  // Combat - Attack watchers (after Strike/Clash, before damage)
  ally_follower_attacked: handleGenericEvent,
  enemy_follower_attacked: handleGenericEvent,

  // Combat - Defense
  leader_attacked: handleCombatEvent,
  leader_damaged: handleGenericEvent,

  // Leader state changes
  leader_restored: handleGenericEvent,

  // Play
  ally_follower_played: handlePlayEvent,

  // Special
  on_fuse: handleFuseEvent,
  self_damaged: handleDamageEvent,
  self_buffed_up: handleBuffEvent,

  // Restricted Generic
  ally_super_evolve: handleRestrictedZoneEvent,
  enemy_super_evolve: handleRestrictedZoneEvent,
  ally_evolve: handleRestrictedZoneEvent,
  engage: handleRestrictedZoneEvent,
  ally_follower_enter: handleRestrictedZoneEvent,
  enemy_follower_enter: handleRestrictedZoneEvent,

  // Explicit generic handlers (no implicit fallback)
  invoke: handleGenericEvent,
  loot_fused: handleGenericEvent,
  loot_played: handleGenericEvent,
  ally_follower_leaves_field: handleGenericEvent,
  enemy_follower_leaves_field: handleGenericEvent,
  enemy_follower_defense_down: handleGenericEvent,
  ally_ward_destroyed: handleGenericEvent,
  ally_amulet_destroyed: handleGenericEvent,
  select_mode: handleGenericEvent, // Mode selection (used by Faith crest)
  enhanced_play: handleGenericEvent,
};

export function dispatchEvent(
  event: TriggerEventName,
  activePlayer: Player, // legacy calls it activePlayer, but context.owner might differ
  context: TriggerContext,
) {
  const handler = EVENT_HANDLERS[event];

  // P2-5: Dev-mode warning for events without explicit handler registration
  if (!handler && typeof window !== "undefined" && (window as any).__DEV__) {
    console.warn(
      `[Triggers] Event "${event}" has no explicit handler, using generic fallback.`,
    );
  }

  (handler || handleGenericEvent)(event, activePlayer, context);
}
