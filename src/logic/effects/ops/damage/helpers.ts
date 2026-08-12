// src/logic/effects/ops/damage/helpers.ts
// Damage handler helper functions - separated for modularity

import { state } from "../../../../core/gameState.js";
import { highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { applyLeaderDamage } from "../../leader.js";
import { dealDamage } from "../../../core/barrier.js";
import type {
  Effect,
  CardInstance,
  Player,
} from "../../../../core/types/index.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import { getBoard, getHP, getHand } from "../../../../core/playerHelpers.js";
import { evaluateCardCondition } from "../../../core/conditions/evaluator.js";
import {
  countUniqueTribeEnters,
  countNamedEnters,
} from "../../../core/followerEnterHistory.js";

import type { UnifiedDamageSpec, DamageContext } from "./types.js";
import { resolveAmountWithOverflow } from "./calculator.js";
import { resolveDamageAmountExtended } from "./primitives.js";

// =============================================================================
// AMOUNT RESOLUTION
// =============================================================================

/**
 * Resolves the damage amount based on spec and context.
 * Handles various amount_source values like hand_size, golem_count, etc.
 */
export function resolveAmount(
  spec: UnifiedDamageSpec,
  ctx: DamageContext,
): number {
  const source = spec.amount_source as string;

  // Handle context.* pattern - read from ctx.variables
  if (source && source.startsWith("context.")) {
    const varName = source.substring(8); // Remove "context." prefix
    const value = (ctx as any).variables?.[varName];
    if (value === undefined) {
      console.warn(
        `[Context] Variable '${varName}' not found, defaulting to 0`,
      );
      return 0;
    }
    return typeof value === "number" ? value : Number(value) || 0;
  }

  switch (spec.amount_source) {
    case "hand_size":
      return resolveDamageAmountExtended({} as Effect, ctx, "hand_size");
    case "selected_defense":
      return resolveDamageAmountExtended({} as Effect, ctx, "selected_defense");
    case "golem_count":
      return resolveDamageAmountExtended({} as Effect, ctx, "golem_count");
    case "crest_count":
      return resolveDamageAmountExtended({} as Effect, ctx, "crest_count");
    case "other_allies":
      return resolveDamageAmountExtended({} as Effect, ctx, "other_allies");
    case "followers_on_field":
      return [...getBoard(state, "first"), ...getBoard(state, "second")].filter(
        (card) => card?.type === "Follower",
      ).length;
    case "ally_matches": {
      const filter = {
        type: "Follower",
        ...(spec.condition && typeof spec.condition === "object"
          ? spec.condition
          : {}),
        ...(spec.filter && typeof spec.filter === "object" ? spec.filter : {}),
      };
      const board = getBoard(state, ctx.owner) || [];
      return board.filter((c) => evaluateCardCondition(c, filter)).length;
    }
    case "unique_tribe_enters": {
      const tribe =
        (spec as any).tribe ??
        (spec.filter as any)?.tribe ??
        (spec.condition as any)?.tribe ??
        "Artifact";
      return countUniqueTribeEnters(state, ctx.owner, String(tribe));
    }
    case "named_enter_count": {
      const name =
        (spec as any).name ??
        (spec.filter as any)?.name ??
        (spec.condition as any)?.name ??
        ctx.sourceCard?.name;
      return countNamedEnters(state, ctx.owner, String(name ?? ""));
    }
    case "amulets_in_hand": {
      const hand = getHand(state, ctx.owner) || [];
      return hand.filter((c) => String(c.type) === "Amulet").length;
    }
    case "fixed":
    default:
      // Use amount field, with overflow support
      // Include add_amount for effects like Stormy Blast that add to base damage
      return resolveAmountWithOverflow(
        { amount: spec.amount, add_amount: spec.add_amount } as any,
        ctx.owner,
        {
          sourceCard: ctx.sourceCard,
          selectedCard: ctx.selectedCard,
        },
      );
  }
}

// =============================================================================
// SELECTION HANDLING
// =============================================================================

/**
 * Sets up pending target selection for damage effects that require user choice.
 */
export function handleSelection(
  eff: Effect,
  spec: UnifiedDamageSpec,
  pool: CardInstance[],
  amount: number,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
): "pending" | "done" {
  const selectCount = Math.min(spec.select || 1, pool.length);

  if (selectCount === 0 && !spec.fallback_leader) {
    return "done";
  }

  setPendingTarget({
    eff: { ...eff, amount } as any,
    owner,
    sourceCard,
    targets: [],
    selectCount: selectCount || 1,
    pool,
    resumeEffects: effectsQueue,
    canTargetLeader: spec.fallback_leader ?? false,
  });

  logEvent("damage_select", {
    owner,
    pool: pool.length,
    select: selectCount,
    amount,
  });

  if (pool.length) {
    highlightSelectable(pool);
  }

  return "pending";
}

// =============================================================================
// DISTRIBUTION HANDLERS
// =============================================================================

/**
 * Handles damage distribution based on stat values (e.g., highest defense).
 */
export function handleByStatDamage(
  spec: UnifiedDamageSpec,
  amount: number,
  owner: Player,
): void {
  const stat = spec.stat || "defense";
  const targetType = spec.target || "follower";
  const useLowest = spec.rank === "lowest";
  const chooseTiedTarget = spec.pick === "random" || spec.select === 1;

  if (
    targetType === "follower" ||
    targetType === "enemy:follower" ||
    targetType === "ally:follower" ||
    targetType === "all:follower"
  ) {
    const opponent = owner === "first" ? "second" : "first";
    const boards =
      targetType === "enemy:follower"
        ? [getBoard(state, opponent)]
        : targetType === "ally:follower"
          ? [getBoard(state, owner)]
          : [getBoard(state, "first"), getBoard(state, "second")];
    const allFollowers = boards
      .flat()
      .filter((c) => c && c.type === "Follower");

    if (!allFollowers.length) return;

    const getValue = (c: CardInstance) =>
      parseInt(
        String(stat === "defense" || stat === "hp" ? c.defense : c.attack),
        10,
      ) || 0;
    const extreme = (useLowest ? Math.min : Math.max)(
      ...allFollowers.map(getValue),
    );
    let targets = allFollowers.filter((c) => getValue(c) === extreme);
    if (chooseTiedTarget && targets.length > 1) {
      targets = [targets[state.rng.nextInt(targets.length)]!];
    }

    for (const t of targets) {
      dealDamage(t, amount);
    }
    cleanupDead();
    return;
  }

  if (
    targetType === "leader" ||
    targetType === "ally:leader" ||
    targetType === "enemy:leader" ||
    targetType === "all:leader"
  ) {
    // Leader "defense" / "hp" compare **current** defense (getHP), not maxHP.
    // Raging Lightning (10341310) is the only by_stat→leader card; bible Owner
    // ruling requires current defense. If a future effect needs max defense,
    // add an explicit opt-in (e.g. stat: "max_defense") rather than overloading
    // "defense".
    let leaders: Array<{
      owner: import("../../../../core/types/index.js").Player;
      value: number;
    }> = [
      { owner: "first", value: getHP(state, "first") },
      { owner: "second", value: getHP(state, "second") },
    ];
    if (targetType === "enemy:leader") {
      leaders = leaders.filter((leader) => leader.owner !== owner);
    } else if (targetType === "ally:leader") {
      leaders = leaders.filter((leader) => leader.owner === owner);
    }
    const extreme = (useLowest ? Math.min : Math.max)(
      ...leaders.map((leader) => leader.value),
    );
    let targets = leaders.filter((leader) => leader.value === extreme);
    if (chooseTiedTarget && targets.length > 1) {
      targets = [targets[state.rng.nextInt(targets.length)]!];
    }
    for (const leader of targets) {
      applyLeaderDamage(leader.owner, amount);
    }
  }
}
