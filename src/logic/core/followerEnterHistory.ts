/**
 * Match-history log of successful follower enters (route-agnostic).
 *
 * Used for gates / amount_source queries such as:
 * - differently named Artifact followers entered this match
 * - copies of a named follower entered this match
 *
 * Timing: callers must record AFTER Fanfare for play-from-hand (same as Rally)
 * so Fanfare X-from-prior-enters excludes the played card; summons during
 * Fanfare still record via finishFollowerEnter.
 */
import type { CardInstance, Player } from "../../core/types/index.js";
import type { GameState } from "../../core/types/index.js";

export type FollowerEnterRecord = {
  name: string;
  tribes: string[];
  cardId: string;
};

export function recordFollowerEnter(
  state: GameState,
  player: Player,
  card: CardInstance,
): void {
  if (card?.type !== "Follower") return;
  if (!state.players[player].followerEnterHistory) {
    state.players[player].followerEnterHistory = [];
  }
  state.players[player].followerEnterHistory.push({
    name: String(card.name ?? ""),
    tribes: Array.isArray(card.tribes) ? card.tribes.map((t) => String(t)) : [],
    cardId: String(card.id ?? ""),
  });
}

/** Distinct names among enters whose tribes include `tribe` (case-insensitive). */
export function countUniqueTribeEnters(
  state: GameState,
  player: Player,
  tribe: string,
): number {
  const want = String(tribe || "").toLowerCase();
  if (!want) return 0;
  const names = new Set<string>();
  for (const rec of state.players[player].followerEnterHistory) {
    const tribes = rec.tribes.map((t) => t.toLowerCase());
    if (tribes.includes(want) && rec.name) names.add(rec.name);
  }
  return names.size;
}

/** Count of enters matching an exact card name. */
export function countNamedEnters(
  state: GameState,
  player: Player,
  name: string,
): number {
  const want = String(name || "");
  if (!want) return 0;
  return state.players[player].followerEnterHistory.filter(
    (r) => r.name === want,
  ).length;
}
