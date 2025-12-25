// src/logic/effects/ops/misc.ts

import { state } from "../../../core/gameState.js";
import { applyLeaderDamage } from "../leader.js";
import { Player, CardInstance, Effect } from "../../../core/types/index.js";
import { getBoard, opponentOf, addModeBonus } from "../../../core/playerHelpers.js";

// damage_enemy_leader_by_other_allies
export function handleDamageEnemyLeaderByOtherAllies(
  owner: Player,
  sourceCard: CardInstance,
) {
  const myBoard = getBoard(state, owner);
  const x =
    (myBoard || []).filter(
      (c) => c && (!sourceCard || c.uid !== sourceCard.uid),
    ).length | 0;
  const enemy = opponentOf(owner);
  if (x > 0) applyLeaderDamage(enemy, x);
}

// --- Logic Moved from effects.ts ---

export function handleModeBonus(eff: Effect, ctx: any) {
  const owner = ctx.owner;
  const amt = (eff.amount || 1) as number;
  console.log(`[ModeBonus] Adding mode bonus ${amt} to ${owner}`);
  addModeBonus(state, owner, amt);
}

// Legacy handleGainMaxPP was removed - now handled by:
// { op: "pp", action: "gain_max", amount: N }

export function handleSetCostLastDrawn(eff: Effect) {
  const v = parseInt((eff.amount as string) || "0");
  if (!Number.isFinite(v)) return;
  const arr = state.lastDrawnCards || [];
  const target = arr[0]; // most recently drawn
  if (target) {
    if (target.base_cost === undefined) {
      target.base_cost = parseInt(String(target.cost)) || 0;
    }
    target.cost = Math.max(0, v);
  }
}














