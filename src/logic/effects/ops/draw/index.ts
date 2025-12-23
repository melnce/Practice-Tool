// src/logic/effects/ops/draw/index.ts
// Barrel exports for unified draw module.

// Types
export {
  UnifiedDrawSpec,
  DrawMode,
  DrawPlayer,
  DrawCount,
  DrawContext,
  normalizeToUnifiedSpec,
  validateUnifiedSpec,
} from "./types.js";

// Unified handler
export { handleDraw } from "./unified.js";

// Primitives (for advanced use cases)
export {
  getDeck,
  getHand,
  removeFromDeck,
  moveToHand,
  applyKeywords,
  trackLastDrawn,
  getComboCount,
} from "./primitives.js";
