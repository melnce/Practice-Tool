// src/logic/effects/ops/restore/index.ts
// Barrel exports for unified restore module.

// Types
export {
  UnifiedRestoreSpec,
  RestoreTarget,
  RestoreAmountSource,
  RestoreContext,
  normalizeToUnifiedSpec,
} from "./types.js";

// Unified handler
export { handleRestore } from "./unified.js";

// Primitives (for advanced use cases)
export {
  restoreLeaderHP,
  restoreFollowerToFull,
  restoreFollowerByAmount,
  getAlliedFollowers,
  getHandSize,
  getMaxDefense,
} from "./primitives.js";















