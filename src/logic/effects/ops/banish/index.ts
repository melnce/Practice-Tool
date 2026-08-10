// src/logic/effects/ops/banish/index.ts
// Barrel exports for unified banish module.

// Types (type-only exports for tsx compatibility)
export type {
  UnifiedBanishSpec,
  BanishDistribution,
  BanishScope,
  BanishContext,
} from "./types.js";

// Runtime exports from types
export { normalizeToUnifiedSpec, validateUnifiedSpec } from "./types.js";

// Unified handler
export { handleBanish } from "./unified.js";

// Primitives (for advanced use cases)
export {
  banishCard,
  banishSelf,
  banishDeckDuplicates,
  banishAllEnemyCopies,
  getCardOwner,
  getBoard,
} from "./primitives.js";
