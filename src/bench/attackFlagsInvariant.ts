// Dev/soak-only: can_attack must match deriveCanAttack on every board follower.
// Never call from production play paths.

import type { GameState, CardInstance } from "../core/types/index.js";
import { getBoard } from "../core/playerHelpers.js";
import {
  deriveCanAttack,
  effectiveAttackEligibility,
} from "../logic/core/combat.js";

export type AttackFlagsFinding = {
  kind: "attack-flags";
  message: string;
};

export type AttackFlagsContext = {
  seed: number;
  gameIndex: number;
  actionIndex: number;
  actionType: string;
};

export function assertAttackFlagsConsistent(
  gameState: GameState,
  ctx: AttackFlagsContext,
): AttackFlagsFinding[] {
  const findings: AttackFlagsFinding[] = [];

  for (const player of ["first", "second"] as const) {
    for (const card of getBoard(gameState, player)) {
      if (!card || card.type !== "Follower") continue;
      const derived = deriveCanAttack(card);
      const effective = effectiveAttackEligibility(card);
      if (effective === derived) continue;

      findings.push({
        kind: "attack-flags",
        message:
          `attack-flags at seed=${ctx.seed} game=${ctx.gameIndex} action=${ctx.actionIndex} ` +
          `(${ctx.actionType}): ${card.name} uid=${card.uid} ` +
          `effective=${effective} deriveCanAttack=${derived} ` +
          `can_attack=${!!(card as any).can_attack} attacks_left=${(card as any).attacks_left ?? "null"} ` +
          `justPlayed=${!!card.justPlayed} hasRush=${!!card.hasRush} hasStorm=${!!card.hasStorm} ` +
          `hasAttacked=${!!card.hasAttacked}`,
      });
    }
  }

  return findings;
}
