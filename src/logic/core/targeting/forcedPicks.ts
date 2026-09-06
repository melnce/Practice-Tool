import type { CardInstance, Player } from "../../../core/types/index.js";
import { getCardSide } from "./filters.js";

export type PendingForcedPickContext = {
  pool?: CardInstance[];
  targetUids?: string[];
  owner?: Player;
};

/** True when no targets have been chosen yet for this prompt. */
export function isFirstTargetPick(pending: PendingForcedPickContext): boolean {
  return !pending.targetUids || pending.targetUids.length === 0;
}

function isOpponentTaunt(card: CardInstance, owner: Player): boolean {
  const side = getCardSide(card);
  if (!side || side === owner) return false;
  if ((card as CardInstance & { hasTaunt?: boolean }).hasTaunt) return true;
  return card.name === "Lloyd";
}

/**
 * Lloyd / Taunt on the selecting player's opponent: when any opponent-side Taunt
 * card remains in the filtered pool, the first pick must be one of them.
 * Uses `hasTaunt`; falls back to name "Lloyd" only when the flag is missing.
 */
export function getForcedFirstPicks(
  pending: PendingForcedPickContext,
): string[] {
  const owner = pending.owner;
  if (!owner) return [];
  const pool = pending.pool ?? [];
  const forced: string[] = [];
  for (const card of pool) {
    if (!card?.uid) continue;
    if (isOpponentTaunt(card, owner)) {
      forced.push(card.uid);
    }
  }
  return forced;
}
