import { state } from "../../core/gameState.js";
// import { logEvent } from "../../core/logger.js";
import { CardInstance, Effect, Player } from "../../core/types.js";
import { guardLifecycle } from "./targeting/guards.js";
import { getBoard, getHand, getGraveyard } from "../../core/playerHelpers.js";

// Refactored Imports
import {
  parseTargetQuery,
  resolveBasePool,
  applyFilters,
  TargetContext,
} from "./targeting/index.js";

// Re-export Context for consumers
export type { TargetContext };

/**
 * Orchestrates target selection.
 * Refactored pipeline: Parse -> Resolve -> Filter
 */
export function getPool(
  targetSpec: string,
  owner: Player,
  sourceCard: CardInstance | null = null,
  condition: any = {},
  context: TargetContext = {},
): CardInstance[] {
  // 1. Parse string spec into structured Query
  // LEGACY: Preserves "ally:hand" alias and default "ally" side fallback
  const env = { owner, sourceCard, context };
  const query = parseTargetQuery(targetSpec, condition);

  // 2. Resolve base candidate pool (Context Resolution)
  // LEGACY: Preserves "last_summoned" and "entering_follower" contexts
  const basePool = resolveBasePool(query, env);

  // 3. Apply Filters and Conditions
  // LEGACY: Preserves filter order and Ambush/Aura handling
  const finalPool = applyFilters(basePool, query, env);

  return finalPool;
}


export function highlightSelectable(cards: CardInstance[]) {
  cards.forEach((c) => (c.__uiSelectable = true));
  // Render removed - UI layer
}

export function clearSelectableFlags() {
  guardLifecycle("clearSelectableFlags");
  // Use playerHelpers for player-agnostic zone access
  const allCards = [
    ...getBoard(state, "first"),
    ...getBoard(state, "second"),
    ...getHand(state, "first"),
    ...getHand(state, "second"),
    ...getGraveyard(state, "first"),
    ...getGraveyard(state, "second"),
  ];
  allCards.forEach((c) => {
    if (c) delete c.__uiSelectable;
  });
}

// -----------------------------------------------------------------------------
// handleSelect (Orchestrator for Selection Effects)
// -----------------------------------------------------------------------------

import {
  parseSelectConfig,
  applyPositionFilter,
  pickRandomTargets,
  shouldAutoSelect,
} from "./targeting/selectHelpers.js";

/**
 * Orchestrates target selection for effects.
 *
 * This is a thin orchestrator that delegates to focused helper functions:
 * - parseSelectConfig: Extract count from effect
 * - applyPositionFilter: Handle leftmost/rightmost
 * - pickRandomTargets: Bot/random mode selection
 *
 * @returns "pending" if waiting for UI selection, void if resolved
 */
export function handleSelect(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: TargetContext = {},
): "pending" | void {
  // 1. Parse configuration
  const { count: requestedCount } = parseSelectConfig(eff);

  // 2. Build targeted context
  const targetedCtx = {
    ...context,
    isTargetedEffect: true,
    selectCount: requestedCount,
  };

  // 3. Get and filter pool
  let pool = getPool(eff.target, owner, sourceCard, eff.condition, targetedCtx);
  pool = applyPositionFilter(pool, eff.filter);

  // 4. Early exit if no valid targets
  if (!pool.length) return;

  // 5. Cap count to available targets
  const effectiveCount = Math.min(requestedCount, pool.length);

  // 6. Auto-selection path (bot or random mode)
  if (shouldAutoSelect(eff.mode)) {
    const picks = pickRandomTargets(pool, effectiveCount, state.rng);

    clearSelectableFlags();
    const selectedCtx = { ...targetedCtx, targets: picks };

    // Execute nested effects with selected targets
    if (Array.isArray(eff.effects) && eff.effects.length) {
      const runner =
        context.runner ||
        ((..._args: any[]) => console.warn("Missing runner for handleSelect auto"));
      runner([...eff.effects], owner, sourceCard, selectedCtx);
    }

    state.__lastSelected = picks[0] || null;
    return;
  }

  // 7. Manual selection: set up pending state for UI
  state.pendingTargetEffect = {
    eff: { op: "nested_effects" as any, effects: eff.effects ?? [] },
    owner,
    sourceCard,
    resumeEffects: effectsQueue,
    pool,
    targets: [],
    selectCount: effectiveCount,
  };

  highlightSelectable(pool);
  return "pending";
}
















