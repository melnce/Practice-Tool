// src/logic/effects/ops/restore/index.ts
// Barrel exports for unified restore module.

// Types
export type {
  UnifiedRestoreSpec,
  RestoreTarget,
  RestoreAmountSource,
  RestoreContext,
  normalizeToUnifiedSpec,
} from "./types.js";

// Unified handler (PRIMARY API - use this for all restore operations)
export { handleRestore } from "./unified.js";

// Primitives (for follower-specific restore use cases)
// NOTE: restoreLeaderHP is intentionally NOT exported - use handleRestore instead
export {
  restoreFollowerToFull,
  restoreFollowerByAmount,
  getAlliedFollowers,
  getHandSize,
  getMaxDefense,
} from "./primitives.js";
