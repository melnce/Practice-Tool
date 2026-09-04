export const MISC_OPS = [
  "select",
  "mode",
  "mode_bonus",
  // Unified evolve - replaces 8 legacy evolve_* ops
  "evolve",
  // Legacy shims (delegate to unified evolve) — card JSON uses "evolve"; tests/old data may use these
  "evolve_self",
  "super_evolve_self",

  // Unified gate - replaces 17 legacy *_gate ops
  "gate",

  "repeat_effect",
  "sequence",
  "replicate",
  "with_source",
  "set_deckout_victory",
  "boost_skybound_art_hand",
] as const;
