// src/logic/core/targeting/validation.ts
import type { GameState, Player } from "../../../core/types/index.js";
import { getBoard, opponentOf } from "../../../core/playerHelpers.js";

/** Result of a validation check */
export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates if a specific target UID is a legal selection given the current pending state.
 * Checks:
 * 1. Target is in the allowed pool
 * 2. Lloyd enforcement (Global Taunt rules)
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

  // 2. Lloyd Enforcement (Global Taunt)
  try {
    const me = pending.owner as Player;
    const opp = opponentOf(me);
    const oppBoard = getBoard(state, opp) || [];
    const pool = pending.pool || [];
    // Lloyd forces targeting only when Lloyd itself is a legal target of this
    // ability (official Q&A: Cleric of Crushing vs unevolved vs super-evolved Lloyd).
    const lloyds = pool.filter((c: any) => c?.name === "Lloyd");

    if (lloyds.length > 0) {
      const myBoard = getBoard(state, me) || [];
      const poolHasOpponent = pool.some(
        (c: any) => !myBoard.includes(c) && oppBoard.includes(c),
      );

      if (poolHasOpponent) {
        const lloydUids = new Set(lloyds.map((l: { uid: string }) => l.uid));
        const firstPick =
          !pending.targetUids || pending.targetUids.length === 0;

        const safeCount =
          typeof pending.selectCount === "number" &&
          Number.isFinite(pending.selectCount) &&
          pending.selectCount > 0
            ? pending.selectCount
            : 1;

        const singlePick = safeCount <= 1;
        const clickedIsLloyd = lloydUids.has(uid);

        // Rule:
        // - Single-target: you can ONLY select (any) Lloyd.
        // - Multi-target: your FIRST pick must be (any) Lloyd. After that, anything valid is fine.
        if (singlePick && !clickedIsLloyd) {
          return { ok: false, reason: "Lloyd: only Lloyd can be targeted." };
        }
        if (!singlePick && firstPick && !clickedIsLloyd) {
          return { ok: false, reason: "Lloyd: you must select a Lloyd first." };
        }
      }
    }
  } catch {
    // Fallback if state access fails, but don't block valid moves if logic errs
    // Return valid? Or fail safe? Original code warned and continued (implicit return undefined -> void -> ok?)
    // Original code logged warning and DID NOT return, so it allowed it implicitly.
    // We will return ok: true but log internal error? No, prompt said "No internal logging".
    // We will assume ok if exception occurs to avoid soft-lock.
    return { ok: true };
  }

  // All checks passed
  return { ok: true };
}
