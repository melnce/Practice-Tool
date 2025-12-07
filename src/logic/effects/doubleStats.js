import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { logEvent } from "@core/logger.js";

export function doubleStatsAllies(owner) {
  const board = owner === "blue" ? state.blueBoard : state.redBoard;
  logEvent("doubleStatsAllies", { owner, count: board.length });
  for (const c of board) {
    if (!c || c.type !== "Follower") continue;

    const a = parseInt(c.attack) || 0;
    const d = parseInt(c.defense) || 0;

    // +current attack/defense == doubling
    c.attack = a + a;
    c.defense = d + d;

    // peak tracking like in buff.js
    c.peak_defense = Math.max(c.peak_defense ?? c.defense, c.defense);
    if (!c.potential_attack) c.potential_attack = c.base_attack || c.attack;
    if (!c.potential_defense) c.potential_defense = c.base_defense || c.defense;
    c.potential_attack = c.attack;
    c.potential_defense = c.defense;
  }
  cleanupDead();
  render();
}
