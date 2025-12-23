import { CardInstance, Effect } from "../../../core/types.js";

export type TriggerEventName =
  | "start_of_turn"
  | "end_of_turn"
  | "ally_follower_enter"
  | "enemy_follower_enter"
  | "ally_follower_played"
  | "self_damaged"
  | "self_buffed_up"
  | "ally_super_evolve"
  | "enemy_super_evolve"
  | "clash"
  | "strike"
  | "follower_strike"
  | "engage"
  | "on_fuse"
  | "loot_fused"
  | "loot_played"
  | "follower_leaves_field"
  | "ally_ward_destroyed"
  | "enemy_follower_defense_down"
  | "allied_follower_leaves_field"
  | "invoke"
  | "destroyed"
  | "select_mode"
  | "leader_attacked"
  | "leader_damaged";

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
