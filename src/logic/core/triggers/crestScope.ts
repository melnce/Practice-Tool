import type { Player } from "../../../core/types/index.js";
import type { TriggerEventName, TriggerSpec } from "./types.js";

/**
 * Crest triggers that may fire for a non-owner without `whose_turn: "opponent"`.
 * Empty on purpose — real cards default to owner-only; board/hand bare SOT/EOT
 * uses turnBoundary role logic instead. Add an entry only with a comment explaining
 * why the crest must observe cross-owner.
 */
export const CREST_BROAD_EVENTS = new Set<TriggerEventName>([]);

/**
 * Default crest owner scoping for mid-turn dispatch (`processCandidateTriggers`).
 *
 * - Default: crest fires only for its owner (`activePlayer === owner`).
 * - `whose_turn: "opponent"` opts out (Lilanthim EOT on opponent's turn end).
 * - `leader_restored`: `activePlayer` is the player whose leader was restored.
 */
export function shouldCrestTriggerFire(
  trigger: TriggerSpec,
  owner: Player,
  activePlayer: Player,
  event: TriggerEventName,
): boolean {
  if (CREST_BROAD_EVENTS.has(event)) {
    return true;
  }

  const cond = trigger.condition || {};

  if (cond.whose_turn === "opponent") {
    return activePlayer !== owner;
  }
  if (cond.whose_turn === "owner") {
    return activePlayer === owner;
  }

  if (
    trigger.type === "end_of_turn_own" ||
    trigger.type === "start_of_turn_own"
  ) {
    return activePlayer === owner;
  }

  if (cond.own_turn) {
    return activePlayer === owner;
  }

  if (event === "leader_restored") {
    return activePlayer === owner;
  }

  return activePlayer === owner;
}

/**
 * Turn-boundary role for a crest candidate (reconciles with `ownerRoleForTrigger`).
 * Returns `"active"` | `"reactive"` when the crest should queue, else null.
 */
export function crestTurnBoundaryRole(
  trigger: TriggerSpec,
  owner: Player,
  focalPlayer: Player,
  opponent: Player,
): "active" | "reactive" | null {
  const cond = trigger.condition || {};

  if (cond.whose_turn === "opponent") {
    return owner === opponent ? "reactive" : null;
  }

  if (
    trigger.type === "end_of_turn_own" ||
    trigger.type === "start_of_turn_own" ||
    cond.whose_turn === "owner" ||
    cond.own_turn
  ) {
    return owner === focalPlayer ? "active" : null;
  }

  // Default: crest triggers are owner-scoped (no reactive tier for bare SOT/EOT).
  return owner === focalPlayer ? "active" : null;
}
