// src/logic/core/playCard/preflight.ts
// Preflight system for card playability checks.
// All "can I play this card?" logic is centralized here.

import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { getPool, selectPoolCondition } from "../targeting.js";
import { parseSelectConfig } from "../targeting/selectHelpers.js";
import { isOverflow } from "../../../helpers/overflow.js";
import {
  peekCondition,
  getConditionEvaluator,
} from "../../effects/gates/conditions.js";
import type { UnifiedGateSpec } from "../../effects/gates/types.js";
import { resolvePlayCost, getEffectiveCost } from "./cost.js";
import {
  getPP,
  getHand,
  getBoard,
  opponentOf,
} from "../../../core/playerHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PreflightResult = { ok: true } | { ok: false; reason: string };

export interface PreflightContext {
  card: CardInstance;
  player: Player;
  hand: CardInstance[];
  myBoard: CardInstance[];
  enemyBoard: CardInstance[];
  availablePP: number;
  effectList: Effect[]; // The effects that will execute (base or enhanced)
}

// ─────────────────────────────────────────────────────────────────────────────
// ID-based Bespoke Registry
// Cards that require truly bespoke preflight logic keyed by card ID.
// Keep this minimal — only add an entry when a play requirement cannot be
// inferred from the card's effect ops (select targets, conditions, etc.).
// The generic path treats the card being played as in no zone and evaluates
// target pools via getPool with the op's condition.
// ─────────────────────────────────────────────────────────────────────────────

const CARD_PREFLIGHT: Record<
  string,
  (ctx: PreflightContext) => PreflightResult
