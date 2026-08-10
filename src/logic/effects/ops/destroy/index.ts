// src/logic/effects/ops/destroy/index.ts
// Barrel exports for unified destroy module.

// Types
export type {
  UnifiedDestroySpec,
  DestroyDistribution,
  DestroyScope,
  DestroyContext,
  normalizeToUnifiedSpec,
  validateUnifiedSpec,
} from "./types.js";

// Unified handler
export { handleDestroy } from "./unified.js";

// Primitives (for advanced use cases)
export {
  destroyTarget,
  canBeDestroyed,
  isSuperProtected,
  isAlly,
  isOwnTurn,
  inferCardOwner,
  fireLastWords,
  getBoard,
  getGraveyard,
} from "./primitives.js";
