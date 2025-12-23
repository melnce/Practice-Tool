// src/helpers/overflow.ts
import { state } from "../core/gameState.js";

// Overflow is ON when your *max* PP is at least 7 (temp +1 for red does NOT count)
export function isOverflow(owner: "blue" | "red"): boolean {
  // adapt to your state keys; prefer explicit max fields
  const max =
    owner === "blue"
      ? (state.blueMaxPP ?? state.bluePPMax ?? 0)
      : (state.redMaxPP ?? state.redPPMax ?? 0);

  return Number(max) >= 7;
}
