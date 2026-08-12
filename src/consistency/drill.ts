import { createRng } from "../core/rng.js";
import {
  dealOpening,
  resolveKeepAllPath,
  resolvePathFromOrder,
} from "./drawSim.js";
import type { DrillDeal, DrillReveal, SimCard } from "./types.js";

/** Deal a fresh 4-card opening hand from `deck` with a seeded shuffle. */
export function dealDrillHand(
  deck: readonly SimCard[],
  seed?: number | string,
): DrillDeal {
  const s = seed ?? Date.now();
  const { seed: resolved, order, opening } = dealOpening(deck, s);
  return {
    seed: resolved,
    deckOrder: order,
    opening,
  };
}

/**
 * Reveal draws given the user's keep set, plus the keep-all alternative
 * on the same initial shuffle (pedagogical comparison).
 *
 * Returned cards are reshuffled into the library before replacements
 * (same rule as the consistency sim / bible Match Flow).
 */
export function revealDrillPaths(
  deal: DrillDeal,
  keepIndices: readonly number[],
  turns: number,
): DrillReveal {
  // Re-create RNG and replay the opening shuffle to restore cursor,
  // then continue for the mulligan reshuffle.
  const rng = createRng(deal.seed);
  const n = deal.deckOrder.length;
  // Replay the same shuffle draws so the mulligan reshuffle continues the stream.
  // dealOpening shuffled identity 0..n-1; we only need to burn the same nextInt calls.
  for (let i = n - 1; i > 0; i--) {
    rng.nextInt(i + 1);
  }

  const your = resolvePathFromOrder(deal.deckOrder, keepIndices, turns, rng);
  const keepAll = resolveKeepAllPath(deal.deckOrder, turns);

  return {
    seed: deal.seed,
    opening: deal.opening,
    keepIndices: [...keepIndices],
    yourPath: {
      label: "Your mulligan",
      hand: your.hand,
      draws: your.draws,
      seen: your.seen,
    },
    keepAllPath: {
      label: "Keep everything",
      hand: keepAll.hand,
      draws: keepAll.draws,
      seen: keepAll.seen,
    },
    turns,
  };
}
