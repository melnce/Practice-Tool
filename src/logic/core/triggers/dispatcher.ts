import { Player } from "../../../core/types.js";
import { TriggerContext, TriggerEventName } from "./types.js";
import { handleGenericEvent } from "./handlers/common.js";
import { handleCombatEvent } from "./handlers/combat.js";
import { handlePlayEvent } from "./handlers/play.js";
import { handleTurnEvent } from "./handlers/turn.js";
import { handleFuseEvent } from "./handlers/fuse.js";
import { handleDamageEvent, handleBuffEvent } from "./handlers/self.js";
import { handleRestrictedZoneEvent } from "./handlers/zones.js";

type EventHandler = (event: TriggerEventName, activePlayer: Player, context: TriggerContext) => void;

const EVENT_HANDLERS: Record<string, EventHandler> = {
    // Turn events
    "start_of_turn": handleTurnEvent,
    "end_of_turn": handleTurnEvent,

    // Combat
    "clash": handleCombatEvent,
    "strike": handleCombatEvent,
    "follower_strike": handleCombatEvent,

    // Play
    "ally_follower_played": handlePlayEvent,

    // Special
    "on_fuse": handleFuseEvent,
    "self_damaged": handleDamageEvent,
    "self_buffed_up": handleBuffEvent,

    // Restricted Generic
    "ally_super_evolve": handleRestrictedZoneEvent,
    "enemy_super_evolve": handleRestrictedZoneEvent,
    "engage": handleRestrictedZoneEvent,
    "ally_follower_enter": handleRestrictedZoneEvent,
    "enemy_follower_enter": handleRestrictedZoneEvent,
};


export function dispatchEvent(
    event: TriggerEventName,
    activePlayer: Player, // legacy calls it activePlayer, but context.owner might differ
    context: TriggerContext
) {
    const handler = EVENT_HANDLERS[event] || handleGenericEvent;
    handler(event, activePlayer, context);
}
