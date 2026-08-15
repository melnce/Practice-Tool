// src/bench/soakInvariants.ts
// Soak-specific hard invariants (crash-free illegal state detection).

import type { GameState, CardInstance } from "../core/types/index.js";
import { MAX_HAND } from "../core/utils.js";
import { validateGameState } from "../core/stateValidation.js";
import { isGameOver } from "../core/gameOver.js";

const BOARD_MAX = 5;

export type SoakInvariantFinding = {
  kind: "invariant";
  message: string;
};

/**
 * Check soak invariants after an action.
 * Returns findings (empty = ok). Soft warnings from validateGameState are ignored
 * unless they match a soak hard rule.
 */
export function checkSoakInvariants(state: GameState): SoakInvariantFinding[] {
  const findings: SoakInvariantFinding[] = [];

  const deferred = (state as any)._deferredDeath as
    | { lw?: unknown[]; leave?: unknown[] }
    | undefined;
  const deferredDeathPause =
    !!state.pendingTargetEffect ||
    !!(deferred?.lw && deferred.lw.length > 0) ||
    !!(deferred?.leave && deferred.leave.length > 0);

  const base = validateGameState(state);
  for (const fail of base.fails) {
    // cleanup.ts intentionally leaves null board slots while Last Words /
    // leave triggers are deferred across a pending target selection.
    if (
      deferredDeathPause &&
      /Null entry in players\.(first|second)\.board/.test(fail)
    ) {
      continue;
    }
    findings.push({ kind: "invariant", message: fail });
  }

  for (const player of ["first", "second"] as const) {
    const ps = state.players[player];

    // Hand ≤ 9
    if (ps.hand.length > MAX_HAND) {
      findings.push({
        kind: "invariant",
        message: `hand>${MAX_HAND}: ${player}.hand.length=${ps.hand.length}`,
      });
    }

    // Field ≤ 5
    if (ps.board.length > BOARD_MAX) {
      findings.push({
        kind: "invariant",
        message: `field>${BOARD_MAX}: ${player}.board.length=${ps.board.length}`,
      });
    }

    // PP ≥ 0 (effects may raise current PP above maxPP; that is legal)
    if (!Number.isFinite(ps.pp) || ps.pp < 0) {
      findings.push({
        kind: "invariant",
        message: `pp<0: ${player}.pp=${ps.pp}`,
      });
    }

    // HP never above max
    const maxHP = ps.maxHP ?? 20;
    if (Number.isFinite(ps.hp) && ps.hp > maxHP) {
      findings.push({
        kind: "invariant",
        message: `hp>max: ${player}.hp=${ps.hp} maxHP=${maxHP}`,
      });
    }

    // Shadows ≥ 0
    if (!Number.isFinite(ps.shadows) || ps.shadows < 0) {
      findings.push({
        kind: "invariant",
        message: `shadows<0: ${player}.shadows=${ps.shadows}`,
      });
    }

    // Bible §504: internal attack may go negative; damage dealt floors at 0.
    // Do not hard-fail on board attack < 0.
  }

  // Leader ≤0 HP means the game actually ended
  for (const player of ["first", "second"] as const) {
    const hp = state.players[player].hp;
    if (typeof hp === "number" && hp <= 0 && !isGameOver(state)) {
      findings.push({
        kind: "invariant",
        message: `leader≤0 but not gameover: ${player}.hp=${hp} phase=${state.phase}`,
      });
    }
  }

  // No card present in two zones at once (by uid)
  const seen = new Map<string, string>();
  for (const player of ["first", "second"] as const) {
    for (const zone of ["hand", "board", "deck", "graveyard"] as const) {
      const arr = state.players[player][zone] as CardInstance[];
      for (const card of arr) {
        if (!card?.uid) continue;
        const loc = `${player}.${zone}`;
        const prev = seen.get(card.uid);
        if (prev) {
          findings.push({
            kind: "invariant",
            message: `uid in two zones: ${card.uid} (${card.name}) in ${prev} and ${loc}`,
          });
        } else {
          seen.set(card.uid, loc);
        }
      }
    }
  }

  // Stuck pending with empty pool
  const pending = state.pendingTargetEffect;
  if (pending) {
    const poolLen = Array.isArray(pending.poolUids)
      ? pending.poolUids.length
      : Array.isArray(pending.pool)
        ? pending.pool.length
        : 0;
    if (poolLen === 0 && !pending.canTargetLeader) {
      findings.push({
        kind: "invariant",
        message: `pending target with empty pool (op=${pending.eff?.op})`,
      });
    }
  }

  return findings;
}
