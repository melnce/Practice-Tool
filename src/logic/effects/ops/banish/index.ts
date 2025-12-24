// src/logic/effects/ops/banish/index.ts
// Barrel exports for unified banish module.

// Types
export {
  UnifiedBanishSpec,
  BanishDistribution,
  BanishScope,
  BanishContext,
  normalizeToUnifiedSpec,
  validateUnifiedSpec,
} from "./types.js";

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















