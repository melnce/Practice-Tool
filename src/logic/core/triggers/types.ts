import { CardInstance, Effect } from "../../../core/types.js";

// =============================================================================
// TRIGGER EVENT TYPES
// =============================================================================
// Combat triggers fire at specific moments during attack resolution.
// All fire BEFORE damage is dealt.
//
// STRIKE FAMILY (attacker only):
//   - strike: Fires when attacking ANYTHING (follower or leader)
//   - follower_strike: Fires ONLY when attacking a follower
//   - leader_strike: Fires ONLY when attacking the enemy leader
//
// CLASH (both parties eligible):
//   - clash: Fires when follower combat occurs (not vs leader)
//   - Only cards with a clash trigger will fire - checks both attacker and defender
//
// Note: These are trigger EVENTS, not keywords. Cards define effects in their
// `triggers` array with `"event": "strike"` etc.
// =============================================================================

export type TriggerEventName =
  // Turn phases
  | "start_of_turn"
  | "end_of_turn"
  // Combat - Strike family (attacker only, fires before damage)
  | "strike"          // Any attack target (follower OR leader)
  | "follower_strike" // Attacking a follower only
  | "leader_strike"   // Attacking the leader only
  // Combat - Clash (both parties eligible, follower combat only)
  | "clash"
  // Combat - Defense
  | "leader_attacked"
  | "leader_damaged"
  // Leader state changes
  | "leader_restored" // When leader defense is restored
  // Board state changes
  | "ally_follower_enter"
  | "enemy_follower_enter"
  | "ally_follower_played"
  | "ally_follower_leaves_field"   // When YOUR follower leaves the field
  | "enemy_follower_leaves_field"  // When ENEMY follower leaves the field
  | "ally_ward_destroyed"
  | "enemy_follower_defense_down"
  // Self state changes
  | "self_damaged"
  | "self_buffed_up"
  // Evolution
  | "ally_super_evolve"
  | "enemy_super_evolve"
  // Mechanics
  | "engage"
  | "on_fuse"
  | "loot_fused"
  | "loot_played"
  | "invoke"
  | "select_mode";  // Mode selection (used by Faith crest)

export interface TriggerContext {
  initiator?: CardInstance;
  enteringCard?: CardInstance;
  invokedCard?: CardInstance;
  target?: CardInstance;
  damagedCard?: CardInstance;
  attacker?: CardInstance;
  defender?: CardInstance;
  playedCard?: CardInstance;
  costChanged?: boolean;
  // Allow any other properties
  [key: string]: any;
}

export interface TriggerSpec {
  event: TriggerEventName;
  type?: string; // Shorthand alias (e.g. "end_of_turn_own")
  condition?: {
    not_self?: boolean;
    tribe?: string;
    has_keyword?: string | string[];
    keywords?: string | string[];
    still_alive?: boolean;
    own_turn?: boolean;
    cost_changed?: boolean;
    name?: string;
    whose_turn?: "owner" | "opponent";
    is_ally?: boolean;
    is_self?: boolean;
    attack_lte?: number;
    attack_gte?: number;
    defense_lte?: number;
    defense_gte?: number;
    [key: string]: any;
  };
  effects: Effect[];
  source?: "board" | "hand" | "deck" | "banish" | "graveyard" | null;
  once_per_turn?: boolean;
  once_key?: string;
  your_turn_only?: boolean;
  usedThisTurn?: boolean; // Runtime state
}















