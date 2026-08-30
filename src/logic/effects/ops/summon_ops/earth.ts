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
import { getGlobalCardIndex } from "../../../../data/cardIndex.js";
import { isAmulet } from "./utils.js";

const EARTH_SIGIL_TRIBE = "Earth Sigil";

// Lower rank = higher merge priority (collectible outranks token).
const RANK_COLLECTIBLE_EARTH_SIGIL = 0;
const RANK_TOKEN_EARTH_SIGIL = 1;

// =============== Earth Sigil identity (data-driven) ===============

export function isEarthSigil(
  card: CardInstance | CardTemplate | null | undefined,
) {
  if (!card || !isAmulet(card as CardInstance)) return false;
  const tribes = Array.isArray(card.tribes) ? card.tribes : [];
  return tribes.some((tribe) => String(tribe) === EARTH_SIGIL_TRIBE);
}

/** Token-registry Earth Sigil (e.g. Magic Sediment) vs collectible pool (e.g. Witch's New Brew). */
export function isTokenEarthSigil(
  card: CardInstance | CardTemplate | null | undefined,
) {
  if (!card) return false;

  const index = getGlobalCardIndex();
  const name = String(card.name ?? "");
  if (index && name && index.tokensByName.has(name)) {
    return true;
  }

  const id = String(card.id ?? "");
  // Tokens are published in set Basic A (ids beginning with 9).
  return /^9/.test(id);
}

function earthSigilSurvivorRank(card: CardInstance | CardTemplate): number {
  return isTokenEarthSigil(card)
    ? RANK_TOKEN_EARTH_SIGIL
    : RANK_COLLECTIBLE_EARTH_SIGIL;
}

function boardIndexOf(board: CardInstance[], card: CardInstance) {
  const idx = board.indexOf(card);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

/** Pick the Earth Sigil that should survive a merge (collectible > token; tie = oldest on board). */
export function pickEarthSigilSurvivor(
  sigils: CardInstance[],
  board: CardInstance[],
) {
  if (!sigils.length) return null;

  let survivor = sigils[0]!;
  let survivorRank = earthSigilSurvivorRank(survivor);
  let survivorIndex = boardIndexOf(board, survivor);

  for (let i = 1; i < sigils.length; i++) {
    const candidate = sigils[i]!;
    const candidateRank = earthSigilSurvivorRank(candidate);
    const candidateIndex = boardIndexOf(board, candidate);

    if (
      candidateRank < survivorRank ||
      (candidateRank === survivorRank && candidateIndex < survivorIndex)
    ) {
      survivor = candidate;
      survivorRank = candidateRank;
      survivorIndex = candidateIndex;
    }
  }

  return survivor;
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

// Preferred merge target: collectible Earth Sigil on board, else oldest token.
export function findEarthSigilTarget(board: CardInstance[]) {
  const sigils = earthSigilsOnBoard(board);
  return pickEarthSigilSurvivor(sigils, board);
}

// Add one earth counter to the preferred Earth Sigil, if present.
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

function mergeEarthSigilsOntoSurvivor(
  board: CardInstance[],
  owner: Player,
  sigils: CardInstance[],
) {
  if (sigils.length <= 1) return;

  const survivor = pickEarthSigilSurvivor(sigils, board);
  if (!survivor) return;

  const absorbed = sumCounters(sigils);
  survivor.counters = survivor.counters || {};
  for (const [key, value] of Object.entries(absorbed)) {
    survivor.counters[key] = value;
  }

  const toRemove: number[] = [];
  for (const sigil of sigils) {
    if (sigil === survivor) continue;
    const idx = board.indexOf(sigil);
    if (idx !== -1) toRemove.push(idx);
  }
  if (!toRemove.length) return;

  removeEarthSigilsFromBoard(board, owner, toRemove);
}

// When an Earth Sigil amulet enters via play, merge all Earth Sigils on the
// board into the ranked survivor (collectible outranks token).
export function mergeEarthSigilOnPlay(_entering: CardInstance, owner: Player) {
  const board = getBoard(state, owner);
  const sigils = earthSigilsOnBoard(board);
  mergeEarthSigilsOntoSurvivor(board, owner, sigils);
}

// Helper function to merge sigils into the ranked survivor
export function mergeSigils(
  board: CardInstance[],
  sigilsToMerge: CardInstance[],
) {
  if (sigilsToMerge.length <= 1) return;
  const owner = sigilsToMerge[0]?.owner ?? "first";
  mergeEarthSigilsOntoSurvivor(board, owner, sigilsToMerge);
}

// After any summon that could touch Earth Sigils, merge duplicates down to one.
export function dedupeEarthSigils(board: CardInstance[]) {
  const sigils = earthSigilsOnBoard(board);
  if (sigils.length <= 1) return;
  mergeSigils(board, sigils);
}
