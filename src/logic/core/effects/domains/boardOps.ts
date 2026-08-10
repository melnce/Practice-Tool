export const BOARD_OPS = [
  // Unified summon - covers all summon variants via source/mode fields
  // Includes: named, copy, deck, hand (artifact), destroyed/graveyard (reanimate), chain_fill
  "summon",

  // Unified return - replaces return_to_hand, bounce, return_hand_to_deck
  "return",

  // Transform
  "transform",
] as const;
