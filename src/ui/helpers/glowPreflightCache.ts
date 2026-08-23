import { state } from "../../core/gameState.js";
import type { CardInstance, Player } from "../../core/types/index.js";
import {
  canPlayCard,
  type PreflightResult,
} from "../../logic/core/playCard/preflight.js";

type GlowPreflightCache = {
  key: string;
  results: Map<string, PreflightResult>;
};

let cache: GlowPreflightCache | null = null;

function cacheKey(): string {
  const zoneVersion = (state as { zoneVersion?: number }).zoneVersion ?? 0;
  return [
    zoneVersion,
    state.activePlayer,
    state.players.first.pp,
    state.players.second.pp,
    state.tick ?? 0,
    state.pendingTargetEffect?.sourceCard?.uid ?? "",
  ].join("|");
}

/** Per-render-pass memo for hand glow preflight (builds target pools). */
export function getCachedCanPlay(
  card: CardInstance,
  player: Player,
): PreflightResult {
  const key = cacheKey();
  if (!cache || cache.key !== key) {
    cache = { key, results: new Map() };
  }

  const hit = cache.results.get(card.uid);
  if (hit) return hit;

  const result = canPlayCard(card, player);
  cache.results.set(card.uid, result);
  return result;
}

/** Test hook — reset memo between scenarios. */
export function resetGlowPreflightCache(): void {
  cache = null;
}
