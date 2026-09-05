import type { TriggerContext, TriggerSpec } from "./types.js";
import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { CardCondition } from "../conditions/evaluator.js";
import { isDev } from "../../../core/env.js";

import { evaluateCardCondition } from "../conditions/evaluator.js";
import { mergeEnteringKeywordSnapshot } from "../enterKeywords.js";
import { handleSuperEvoGate } from "../../effects/gates/gates.js";
import { opponentOf, getBoard } from "../../../core/playerHelpers.js";
import {
  hasPlayedBaseCostLadder,
  DEFAULT_FULL_COST_LADDER,
} from "../playedBaseCostHistory.js";
/**
 * Allowlist for triggers[].condition and crest.triggers[].condition keys.
 * Union of keys handled in evalCommonConditions and keys on CardCondition
 * delegated to evaluateCardCondition (src/logic/core/conditions/evaluator.ts).
 */
export const TRIGGER_CONDITION_KEYS = new Set([
  // evalCommonConditions — trigger routing / host gates
  "whose_turn",
  "is_ally",
  "is_self",
  "is_fuse_initiator",
  "not_self",
  "field_other_same_base_cost",
  "own_turn",
  "super_evolution_unlocked",
  "played_base_cost_ladder",
  "enemy_follower_count_gte",
  // shared stat gates (host in triggers; subject via evaluator)
  "attack_lte",
  "attack_gte",
  "attack_eq",
  "defense_lte",
  "defense_gte",
  "defense_eq",
  "still_alive",
  // evaluateCardCondition / CardCondition
  "type",
  "class",
  "tribe",
  "exclude_tribe",
  "has_keyword",
  "keywords",
  "exclude_keyword",
  "base_cost_eq",
  "base_cost_gte",
  "base_cost_lte",
  "base_cost_in",
  "cost_in",
  "cost_changed",
  "unevolved",
  "is_super_evolved",
  "damaged",
  "did_not_attack_this_turn",
  "name",
]);

const warnedTriggerConditionKeys = new Set<string>();

function nearestTriggerConditionKey(
  unknown: string,
  allowed: Iterable<string>,
): string {
  const list = [...allowed];
  if (!list.length) return "(none)";
  let best = list[0]!;
  let bestScore = Infinity;
  for (const k of list) {
    let score = 0;
    const a = unknown.toLowerCase();
    const b = k.toLowerCase();
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );
    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + cost,
        );
      }
    }
    score = dp[m]![n]!;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

function assertKnownTriggerConditionKeys(
  cond: Record<string, unknown>,
  cardName: string,
  event?: string,
): void {
  for (const key of Object.keys(cond)) {
    if (TRIGGER_CONDITION_KEYS.has(key)) continue;
    const nearest = nearestTriggerConditionKey(key, TRIGGER_CONDITION_KEYS);
    const eventPart = event ? ` event=${event}` : "";
    const msg = `Unknown trigger condition key "${key}" on card ${cardName}${eventPart} (try "${nearest}")`;
    if (isDev()) {
      throw new Error(msg);
    }
    if (!warnedTriggerConditionKeys.has(key)) {
      console.warn(msg);
      warnedTriggerConditionKeys.add(key);
    }
  }
}

