import { state } from "../../../../core/gameState.js";
import type {
  CardInstance,
  CardTemplate,
  Player,
} from "../../../../core/types/index.js";
import {
  getBoard,
  getGraveyard,
  addShadows,
} from "../../../../core/playerHelpers.js";
import { isAmulet } from "./utils.js";

const EARTH_SIGIL_TRIBE = "Earth Sigil";

// =============== Earth Sigil identity (data-driven) ===============

export function isEarthSigil(
  card: CardInstance | CardTemplate | null | undefined,
) {
  if (!card || !isAmulet(card as CardInstance)) return false;
  const tribes = Array.isArray(card.tribes) ? card.tribes : [];
  return tribes.some((tribe) => String(tribe) === EARTH_SIGIL_TRIBE);
}

// Return how many earth counters a card *starts* with, based on its keywords
export function startingEarthFromKeywords(cardData: CardTemplate) {
  let n = 0;
  const kws = Array.isArray(cardData?.keywords) ? cardData.keywords : [];
  for (const k of kws) {
    if (
      typeof k !== "string" &&
      k?.name === "Counter" &&
      String(k.key) === "earth"
    ) {
      n += Number(k.count || 0);
    }
  }
  // Safety default: most Earth Sigil amulets start with 1
  return n || 1;
}

// =============== Earth Sigil Merge + De-dup ===============

function earthSigilsOnBoard(board: CardInstance[]) {
  return board.filter(isEarthSigil);
}

// Oldest Earth Sigil on board (board order = entry order).
export function findEarthSigilTarget(board: CardInstance[]) {
  return earthSigilsOnBoard(board)[0] ?? null;
}

// Add one earth counter to the oldest Earth Sigil, if present.
// Returns true if merged into an existing amulet (no new card should be created).
export function tryMergeIntoExistingEarthSigil(board: CardInstance[]) {
  const target = findEarthSigilTarget(board);
  if (!target) return false;

  target.counters = target.counters || {};
  target.counters.earth = (target.counters.earth || 0) + 1;
  return true;
}

function sumCounters(cards: CardInstance[]) {
  const totals: Record<string, number> = {};
  for (const card of cards) {
    const counters = card.counters;
    if (!counters || typeof counters !== "object") continue;
    for (const [key, value] of Object.entries(counters)) {
      totals[key] = (totals[key] || 0) + (Number(value) || 0);
    }
  }
  return totals;
}

function removeEarthSigilsFromBoard(
  board: CardInstance[],
  owner: Player,
  indices: number[],
) {
  const grave = getGraveyard(state, owner);
  indices.sort((a, b) => b - a);
  for (const idx of indices) {
    const removed = board.splice(idx, 1)[0];
    if (removed) {
      grave.push(removed);
      addShadows(state, owner, 1);
    }
  }
}

// When an Earth Sigil amulet enters via play, merge counters from other
// Earth Sigils on the board into the entering card and remove the old ones.
export function mergeEarthSigilOnPlay(entering: CardInstance, owner: Player) {
  if (!isEarthSigil(entering)) return;

  const board = getBoard(state, owner);
  const enteringIndex = board.lastIndexOf(entering);
  if (enteringIndex < 0) return;

  const toRemove: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (i === enteringIndex) continue;
    const card = board[i];
    if (card && isEarthSigil(card)) toRemove.push(i);
  }
  if (!toRemove.length) return;

  const absorbed = sumCounters(
    toRemove.map((idx) => board[idx]!).filter(Boolean),
  );
  entering.counters = entering.counters || {};
  for (const [key, value] of Object.entries(absorbed)) {
    entering.counters[key] = (entering.counters[key] || 0) + value;
  }

  removeEarthSigilsFromBoard(board, owner, toRemove);
}

// Helper function to merge sigils into the oldest survivor
export function mergeSigils(
  board: CardInstance[],
  sigilsToMerge: CardInstance[],
) {
  if (sigilsToMerge.length <= 1) return;

  const survivor = sigilsToMerge[0];
  if (!survivor) return;

  const absorbed = sumCounters(sigilsToMerge);
  survivor.counters = survivor.counters || {};
  for (const [key, value] of Object.entries(absorbed)) {
    survivor.counters[key] = value;
  }

  const toRemove: number[] = [];
  for (let i = 1; i < sigilsToMerge.length; i++) {
    const sigil = sigilsToMerge[i];
    if (!sigil) continue;
    const idx = board.indexOf(sigil);
    if (idx !== -1) toRemove.push(idx);
  }
  if (!toRemove.length) return;

  const owner = survivor.owner ?? "first";
  removeEarthSigilsFromBoard(board, owner, toRemove);
}

// After any summon that could touch Earth Sigils, merge duplicates down to one.
// Oldest sigil on board survives; all earth counters are summed onto it.
export function dedupeEarthSigils(board: CardInstance[]) {
  const sigils = earthSigilsOnBoard(board);
  if (sigils.length <= 1) return;
  mergeSigils(board, sigils);
}
