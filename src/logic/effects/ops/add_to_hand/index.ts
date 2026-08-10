// src/logic/effects/ops/add_to_hand/index.ts
// Public exports for the add_to_hand operation.

export { handleAddToHand } from "./handler.js";
export { normalizeInstanceEnteringHandAsCopy } from "./normalizeHandCopy.js";
export type {
  normalizeToAddToHandSpec,
  UnifiedAddToHandSpec,
  AddToHandSource,
  AddToHandPlayer,
  CopyTargetBase,
  CopyTargetFilter,
} from "./types.js";
