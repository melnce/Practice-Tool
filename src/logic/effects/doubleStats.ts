// src/logic/effects/doubleStats.ts
import { state } from "../../core/gameState.js";
import { cleanupDead } from "../core/cleanup.js";
import { logEvent } from "../../core/logger.js";
import type { Player } from "../../core/types/index.js";
import { getBoard } from "../../core/playerHelpers.js";

export function doubleStatsAllies(owner: Player) {
  const board = getBoard(state, owner);
  logEvent("doubleStatsAllies", { owner, count: board.length });
  for (const c of board) {
    if (!c || c.type !== "Follower") continue;

    const a = parseInt(String(c.attack)) || 0;
    const d = parseInt(String(c.defense)) || 0;

    // +current attack/defense == doubling
    c.attack = a + a;
    c.defense = d + d;

    // peak tracking like in buff.js
    c.peak_defense = Math.max(
      c.peak_defense ?? (c.defense as number),
      c.defense as number,
    );
    if (!c.potential_attack)
      c.potential_attack = (c as any).base_attack || c.attack;
    if (!c.potential_defense)
      c.potential_defense = (c as any).base_defense || c.defense;
    c.potential_attack = c.attack as any;
    c.potential_defense = c.defense as any;
  }
  cleanupDead();
  // Render removed - UI layer
}