> = {
  // Empty — all current cards are covered by generic effect-driven checks.
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export function canPlayCard(
  card: CardInstance,
  player: Player,
): PreflightResult {
  // Build context
  const availablePP = getPP(state, player);
  const hand = getHand(state, player);
  const myBoard = getBoard(state, player);
  const enemyBoard = getBoard(state, opponentOf(player));

  // Resolve play form (Enhance / normal / Accelerate / Crystallize)
  const plan = resolvePlayCost(card, availablePP);
  const effectList = getEffectList(card, plan);

  const ctx: PreflightContext = {
    card,
    player,
    hand,
    myBoard,
    enemyBoard,
    availablePP,
    effectList,
  };

  // 0) Can't-play flag
  if (card.cant_play) {
    return { ok: false, reason: `${card.name} cannot be played.` };
  }

  // 1) ID-based bespoke check (if exists)
  const preflight = card.id ? CARD_PREFLIGHT[card.id] : undefined;
  if (preflight) {
    const result = preflight(ctx);
    if (!result.ok) return result;
  }

  // 2) Generic effect-driven checks for spell-like plays
  //    (printed spells, or Accelerate which resolves as a spell)
  const playsAsSpell = card.type === "Spell" || plan.mode === "accelerate";
  if (playsAsSpell) {
    const targetCheck = checkEffectsHaveValidTargets(effectList, player, card);
    if (!targetCheck.ok) return targetCheck;

    const handReturnCheck = checkHandReturnRequirement(effectList, hand, card);
    if (!handReturnCheck.ok) return handReturnCheck;

    const allyOnBoardCheck = checkAllyOnBoardRequirement(effectList, myBoard);
    if (!allyOnBoardCheck.ok) return allyOnBoardCheck;

    const artifactPairCheck = checkArtifactPairRequirement(
      effectList,
      hand,
      card,
    );
    if (!artifactPairCheck.ok) return artifactPairCheck;
  }

  // 3) Board space for permanents (Accelerate is a spell — no slot needed)
  const playsAsPermanent =
    plan.mode === "accelerate"
      ? false
      : plan.mode === "crystallize"
        ? true
        : card.type === "Follower" || card.type === "Amulet";
  if (playsAsPermanent && myBoard.length >= 5) {
    return { ok: false, reason: "Board is full." };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Effect-Driven Checks
// ─────────────────────────────────────────────────────────────────────────────

function getEffectList(
  card: CardInstance,
  plan: {
    mode: string;
    enhanceTiers: { effects: Effect[] }[];
    alternate: { effects: Effect[] } | null;
  },
): Effect[] {
  if (
    plan.mode === "accelerate" &&
    plan.alternate &&
    Array.isArray(plan.alternate.effects)
  ) {
    return plan.alternate.effects;
  }
  if (plan.enhanceTiers.length) {
    return plan.enhanceTiers.flatMap((tier) =>
      Array.isArray(tier.effects) ? tier.effects : [],
    );
  }
  const baseList = (
    Array.isArray(card.spell) && card.spell.length ? card.spell : []
  ).concat(Array.isArray(card.fanfare) ? card.fanfare : []);
  return baseList;
}

/**
 * Human-readable reason when a mandatory select has no legal targets.
 * Derived from the failing clause so the UI can explain why play is blocked.
 */
function describeEmptyTargetPool(eff: Effect): string {
  const condition = selectPoolCondition(eff);
  const target = String(eff.target || "").toLowerCase();

  if (condition.has_keyword) {
    const keywords = Array.isArray(condition.has_keyword)
      ? condition.has_keyword
      : [condition.has_keyword];
    const kwLabel = keywords.map((k: string | number) => String(k)).join(", ");
    if (target.includes("hand")) {
      return `Spell requires a card in hand with ${kwLabel}.`;
    }
    return `Spell requires a target with ${kwLabel}.`;
  }

  if (condition.tribe) {
    const tribe = String(condition.tribe);
    if (target.includes("follower") || condition.type === "Follower") {
      return `Spell requires a ${tribe} follower target but none are available.`;
    }
    return `Spell requires a target with tribe ${tribe} but none are available.`;
  }

  return "Spell requires a target but none are available.";
}

function describeInsufficientSelectPool(eff: Effect, required: number): string {
  const condition = selectPoolCondition(eff);
  const target = String(eff.target || "").toLowerCase();

  if (target.includes("hand")) {
    return `Spell needs ${required} selectable hand cards.`;
  }

  if (condition.type === "Follower" || target.includes("follower")) {
    const side = target.includes("enemy") ? "enemy" : "allied";
    return `Spell needs ${required} selectable ${side} followers.`;
  }

  if (condition.has_keyword) {
    const keywords = Array.isArray(condition.has_keyword)
      ? condition.has_keyword
      : [condition.has_keyword];
    const kwLabel = keywords.map((k: string | number) => String(k)).join(", ");
    return `Spell needs ${required} selectable targets with ${kwLabel}.`;
  }

  if (condition.tribe) {
    return `Spell needs ${required} selectable targets with tribe ${String(condition.tribe)}.`;
  }

  return `Spell needs ${required} selectable targets.`;
}

/**
 * Recursively check if any effect requires a target (select/choose) that has an empty pool.
 * The card being played is excluded from every pool — it is in no zone during evaluation.
 */
function checkEffectsHaveValidTargets(
  effects: Effect[],
  player: Player,
  sourceCard: CardInstance | null,
): PreflightResult {
  const playingCardUid = sourceCard?.uid;

  // Allow damage effects that can target the leader when no followers are in pool
  const hasFollowerOrLeaderEffect = effects.some(
    (eff: Effect) =>
      eff?.op === "damage" &&
      Boolean((eff as any).fallback_leader ?? (eff as any).can_target_leader),
  );
  if (hasFollowerOrLeaderEffect) return { ok: true };

  const checkArr = (arr: Effect[]): PreflightResult => {
    for (const eff of arr || []) {
      // Handle gated effects (unified gate format)
      if (eff?.op === "gate") {
        const gateSpec = eff as Effect & UnifiedGateSpec;
        if (gateSpec.condition === "overflow") {
          if (isOverflow(player)) {
            const nested = checkArr(gateSpec.effects || []);
            if (!nested.ok) return nested;
          }
          continue;
        }

        // Evaluate branch that will run when the condition is known at preflight.
        // Unknown conditions are skipped — a false "unplayable" is worse than a fizzle.
        // INVARIANT: preflight is read-only — use peekCondition, never evaluateCondition.
        const evaluator = getConditionEvaluator(
          String(gateSpec.condition ?? ""),
        );
        if (!evaluator) {
          continue;
        }
        const passed = peekCondition(gateSpec, player, sourceCard);
        const branch = passed
          ? gateSpec.effects || []
          : gateSpec.else_effects || [];
        const nested = checkArr(branch);
        if (!nested.ok) return nested;
        continue;
      }

      // Skip summon ops that handle their own UI (select from hand)
      if (eff?.op === "summon" && eff?.source === "hand") continue;

      // Check select operations.
      // Mode ops use `select` / `select_count` as the *mode pick count*, not a
      // targeting requirement (e.g. Screaming and Loathing 10353310 select:2).
      // Treating mode.select as a target select yields getPool(undefined) → empty
      // and falsely bricks the card.
      if (eff?.op === "mode") {
        // Still recurse into nested option effects below via eff.effects if any.
        // Mode options live under `options`; targeting inside them is validated
        // when that mode is chosen, not at play preflight.
      } else if (eff?.select || eff?.op === "select") {
        const pool = getPool(
          eff.target,
          player,
          sourceCard,
          selectPoolCondition(eff),
          {
            isTargetedEffect: true,
            ...(playingCardUid ? { playingCardUid } : {}),
          },
        );
        const requiredCount = parseSelectConfig(eff).count;
        if (!pool || pool.length === 0) {
          return {
            ok: false,
            reason: describeEmptyTargetPool(eff),
          };
        }
        if (pool.length < requiredCount) {
          return {
            ok: false,
            reason: describeInsufficientSelectPool(eff, requiredCount),
          };
        }
      }

      // Recurse into nested effects
      if (Array.isArray(eff?.effects) && eff.effects.length) {
        const nested = checkArr(eff.effects);
        if (!nested.ok) return nested;
      }
    }
    return { ok: true };
  };

  return checkArr(effects);
}

/**
 * Check if effects require returning a hand card (need at least 2 cards in hand).
 */
function checkHandReturnRequirement(
  effects: Effect[],
  hand: CardInstance[],
  playingCard: CardInstance,
): PreflightResult {
  let requiredOtherCards = 0;
  for (const e of effects) {
    if (
      String(e.op).toLowerCase() === "return" &&
      (e as any).destination === "deck" &&
      e.select
    ) {
      requiredOtherCards = Math.max(
        requiredOtherCards,
        parseSelectConfig(e).count,
      );
    }
  }
  const otherHandCards = hand.filter((c) => c?.uid !== playingCard.uid);
  if (requiredOtherCards > 0 && otherHandCards.length < requiredOtherCards) {
    return {
      ok: false,
      reason:
        requiredOtherCards >= 2
          ? `Spell needs ${requiredOtherCards} other hand cards to return.`
          : "Spell needs a different hand card to return.",
    };
  }
  return { ok: true };
}

/**
 * Check if effects require an ally on board (return to hand targeting ally).
 */
function checkAllyOnBoardRequirement(
  effects: Effect[],
  myBoard: CardInstance[],
): PreflightResult {
  const needsAlly = effects.some(
    (eff: Effect) =>
      eff &&
      eff.select &&
      String(eff.op).toLowerCase() === "return" &&
      (eff as any).destination === "hand" &&
      String(eff.target || "")
        .toLowerCase()
        .startsWith("ally"),
  );
  if (needsAlly && myBoard.length === 0) {
    return { ok: false, reason: "Spell requires an ally on board." };
  }
  return { ok: true };
}

/**
 * Check artifact pair requirement (need at least 2 artifact followers in hand).
 */
function checkArtifactPairRequirement(
  effects: Effect[],
  hand: CardInstance[],
  playingCard: CardInstance,
): PreflightResult {
  const usesArtifactCopyOp = effects.some(
    (e: any) => e && e.op === "select_hand_summon_artifact_copies_eot_destroy",
  );
  if (usesArtifactCopyOp) {
    let artifactCount = 0;
    for (const c of hand) {
      if (!c || c.uid === playingCard.uid || c.type !== "Follower") continue;
      const tribes = Array.isArray(c.tribes)
        ? c.tribes.map((t) => String(t).toLowerCase())
        : [];
      if (!tribes.includes("artifact")) continue;
      if (getEffectiveCost(c) <= 5) artifactCount++;
    }
    if (artifactCount < 2) {
      return {
        ok: false,
        reason:
          "Spell requires at least 2 Artifact followers (cost ≤ 5) in hand.",
      };
    }
  }
  return { ok: true };
}

// PreflightContext is already exported at definition
