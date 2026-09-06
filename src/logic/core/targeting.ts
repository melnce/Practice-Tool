import { state } from "../../core/gameState.js";
// import { logEvent } from "../../core/logger.js";
import type { CardInstance, Effect, Player } from "../../core/types/index.js";
import { reportSelectFizzled } from "./pendingTarget/index.js";
import { guardLifecycle } from "./targeting/guards.js";
import {
  getBoard,
  getHand,
  getGraveyard,
  getDeck,
  getBanish,
} from "../../core/playerHelpers.js";
import { toUids, toUid } from "../../core/uidResolver.js";

// Refactored Imports
import type { TargetContext } from "./targeting/index.js";

import {
  parseTargetQuery,
  resolveBasePool,
  applyFilters,
} from "./targeting/index.js";
import {
  parseSelectConfig,
  applyPositionFilter,
  pickRandomTargets,
  shouldAutoSelect,
} from "./targeting/selectHelpers.js";
import {
  getForcedFirstPicks,
  isFirstTargetPick,
} from "./targeting/forcedPicks.js";
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
  const pending = state.pendingTargetEffect;
  if (pending) {
    const pickCtx: {
      pool: CardInstance[];
      targetUids?: string[];
      owner?: Player;
    } = {
      pool: cards,
    };
    if (pending.targetUids) pickCtx.targetUids = pending.targetUids;
    if (pending.owner) pickCtx.owner = pending.owner as Player;
    highlightSelectableForPending(pickCtx);
    return;
  }
  cards.forEach((c) => (c.__uiSelectable = true));
  // Render removed - UI layer
}

/** Highlight legal picks for the current pending prompt (Lloyd first-pick aware). */
export function highlightSelectableForPending(pending: {
  pool?: CardInstance[];
  targetUids?: string[];
  owner?: Player;
}) {
  clearSelectableFlags();
  const pool = pending.pool ?? [];
  const selected = new Set(pending.targetUids ?? []);
  const available = pool.filter((c) => c && !selected.has(c.uid));
  let toHighlight = available;
  if (isFirstTargetPick(pending)) {
    const forced = getForcedFirstPicks(pending);
    if (forced.length > 0) {
      const forcedSet = new Set(forced);
      toHighlight = available.filter((c) => forcedSet.has(c.uid));
    }
  }
  toHighlight.forEach((c) => {
    c.__uiSelectable = true;
  });
}

export function clearSelectableFlags() {
  guardLifecycle("clearSelectableFlags");
  const allCards: CardInstance[] = [];
  for (const player of ["first", "second"] as const) {
    allCards.push(
      ...getBoard(state, player),
      ...getHand(state, player),
      ...getGraveyard(state, player),
      ...getDeck(state, player),
      ...getBanish(state, player),
    );
  }
  allCards.forEach((c) => {
    if (c) delete c.__uiSelectable;
  });
  // Ephemeral selection refs may outlive zone membership (graveyard, lastAddedToHand).
  const last = (state as any).__lastSelected as CardInstance | null | undefined;
  if (last) delete last.__uiSelectable;
  const lah = (state as any).lastAddedToHand as CardInstance | null | undefined;
  if (lah) delete lah.__uiSelectable;
}

// -----------------------------------------------------------------------------
// handleSelect (Orchestrator for Selection Effects)
// -----------------------------------------------------------------------------

/**
 * Merge object-valued `filter` into the condition passed to getPool.
 * Card JSON uses `filter:{tribe:"Artifact",type:"Follower"}` on select ops;
 * string filters like "leftmost"/"rightmost" stay in applyPositionFilter.
 */
export function selectPoolCondition(eff: Effect): any {
  const base =
    eff.condition && typeof eff.condition === "object" ? eff.condition : {};
  const filter = eff.filter;
  if (filter && typeof filter === "object" && !Array.isArray(filter)) {
    return { ...base, ...filter };
  }
  return base;
}

function positionFilterFromEffect(eff: Effect): string | undefined {
  const filter = eff.filter;
  if (filter === "leftmost" || filter === "rightmost") return filter;
  return undefined;
}

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
  let pool = getPool(
    eff.target,
    owner,
    sourceCard,
    selectPoolCondition(eff),
    targetedCtx,
  );
  pool = applyPositionFilter(pool, positionFilterFromEffect(eff));

  // 4. Early exit if no valid targets — fizzle clause; outer queue continues.
  if (!pool.length) {
    reportSelectFizzled({
      eff,
      owner,
      sourceCard,
      target: eff.target,
    });
    return;
  }

  // 5. Cap count to available targets
  const effectiveCount = Math.min(requestedCount, pool.length);

  // 6. Auto-selection path (bot or random mode)
  if (shouldAutoSelect(eff.mode)) {
    const forcedFirst = getForcedFirstPicks({ pool, owner });
    const picks = pickRandomTargets(
      pool,
      effectiveCount,
      state.rng,
      forcedFirst,
    );

    clearSelectableFlags();
    // Populate both object refs (deprecated) and UIDs (preferred)
    const selectedCtx = {
      ...targetedCtx,
      targets: picks,
      targetUids: toUids(picks),
    };

    // Execute nested effects with selected targets
    if (Array.isArray(eff.effects) && eff.effects.length) {
      const runner =
        context.runner ||
        ((..._args: any[]) =>
          console.warn("Missing runner for handleSelect auto"));
      try {
        runner([...eff.effects], owner, sourceCard, selectedCtx);
      } finally {
        // Nested sync ops may highlight pools; orchestrator cleanup does not run on this path.
        if (!state.pendingTargetEffect) {
          clearSelectableFlags();
        }
      }
    }

    state.__lastSelected = picks[0] || null;
    return;
  }

  // 7. Manual selection: set up pending state for UI
  // Populate both object refs (deprecated) and UIDs (preferred)
  state.pendingTargetEffect = {
    eff: { op: "nested_effects" as any, effects: eff.effects ?? [] },
    owner,
    sourceCard,
    sourceCardUid: toUid(sourceCard),
    resumeEffects: effectsQueue,
    pool,
    poolUids: toUids(pool),
    targets: [],
    targetUids: [],
    selectCount: effectiveCount,
  };

  highlightSelectable(pool);
  return "pending";
}
