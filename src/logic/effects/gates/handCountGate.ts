// src/logic/effects/gates/handCountGate.ts
import { state } from "../../../core/gameState.js";
import { Player } from "../../../core/types.js";
import { getHand, opponentOf } from "../../../core/playerHelpers.js";

/**
 * Simple hand-size gate (NOT combo).
 * condition:
 *  - op: "<" | "<=" | ">" | ">=" | "==" | "!="
 *  - value: number to compare against
 *  - owner: "self" | "opponent" (default "self")
 *
 * Returns true if condition matches, else false.
 */
export function handCountGate(owner: Player, eff: any) {
  const cond = eff?.condition || {};
  const side =
    cond.owner === "opponent" ? opponentOf(owner) : owner;

  const n = getHand(state, side)?.length || 0;

  const v = Number(cond.value ?? 0);
  const op = String(cond.op || "").trim();

  switch (op) {
    case "<":
      return n < v;
    case "<=":
      return n <= v;
    case ">":
      return n > v;
    case ">=":
      return n >= v;
    case "==":
      return n === v;
    case "!=":
      return n !== v;
    default:
      return false;
  }
}















