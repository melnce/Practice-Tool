
export const COMBAT_OPS = [
    "damage", // Unified damage op - handles all damage variants via distribution/amount_source fields
    "destroy",
    "destroy_all",
    "destroy_highest",
    "destroy_random",
    "destroy_random_other_allies",
    "destroy_allied_amulets",
    "destroy_allied_amulets_then_damage",
    "destroy_self",
    "destroy_then",
    "destroy_defender_if_damaged",
    "follower_strike_destroy",
    "banish",
    "banish_all_enemy_copies",
    "banish_duplicates_from_deck",
    "banish_random",
    "banish_self",

    "add_leader_damage_taken_bonus",
    "heal_leader",
    "dynamic_heal_leader",
    "set_max_hp",
    "leader_barrier",
    "set_leader_max_damage_cap",
    "modify_leader_damage_received",
    "restore_full_defense_self",
    "restore_self_and_heal_leader",
    "restore_allies",
    "clash_damage"
] as const;
