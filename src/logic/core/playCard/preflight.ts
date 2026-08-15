// src/logic/core/playCard/preflight.ts
// Preflight system for card playability checks.
// All "can I play this card?" logic is centralized here.

import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { getPool } from "../targeting.js";
import { isOverflow } from "../../../helpers/overflow.js";
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
// Keep this minimal. Document why it can't be generic.
// ─────────────────────────────────────────────────────────────────────────────

const CARD_PREFLIGHT: Record<
  string,
  (ctx: PreflightContext) => PreflightResult
> = {
  // Radiant Rainbow (10131310):
  // Requires a card in hand with Spellboost keyword. Can't be inferred from
  // effect structure alone because the select target is "ally:hand" with
  // condition "has_keyword: Spellboost", but we need to check BEFORE the spell
  // is removed from hand. Generic pool check would include this card itself.
  "10131310": (ctx) => {
    const hasSpellboostCard = ctx.hand.some(
      (c) =>
        c.uid !== ctx.card.uid && // Exclude the spell being played
        Array.isArray(c.keywords) &&
        c.keywords.some((k: any) => {
          const kwName =
            typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase();
          return kwName === "spellboost";
        }),
    );
    if (!hasSpellboostCard) {
      return {
        ok: false,
        reason: "Radiant Rainbow requires a card in hand with Spellboost.",
      };
    }
    return { ok: true };
  },

  // Stormy Blast (10131320) & Snowman Army (10132320):
  // Both require an enemy follower on the field. This COULD be inferred from
  // the effect's select target ("enemy:follower"), but the generic pool check
  // already handles it. These entries are kept as explicit documentation that
  // these cards were previously hardcoded and now rely on generic checks.
  // Actually, the generic spellNeedsTarget already handles this, so we can remove these.
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

    const handReturnCheck = checkHandReturnRequirement(effectList, hand);
    if (!handReturnCheck.ok) return handReturnCheck;

    const allyOnBoardCheck = checkAllyOnBoardRequirement(effectList, myBoard);
    if (!allyOnBoardCheck.ok) return allyOnBoardCheck;

    const artifactPairCheck = checkArtifactPairRequirement(effectList, hand);
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
 * Recursively check if any effect requires a target (select/choose) that has an empty pool.
 */
function checkEffectsHaveValidTargets(
  effects: Effect[],
  player: Player,
  sourceCard: CardInstance | null,
): PreflightResult {
  // Allow damage effects with fallback_leader (can always target leader)
  const hasFollowerOrLeaderEffect = effects.some(
    (eff: Effect) => eff?.op === "damage" && (eff as any)?.fallback_leader,
  );
  if (hasFollowerOrLeaderEffect) return { ok: true };

  const checkArr = (arr: Effect[]): PreflightResult => {
    for (const eff of arr || []) {
      // Handle gated effects (unified gate format)
      if (eff?.op === "gate" && (eff as any).condition === "overflow") {
        if (isOverflow(player)) {
          const nested = checkArr((eff as any).effects || []);
          if (!nested.ok) return nested;
        }
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
        const pool = getPool(eff.target, player, sourceCard, eff.condition, {
          isTargetedEffect: true,
        });
        if (!pool || pool.length === 0) {
          return {
            ok: false,
            reason: "Spell requires a target but none are available.",
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
): PreflightResult {
  const needsHandReturn = effects.some(
    (e: Effect) =>
      String(e.op).toLowerCase() === "return" &&
      (e as any).destination === "deck" &&
      e.select,
  );
  if (needsHandReturn && hand.length <= 1) {
    return {
      ok: false,
      reason: "Spell needs a different hand card to return.",
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
): PreflightResult {
  const usesArtifactCopyOp = effects.some(
    (e: any) => e && e.op === "select_hand_summon_artifact_copies_eot_destroy",
  );
  if (usesArtifactCopyOp) {
    let artifactCount = 0;
    for (const c of hand) {
      if (!c || c.type !== "Follower") continue;
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
