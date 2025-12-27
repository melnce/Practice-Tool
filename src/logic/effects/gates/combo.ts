// src/logic/effects/gates/combo.ts
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import type { Player } from "../../../core/types/index.js";
import { getPlaysThisTurn, setPlaysThisTurn } from "../../../core/playerHelpers.js";

interface ComboEffect {
  amount?: number;
  count?: number;
  min?: number;
}

export function handleComboAdd(owner: Player, eff: ComboEffect) {
  const add = parseInt(String(eff.amount ?? eff.count ?? 1)) || 0;
  const newPlays = getPlaysThisTurn(state, owner) + add;
  setPlaysThisTurn(state, owner, newPlays);
  logEvent("comboAdd", { owner, add, plays: newPlays });
}

export function handleComboGate(
  eff: ComboEffect & { effects?: any[]; else_effects?: any[] },
  ctx: any,
) {
  const need = Math.max(1, parseInt(String(eff.count || eff.min || 1)));
  const plays = getPlaysThisTurn(state, ctx.owner);

  const conditionMet = plays >= need;
  const next = (conditionMet ? eff.effects : eff.else_effects) || [];

  if (next.length && Array.isArray(ctx.queue)) {
    ctx.queue.unshift(...next);
  }
  logEvent("gateBranch", {
    gate: "combo_gate",
    branch: conditionMet ? "effects" : "else_effects",
    plays,
    need,
  });

  return "done";
}















