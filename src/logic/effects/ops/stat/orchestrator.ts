/**
 * Stat operation orchestrator.
 * Thin router that delegates to focused helper functions.
 */
import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import type {
  CardInstance,
  Player,
  Effect,
  EffectContext,
} from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
import { filterBuffCandidates } from "./utils.js";
import { withBuffDuration } from "./duration.js";
import {
  applyStatBuff,
  setStatsBuff,
  applyKeywordBuff,
  applyAttacksPerTurnBuff,
  checkPostBuffTriggers,
} from "./core.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import {
  handleStatSelf,
  handleDynamicStatSelf,
} from "../../../effects/self.js";
import {
  validateStatOp,
  isSpecialMode,
  getComboCount,
  detectSpecialTarget,
  applyLeaderStat,
  applyHandBuff,
  applyLastAddedToHandBuff,
  pickRandomFromPool,
} from "./helpers.js";

/**
 * Orchestrates stat operations.
 *
 * Delegates to focused helpers for:
 * - Validation
 * - Special modes (combo_repeat, double)
 * - Special targets (self, leader, hand, last_added_to_hand)
 * - Pool-based targeting with selection
 */
export function handleStatOrchestrator(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: EffectContext = {},
): "done" | "pending" {
  // 1. Validation
  validateStatOp(eff);

  // 2. Handle special modes first
  const mode = (eff as any).mode;

  if (mode === "combo_repeat") {
    return handleComboRepeat(eff, owner, sourceCard, effectsQueue, context);
  }

  if (mode === "double") {
    return handleDoubleStats(eff, owner, sourceCard);
  }

  // 3. Handle special targets
  const specialTarget = detectSpecialTarget(eff);

  if (specialTarget === "self" && sourceCard) {
    // Handle action: "set" separately - it overrides stats rather than adding
    if (eff.action === "set") {
      const setA =
        eff.attack !== undefined ? parseInt(eff.attack as any) || 0 : null;
      const setD =
        eff.defense !== undefined ? parseInt(eff.defense as any) || 0 : null;
      setStatsBuff(sourceCard, setA, setD, owner);
      return "done";
    }
    // Default: action: "give" adds stats
    if (eff.attack_source || eff.defense_source) {
      handleDynamicStatSelf(sourceCard, eff as Effect, owner);
    } else {
      handleStatSelf(sourceCard, eff as Effect);
    }
    return "done";
  }

  if (specialTarget === "ally:leader" || specialTarget === "enemy:leader") {
    const targetOwner: Player =
      specialTarget === "enemy:leader"
        ? owner === "first"
          ? "second"
          : "first"
        : owner;
    const defense = parseInt((eff.defense as any) ?? 0) || 0;
    applyLeaderStat(targetOwner, eff.action, defense);
    return "done";
  }

  if (specialTarget === "hand") {
    applyHandBuff(owner, eff);
    return "done";
  }

  if (specialTarget === "last_added_to_hand") {
    applyLastAddedToHandBuff(owner, eff);
    return "done";
  }

  if (specialTarget === "entering_follower") {
    const entering = context.enteringCard;
    if (entering) {
      applyBuffsToTargets([entering], eff, owner);
      cleanupDead();
    }
    return "done";
  }

  // Handle "selected" or "selected:follower" - use targetUids directly
  const targetStr = String(eff.target || "").toLowerCase();
  if (targetStr === "selected" || targetStr.startsWith("selected:")) {
    if (context?.targetUids?.length) {
      const targets = resolveUids(context.targetUids);
      if (targets.length) {
        applyBuffsToTargets(targets, eff, owner);
        cleanupDead();
        return "done";
      }
    }
    // No targetUids - nothing to buff
    return "done";
  }

  // 4. Standard pool-based path
  return handlePoolBasedBuff(eff, owner, sourceCard, effectsQueue, context);
}

// -----------------------------------------------------------------------------
// Mode Handlers
// -----------------------------------------------------------------------------

