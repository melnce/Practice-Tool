// src/logic/effects/ops/summon/primitives.ts
// Re-exports of existing summon utilities for use by unified handler.

// Direct summon functions
export {
  summonNamed,
  summonExactCopy,
  summonPrintedCopy,
} from "../summon_ops/direct.js";

// Deck-based summon
export { summonRandomFromDeck } from "../summon_ops/deck.js";

// Reanimate from graveyard
export { handleReanimate } from "../reanimate.js";