// Helper to normalize "subject" card (entering, played, leaving, etc.)
export function getSubjectCard(context: TriggerContext): CardInstance | null {
  return (
    context.enteringCard ??
    context.leavingCard ??
    context.invokedCard ??
    context.playedCard ??
    context.attacker ??
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
  const rawCond = trigger.condition;
  const event = (context as { _triggerEvent?: string })._triggerEvent;
  if (rawCond && typeof rawCond === "object" && !Array.isArray(rawCond)) {
    assertKnownTriggerConditionKeys(
      rawCond as Record<string, unknown>,
      hostCard.name ?? "unknown",
      event,
    );
  }
  const cond: Record<string, any> =
    rawCond && typeof rawCond === "object" && !Array.isArray(rawCond)
      ? (rawCond as Record<string, any>)
      : {};
  const subjectCard = getSubjectCard(context);

  // =========================================================================
  // TRIGGER-SPECIFIC CONDITIONS (not shareable with targeting)
  // =========================================================================

  // 1. whose_turn — fireTrigger() routing argument is often the affected card's
  // owner slot (restored/drawn/entering player), not the active turn player.
  // Use state.activePlayer for game-turn scope. Turn-boundary events use the
  // focal routing player (always the turn player in real play; see turns.ts).
  const turnPlayer =
    event === "start_of_turn" || event === "end_of_turn"
      ? activePlayer
      : (state.activePlayer ?? activePlayer);
  if (cond.whose_turn === "owner" && turnPlayer !== owner) return false;
  if (cond.whose_turn === "opponent" && turnPlayer === owner) return false;
  if (trigger.your_turn_only && owner !== activePlayer) return false;

  // 2. is_ally — subject owner from enter/leave context, else card.owner (combat)
  if (typeof cond.is_ally === "boolean" && subjectCard) {
    const subjectOwner =
      context.enteringOwner ??
      context.leavingOwner ??
      (subjectCard as { owner?: Player }).owner ??
      null;
    if (subjectOwner) {
      if (cond.is_ally && owner !== subjectOwner) return false;
      if (!cond.is_ally && owner === subjectOwner) return false;
    }
  }

  // 3. is_self
  if (cond.is_self && subjectCard) {
    if (subjectCard.uid !== hostCard.uid) return false;
  }

  // 3b. is_fuse_initiator — host must be the fuse target (initiator)
  if ((cond as any).is_fuse_initiator) {
    const ctxInitiator =
      context.initiator ??
      (context.initiatorUid
        ? ({ uid: context.initiatorUid } as CardInstance)
        : null);
    if (!ctxInitiator || ctxInitiator.uid !== hostCard.uid) return false;
  }

  // 4. not_self
  if (cond.not_self && subjectCard && subjectCard.uid === hostCard.uid)
    return false;

  // 4b. field_other_same_base_cost — another field card shares subject's base cost
  if (cond.field_other_same_base_cost) {
    const played = subjectCard;
    if (!played) return false;
    const base =
      played.base_cost !== undefined
        ? Number(played.base_cost)
        : parseInt(String(played.cost), 10) || 0;
    const field = [
      ...(getBoard(state, "first") || []),
      ...(getBoard(state, "second") || []),
    ];
    const found = field.some((c) => {
      if (!c || c.uid === played.uid) return false;
      const cb =
        c.base_cost !== undefined
          ? Number(c.base_cost)
          : parseInt(String(c.cost), 10) || 0;
      return cb === base;
    });
    if (!found) return false;
  }

  // 5. own_turn
  if (cond.own_turn && owner !== activePlayer) return false;

  // 6. Super Evolution Unlocked (for triggers/gates)
  if (cond.super_evolution_unlocked) {
    if (!handleSuperEvoGate(owner)) return false;
  }

  if ((cond as any).played_base_cost_ladder) {
    const raw = (cond as any).played_base_cost_ladder;
    const ladder = Array.isArray(raw)
      ? raw.map((c: unknown) => Number(c)).filter(Number.isFinite)
      : [...DEFAULT_FULL_COST_LADDER];
    if (!hasPlayedBaseCostLadder(state, owner, ladder)) return false;
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

  if (typeof (cond as any).enemy_follower_count_gte === "number") {
    const need = (cond as any).enemy_follower_count_gte as number;
    const count = getBoard(state, opponentOf(owner)).filter(
      (c) => c?.type === "Follower",
    ).length;
    if (count < need) return false;
  }

  // =========================================================================
  // SUBJECT CARD CONDITIONS (delegate to unified evaluator)
  // =========================================================================
  if (subjectCard) {
    const sharedCond: CardCondition = {};

    // Extract conditions that apply to the subject card
    if (cond.tribe) sharedCond.tribe = cond.tribe;
    if (cond.name) sharedCond.name = cond.name;
    if ((cond as any).class) sharedCond.class = String((cond as any).class);
    if (cond.has_keyword) sharedCond.has_keyword = cond.has_keyword;
    if (cond.keywords) sharedCond.keywords = cond.keywords;
    if (cond.base_cost_eq != null) sharedCond.base_cost_eq = cond.base_cost_eq;
    if (cond.base_cost_gte != null)
      sharedCond.base_cost_gte = cond.base_cost_gte;
    if (cond.base_cost_lte != null)
      sharedCond.base_cost_lte = cond.base_cost_lte;
    if (Array.isArray((cond as any).base_cost_in))
      sharedCond.base_cost_in = (cond as any).base_cost_in;
    if (Array.isArray((cond as any).cost_in))
      sharedCond.cost_in = (cond as any).cost_in;
    if (cond.cost_changed) sharedCond.cost_changed = cond.cost_changed;
    if ((cond as any).is_super_evolved != null)
      sharedCond.is_super_evolved = !!(cond as any).is_super_evolved;
    if ((cond as any).unevolved != null)
      sharedCond.unevolved = !!(cond as any).unevolved;

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