function handleComboRepeat(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: EffectContext,
): "done" | "pending" {
  const plays = getComboCount(owner);
  if (plays <= 0) return "done";

  logEvent("comboRepeatBuff", { owner, plays });

  const innerEff = { ...eff, mode: undefined } as StatOp;

  for (let i = 0; i < plays; i++) {
    const res = handleStatOrchestrator(
      innerEff,
      owner,
      sourceCard,
      effectsQueue,
      context,
    );
    if (res === "pending") return res;
  }
  return "done";
}

function handleDoubleStats(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
): "done" {
  const pool = getPool(eff.target || "ally:follower", owner, sourceCard);

  for (const card of pool) {
    const curA = parseInt(String(card.attack)) || 0;
    const curD = parseInt(String(card.defense)) || 0;
    applyStatBuff(card, curA, curD, owner);
    checkPostBuffTriggers(card, curA, curD, owner);
    logEvent("doubleStats", {
      owner,
      target: card.name,
      uid: card.uid,
      attack: curA * 2,
      defense: curD * 2,
    });
  }

  cleanupDead();
  return "done";
}

// -----------------------------------------------------------------------------
// Pool-Based Buff Handler
// -----------------------------------------------------------------------------

function handlePoolBasedBuff(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: EffectContext,
): "done" | "pending" {
  // 1. Get and filter pool
  // BUG FIX: Must pass sourceCard to getPool for correct ally:follower targeting
  const rawPool = getPool(
    eff.target as any,
    owner,
    sourceCard,
    eff.condition,
    context,
  );
  const pool = filterBuffCandidates(rawPool, eff, sourceCard);

  if (!pool.length) return "done";

  // 2. Check for random distribution - auto-select instead of user selection
  const distribution = (eff as any).distribution;
  const isRandomDistribution =
    distribution === "random" ||
    eff.random ||
    String((eff as any).select_mode || "").toLowerCase() === "random";

  // 3. Handle random selection (distribution: "random" bypasses user selection)
  if (isRandomDistribution) {
    const count = Math.max(
      1,
      parseInt((eff as any).select ?? (eff.count as any) ?? 1, 10),
    );
    const chosen = pickRandomFromPool(pool, count);
    applyBuffsToTargets(chosen, eff, owner);
    cleanupDead();
    return "done";
  }

  // 4. Handle user selection (only when no random distribution)
  if ((eff as any).select) {
    setPendingTarget({
      eff,
      owner,
      sourceCard,
      resumeEffects: effectsQueue,
      pool,
      targets: [],
      selectCount: parseInt(
        (eff as any).select_count ?? (eff as any).select ?? 1,
      ),
      context,
    } as any);
    highlightSelectable(pool);
    return "pending";
  }

  // 5. Apply buffs to all in pool
  applyBuffsToTargets(pool, eff, owner);

  // 6. Cleanup
  cleanupDead();
  return "done";
}

// -----------------------------------------------------------------------------
// Buff Application
// -----------------------------------------------------------------------------

function applyBuffsToTargets(
  targets: CardInstance[],
  eff: StatOp,
  owner: Player,
): void {
  const action = eff.action;
  const mode = eff.random ? "random" : "all";

  for (const target of targets) {
    if (action === "set") {
      const setA =
        eff.attack !== undefined ? parseInt(eff.attack as any) || 0 : null;
      const setD =
        eff.defense !== undefined ? parseInt(eff.defense as any) || 0 : null;
      setStatsBuff(target, setA, setD, owner);
    } else if (action === "give") {
      withBuffDuration(target, eff, ({ attack: a, defense: d }) => {
        applyStatBuff(target, a, d, owner);
        logEvent("buff", {
          owner,
          target: target.name,
          uid: target.uid,
          a,
          d,
          mode,
        });
        checkPostBuffTriggers(target, a, d, owner);
      });
    }

    applyKeywordBuff(target, eff, owner);
    applyAttacksPerTurnBuff(target, eff, owner);
  }
}
