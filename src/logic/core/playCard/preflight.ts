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

    const handSelectCheck = checkMandatoryHandSelections(
      effectList,
      player,
      card,
    );
    if (!handSelectCheck.ok) return handSelectCheck;

    const allyOnBoardCheck = checkAllyOnBoardRequirement(effectList, myBoard);
    if (!allyOnBoardCheck.ok) return allyOnBoardCheck;
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
        if (!pool || pool.length === 0) {
          return {
            ok: false,
            reason: describeEmptyTargetPool(eff),
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

function describeEmptyHandSelectionPool(eff: Effect): string {
  const condition = selectPoolCondition(eff);
  const op = String(eff?.op || "").toLowerCase();

  if (
    op === "summon" &&
    (eff as any).source === "hand" &&
    (eff as any).filter?.type === "Artifact"
  ) {
    const maxCost = (eff as any).max_cost ?? 5;
    return `Spell requires at least ${requiredHandSelectCount(eff)} Artifact followers (cost ≤ ${maxCost}) in hand.`;
  }

  if (condition.has_keyword) {
    const keywords = Array.isArray(condition.has_keyword)
      ? condition.has_keyword
      : [condition.has_keyword];
    const kwLabel = keywords.map((k: string | number) => String(k)).join(", ");
    return `Spell requires a card in hand with ${kwLabel}.`;
  }

  if (condition.tribe || condition.type === "Artifact") {
    const label = condition.tribe || condition.type;
    return `Spell requires a ${label} card in hand but none are available.`;
  }

  if (condition.type) {
    return `Spell requires a ${condition.type} card in hand but none are available.`;
  }

  if (op === "discard") {
    return "Spell needs a different hand card to discard.";
  }

  if (
    op === "return" &&
    String((eff as any).destination || "").toLowerCase() === "deck"
  ) {
    return "Spell needs a different hand card to return.";
  }

  return "Spell requires a hand selection but none are available.";
}

function requiredHandSelectCount(eff: Effect): number {
  const op = String(eff?.op || "").toLowerCase();
  if (op === "discard" && String((eff as any).mode || "select") === "select") {
    const count = Math.max(0, parseInt(String((eff as any).count ?? 1), 10));
    return count > 0 ? count : 1;
  }

  const raw = (eff as any).select ?? (eff as any).select_count;
  if (raw === "all") return 1;

  return parseSelectConfig(eff).count;
}

function isMandatoryHandSelectionOp(eff: Effect): boolean {
  if (!eff || (eff as any).optional) return false;
  if (eff.op === "mode") return false;

  const op = String(eff.op || "").toLowerCase();
  const target = String(eff.target || "");
  const hasHandTarget = target.includes("hand");

  if (op === "discard" && String((eff as any).mode || "select") === "select") {
    return requiredHandSelectCount(eff) > 0;
  }

  if (
    op === "summon" &&
    (eff as any).source === "hand" &&
    ((eff as any).select || (eff as any).select_count)
  ) {
    return true;
  }

  if (
    op === "return" &&
    String((eff as any).destination || "").toLowerCase() === "deck" &&
    (eff as any).select
  ) {
    return true;
  }

  if (op === "cost" && (eff as any).select && hasHandTarget) {
    return true;
  }

  if ((eff.select || eff.select_count || op === "select") && hasHandTarget) {
    return true;
  }

  return false;
}

function getHandSelectionPool(
  eff: Effect,
  player: Player,
  sourceCard: CardInstance | null,
): CardInstance[] {
  const playingCardUid = sourceCard?.uid;
  const poolContext = {
    isTargetedEffect: true,
    ...(playingCardUid ? { playingCardUid } : {}),
  };

  const op = String(eff?.op || "").toLowerCase();

  if (op === "discard" && String((eff as any).mode || "select") === "select") {
    return getPool(
      "ally:hand",
      player,
      sourceCard,
      selectPoolCondition(eff),
      poolContext,
    );
  }

  if (
    op === "summon" &&
    (eff as any).source === "hand" &&
    (eff as any).filter?.type === "Artifact"
  ) {
    const maxCost = Number((eff as any).max_cost ?? 5);
    return getHand(state, player).filter((c) => {
      if (!c || c.uid === playingCardUid || c.type !== "Follower") return false;
      const tribes = Array.isArray(c.tribes)
        ? c.tribes.map((t) => String(t).toLowerCase())
        : [];
      if (!tribes.includes("artifact")) return false;
      return getEffectiveCost(c) <= maxCost;
    });
  }

  if (
    op === "summon" &&
    (eff as any).source === "hand" &&
    ((eff as any).filter?.type === "Follower" ||
      String(eff.target || "").includes("hand:follower"))
  ) {
    return getPool(
      "ally:hand:follower",
      player,
      sourceCard,
      selectPoolCondition(eff),
      poolContext,
    );
  }

  const target = String(eff.target || "");
  if (target.includes("hand")) {
    return getPool(
      target,
      player,
      sourceCard,
      selectPoolCondition(eff),
      poolContext,
    );
  }

  if (
    op === "return" &&
    String((eff as any).destination || "").toLowerCase() === "deck"
  ) {
    return getPool(
      "ally:hand",
      player,
      sourceCard,
      selectPoolCondition(eff),
      poolContext,
    );
  }

  return [];
}

/**
 * Top-level spell effects with mandatory hand selection need enough legal
 * candidates (playing card excluded). Followers/amulets fizzle instead.
 */
function checkMandatoryHandSelections(
  effects: Effect[],
  player: Player,
  sourceCard: CardInstance,
): PreflightResult {
  for (const eff of effects || []) {
    if (!isMandatoryHandSelectionOp(eff)) continue;

    const required = requiredHandSelectCount(eff);
    const pool = getHandSelectionPool(eff, player, sourceCard);
    if (!pool || pool.length < required) {
      return {
        ok: false,
        reason: describeEmptyHandSelectionPool(eff),
      };
    }
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

// PreflightContext is already exported at definition
