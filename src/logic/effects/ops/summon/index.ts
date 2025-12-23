// src/logic/effects/ops/summon/index.ts
// Barrel exports for unified summon module.

// Types
export {
  UnifiedSummonSpec,
  SummonSource,
  CopyScope,
  SummonFilter,
  SummonContext,
  normalizeToUnifiedSpec,
} from "./types.js";

// Unified handler
export { handleSummon } from "./unified.js";

// Primitives (for advanced use cases)
export {
  summonNamed,
  summonExactCopy,
  summonRandomFromDeck,
  handleReanimate,
} from "./primitives.js";
