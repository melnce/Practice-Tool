export const RESOURCE_OPS = [
  // Unified PP - replaces gain_max_pp, recover_pp
  // action: "gain_max" = increase max PP
  // action: "recover" = restore current PP
  "pp",

  // Unified EP - replaces recover_ep
  // action: "recover" = restore evolution points
  "ep",

  "add_shadows",
  "earth_rite",
  "combo",

  // Draw - deck only, thins deck (stochastic card acquisition)
  "draw",

  // Add to hand - add card to hand
  // source: "named" (default) = create token from database
  // source: "copy" = duplicate existing card
  // Does NOT thin deck
  "add_to_hand",

  // Search - filtered deck search with shuffle
  // Distinct from draw for AI training (intentional vs random acquisition)
  "search",

  // Unified discard - replaces discard_select_hand, discard_all_except_named
  // mode: "select" = select cards to discard (default)
  // mode: "except_named" = discard all except named cards
  "discard",

  // transform_in_hand and transform_random_spell_in_hand are now handled by
  // unified transform op (board.ts) with zone: "hand"

  // Unified deck - replaces replace_deck, replace_deck_with_set_minus, halve_deck_cost, reduce_deck_followers_cost
  // set_cost_last_drawn is now handled by cost op with target: "last_drawn"
  "deck",

  // Unified crest - replaces gain_crest, crest_add_counter, crest_pay_counter
  "crest",
  // Unified fuse - replaces fuse_start, start_fuse_from_card, fuse_finalize_*, start_fortifier_fuse
  "fuse",
] as const;
