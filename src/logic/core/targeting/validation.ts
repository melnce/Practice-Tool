// src/logic/core/targeting/validation.ts
import type { GameState } from "../../../core/types/index.js";
import { getForcedFirstPicks, isFirstTargetPick } from "./forcedPicks.js";

/** Result of a validation check */
export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates if a specific target UID is a legal selection given the current pending state.
 * Checks:
 * 1. Target is in the allowed pool
 * 2. Opponent-side Lloyd / Taunt forced-first-pick when present in the pool
 */
export function validateTargetSelection(
  state: GameState,
  pending: any,
  uid: string,
): ValidationResult {
  // 1. Pool Validation
  const inPool = (pending.pool || []).some((p: any) => p.uid === uid);
  if (!inPool) {
    return {
      ok: false,
      reason: "Clicked card is not in the valid target pool.",
    };
  }

  // 2. Opponent-side Lloyd / Taunt: first pick only, pool-scoped
  const forcedFirst = getForcedFirstPicks(pending);
  if (forcedFirst.length > 0 && isFirstTargetPick(pending)) {
    if (!forcedFirst.includes(uid)) {
      const safeCount =
        typeof pending.selectCount === "number" &&
        Number.isFinite(pending.selectCount) &&
        pending.selectCount > 0
          ? pending.selectCount
          : 1;
      const singlePick = safeCount <= 1;
      if (singlePick) {
        return { ok: false, reason: "Lloyd: only Lloyd can be targeted." };
      }
      return { ok: false, reason: "Lloyd: you must select a Lloyd first." };
    }
  }

  // All checks passed
  return { ok: true };
}
