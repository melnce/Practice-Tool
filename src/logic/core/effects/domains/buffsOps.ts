export const BUFF_OPS = [
  // Unified stat - covers give +X/+Y, set stats, buff_hand_*, combo_repeat (mode:combo_repeat), etc
  "stat",
  // combo_repeat_buff was removed - now handled by stat with mode: "combo_repeat"
  "attacks_per_turn",

  // Unified keyword - replaces keyword, remove_keyword, remove_abilities, grant_trigger
  "keyword",

  // Unified cost - replaces 6 legacy cost ops
  "cost",

  // Unified counter - replaces add_counter (handles card counters like earth, faith)
  "counter",

  // Unified countdown - handles amulet and crest countdown timers
  // NOTE: This is now a standalone op, eliminating the amulet/crest redirect
  "countdown",

  // Unified spellboost - replaces 5 legacy spellboost ops
  // spellboost_transform is now handled by unified transform op with zone: "hand"
  "spellboost",
] as const;
