/**
 * Consistency trainer — draw-only Monte Carlo over deck lists.
 * Boundary: reads card/deck data + seeded RNG; never imports game engine state.
 */

export { OPENING_HAND_SIZE, DECK_SIZE, CRAFT_CLASSES } from "./types.js";
export type {
  SimCard,
  Seat,
  Condition,
  MulliganPolicy,
  MulliganPolicyKind,
  ConsistencyConfig,
  ConsistencyResult,
  DrillDeal,
  DrillPath,
  DrillReveal,
  CraftClass,
} from "./types.js";

export {
  combinations,
  hypergeometricPmf,
  hypergeometricAtLeastOne,
  pAtLeastOneInOpening,
} from "./hypergeometric.js";

export { evalCondition, addCardToCounts } from "./conditions.js";
export { mulliganIndices, isKeepKey } from "./mulliganPolicy.js";

export {
  shuffleRangeInPlace,
  fillIdentity,
  applyMulliganInPlace,
  policyMulliganIndices,
  dealOpening,
  resolvePathFromOrder,
  resolveKeepAllPath,
} from "./drawSim.js";

export { runConsistency, keepListPolicy, keepAllPolicy } from "./monteCarlo.js";

export { dealDrillHand, revealDrillPaths } from "./drill.js";

export { resolveDeckToSimCards, uniqueDeckKeys } from "./deckResolve.js";
export type { ResolvedDeck } from "./deckResolve.js";
