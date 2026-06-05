import type { TriggerContext, TriggerSpec } from "./types.js";
import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { CardCondition } from "../conditions/evaluator.js";

import { evaluateCardCondition } from "../conditions/evaluator.js";
import { mergeEnteringKeywordSnapshot } from "../enterKeywords.js";
import { handleSuperEvoGate } from "../../effects/gates/gates.js";
// Helper to normalize "subject" card (entering, played, leaving, etc.)
export function getSubjectCard(context: TriggerContext): CardInstance | null {
  return (
    context.enteringCard ??
    context.leavingCard ??
    context.invokedCard ??
    context.playedCard ??
    null
  );
}

export function evalCommonConditions(
  trigger: TriggerSpec,
  hostCard: CardInstance,
  owner: Player,
  activePlayer: Player,
  context: TriggerContext,
): boolean {
  const cond = trigger.condition || {};
  const subjectCard = getSubjectCard(context);

  // =========================================================================
  // TRIGGER-SPECIFIC CONDITIONS (not shareable with targeting)
  // =========================================================================

  // 1. whose_turn
  if (cond.whose_turn === "owner" && activePlayer !== owner) return false;
  if (cond.whose_turn === "opponent" && activePlayer === owner) return false;
  if (trigger.your_turn_only && owner !== activePlayer) return false;

  // 2. is_ally - check enteringOwner for enter events, leavingOwner for leave events
  if (typeof cond.is_ally === "boolean" && subjectCard) {
    const subjectOwner = context.enteringOwner ?? context.leavingOwner;
    if (subjectOwner) {
      if (cond.is_ally && owner !== subjectOwner) return false;
      if (!cond.is_ally && owner === subjectOwner) return false;
    }
  }

  // 3. is_self
  if (cond.is_self && subjectCard) {
    if (subjectCard.uid !== hostCard.uid) return false;
  }

  // 4. not_self
  if (cond.not_self && subjectCard && subjectCard.uid === hostCard.uid)
    return false;

  // 5. own_turn
  if (cond.own_turn && owner !== activePlayer) return false;

  // 6. Super Evolution Unlocked (for triggers/gates)
  if (cond.super_evolution_unlocked) {
    if (!handleSuperEvoGate(owner)) return false;
  }

  // =========================================================================
  // HOST CARD STAT GATES (evaluated on the trigger's host card, not subject)
  // =========================================================================
  const atk = parseInt(hostCard.attack as string, 10) || 0;
  const def = parseInt(hostCard.defense as string, 10) || 0;

  if (typeof cond.attack_lte === "number" && atk > cond.attack_lte)
    return false;
  if (typeof cond.attack_gte === "number" && atk < cond.attack_gte)
    return false;
  if (typeof cond.defense_lte === "number" && def > cond.defense_lte)
    return false;
  if (typeof cond.defense_gte === "number" && def < cond.defense_gte)
    return false;
  if (cond.still_alive === true && def <= 0) return false;

  // =========================================================================
  // SUBJECT CARD CONDITIONS (delegate to unified evaluator)
  // =========================================================================
  if (subjectCard) {
    const sharedCond: CardCondition = {};

    // Extract conditions that apply to the subject card
    if (cond.tribe) sharedCond.tribe = cond.tribe;
    if (cond.name) sharedCond.name = cond.name;
    if (cond.has_keyword) sharedCond.has_keyword = cond.has_keyword;
    if (cond.keywords) sharedCond.keywords = cond.keywords;
    if (cond.base_cost_eq != null) sharedCond.base_cost_eq = cond.base_cost_eq;
    if (cond.cost_changed) sharedCond.cost_changed = cond.cost_changed;

    // Apply shared conditions via unified evaluator
    if (Object.keys(sharedCond).length > 0) {
      const subjectForCheck =
        context.enteringKeywordSnapshot &&
        context.enteringCard?.uid === subjectCard.uid
          ? mergeEnteringKeywordSnapshot(
              subjectCard,
              context.enteringKeywordSnapshot,
            )
          : subjectCard;
      if (!evaluateCardCondition(subjectForCheck, sharedCond)) return false;
    }
  }

  return true;
}















