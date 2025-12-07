import { state } from "@core/gameState.js";


/**
 * Simple hand-size gate (NOT combo).
 * condition:
 *  - op: "<" | "<=" | ">" | ">=" | "==" | "!="
 *  - value: number to compare against
 *  - owner: "self" | "opponent" (default "self")
 *
 * Returns true if condition matches, else false.
 */
export function handCountGate(owner, eff) {
  const cond = eff?.condition || {};
  const side = (cond.owner === "opponent")
    ? (owner === "blue" ? "red" : "blue")
    : owner;

  const n = (side === "blue" ? state.blueHand : state.redHand)?.length || 0;

  const v = Number(cond.value ?? 0);
  const op = String(cond.op || "").trim();

  switch (op) {
    case "<":  return n <  v;
    case "<=": return n <= v;
    case ">":  return n >  v;
    case ">=": return n >= v;
    case "==": return n === v;
    case "!=": return n !== v;
    default:   return false;
  }
}
