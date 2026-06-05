import { state } from "../../../core/gameState.js";

import type { CardInstance, Player } from "../../../core/types/index.js";

import type { ProcessingCandidate } from "./process.js";

import type { TriggerSpec } from "./types.js";

import {

  getBoard,

  getHand,

  getCrests,

  getDeck,

  opponentOf,

} from "../../../core/playerHelpers.js";



// PERF: Helper to get/initialize trigger cache on state

// Storing on state ensures automatic reset when state is reset

function getTriggerCache(): {

  candidates: ProcessingCandidate[] | null;

  actionSeq: number;

  zoneVersion: number;

  activePlayer: Player | null;

  excludeKey: string;

} {

  if (!(state as any)._triggerCache) {

    (state as any)._triggerCache = {

      candidates: null,

      actionSeq: -1,

      zoneVersion: -1,

      activePlayer: null,

      excludeKey: "",

    };

  }

  return (state as any)._triggerCache;

}



// PERF: Centralized zone version increment - call this after any zone mutation

export function bumpZoneVersion() {

  (state as any).zoneVersion = ((state as any).zoneVersion ?? 0) + 1;

}



/** Monotonic entry timestamp for board/crest ordering (C2/C7). */

export function allocateInsertionTs(): number {

  const ts = state.gameTick ?? 0;

  state.gameTick = ts + 1;

  return ts;

}

/**
 * Stamp board entry order. Use advance:true for play-from-hand (no prior gameTick bump).
 * Effect summons use advance:false — runEffects already incremented gameTick for the op.
 */
export function stampBoardEntryTs(
  card: CardInstance,
  opts?: { advance?: boolean },
): number {
  const existing = (card as any).insertionTs;
  if (existing != null && Number.isFinite(existing)) return existing;

  const ts = opts?.advance ? allocateInsertionTs() : (state.gameTick ?? 0);
  (card as any).insertionTs = ts;
  return ts;
}



export function compareBoardEntryOrder(a: CardInstance, b: CardInstance): number {

  return ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0);

}



function mapToCandidate(

  card: CardInstance,

  owner: Player,

  source: string,

): ProcessingCandidate {

  const mainTriggers = (card.triggers || []) as TriggerSpec[];

  const stateTriggers = (card.keywordState?.triggers || []) as TriggerSpec[];



  // PERF: Avoid spread if one is empty

  const triggers =

    stateTriggers.length === 0

      ? mainTriggers

      : mainTriggers.length === 0

        ? stateTriggers

        : mainTriggers.concat(stateTriggers);



  return {

    card,

    owner,

    source,

    triggers,

  };

}



// PERF: Skip cards with no triggers (avoid allocating candidate objects)

function hasTriggers(card: CardInstance | null | undefined): boolean {

  if (!card || typeof card !== "object") return false;

  const mainLen = card.triggers?.length ?? 0;

  const stateLen = card.keywordState?.triggers?.length ?? 0;

  return mainLen > 0 || stateLen > 0;

}



function hasCrestTriggers(crest: { triggers?: unknown[] } | null | undefined): boolean {

  return Array.isArray(crest?.triggers) && crest.triggers.length > 0;

}



function mapCrestCandidates(owner: Player): ProcessingCandidate[] {

  const crests = getCrests(state, owner);

  if (!Array.isArray(crests)) return [];



  return crests

    .filter((c) => hasCrestTriggers(c))

    .slice()

    .sort(

      (a, b) =>

        ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0),

    )

    .map((crest) => ({

      card: crest,

      owner,

      source: "crest",

      triggers: (crest.triggers || []) as TriggerSpec[],

    }));

}



function mapBoardCandidates(owner: Player): ProcessingCandidate[] {

  return getBoard(state, owner)

    .filter((c) => c && hasTriggers(c))

    .slice()

    .sort(compareBoardEntryOrder)

    .map((c) => mapToCandidate(c, owner, "board"));

}



function mapHandCandidates(owner: Player): ProcessingCandidate[] {

  return getHand(state, owner)

    .filter((c) => c && hasTriggers(c))

    .map((c) => mapToCandidate(c, owner, "hand"));

}



function mapDeckCandidates(owner: Player): ProcessingCandidate[] {

  return getDeck(state, owner)

    .filter((c) => c && hasTriggers(c))

    .map((c) => mapToCandidate(c, owner, "deck"));

}



export type OrderedTriggerOptions = {

  /** Skip tiers whose ProcessingCandidate.source matches (e.g. crest for turn events). */

  excludeSources?: string[];

};



/**

 * Rulebook 8-tier trigger candidate order (C2):

 * active hand → reactive hand → active crest → active board →

 * reactive crest → reactive board → active deck → reactive deck

 */

export function getOrderedTriggerCandidates(

  activePlayer: Player,

  options?: OrderedTriggerOptions,

): ProcessingCandidate[] {

  const reactivePlayer = opponentOf(activePlayer);

  const exclude = new Set(options?.excludeSources ?? []);

  const excludeKey = [...exclude].sort().join(",");



  const actionSeq = (state as any).actionSeq ?? 0;

  const zoneVersion = (state as any).zoneVersion ?? 0;

  const cache = getTriggerCache();



  if (

    cache.candidates &&

    cache.actionSeq === actionSeq &&

    cache.zoneVersion === zoneVersion &&

    cache.activePlayer === activePlayer &&

    cache.excludeKey === excludeKey

  ) {

    return cache.candidates;

  }



  const tiers: ProcessingCandidate[][] = [];



  if (!exclude.has("hand")) {

    tiers.push(mapHandCandidates(activePlayer));

    tiers.push(mapHandCandidates(reactivePlayer));

  }

  if (!exclude.has("crest")) {

    tiers.push(mapCrestCandidates(activePlayer));

  }

  if (!exclude.has("board")) {

    tiers.push(mapBoardCandidates(activePlayer));

  }

  if (!exclude.has("crest")) {

    tiers.push(mapCrestCandidates(reactivePlayer));

  }

  if (!exclude.has("board")) {

    tiers.push(mapBoardCandidates(reactivePlayer));

  }

  if (!exclude.has("deck")) {

    tiers.push(mapDeckCandidates(activePlayer));

    tiers.push(mapDeckCandidates(reactivePlayer));

  }



  const result = tiers.flat();



  cache.candidates = result;

  cache.actionSeq = actionSeq;

  cache.zoneVersion = zoneVersion;

  cache.activePlayer = activePlayer;

  cache.excludeKey = excludeKey;



  return result;

}



/** @deprecated Use getOrderedTriggerCandidates(activePlayer) — zone tiers only subset. */

export function getAllZoneCandidates(): ProcessingCandidate[] {

  const activePlayer = state.activePlayer ?? "first";

  return getOrderedTriggerCandidates(activePlayer, {

    excludeSources: ["crest"],

  });

}



/** @deprecated Use getOrderedTriggerCandidates — returns active crest tier only. */

export function getCrestCandidates(activePlayer: Player): ProcessingCandidate[] {

  return mapCrestCandidates(activePlayer);

}



// Deprecated: use bumpZoneVersion instead for explicit zone mutations

export function invalidateZoneCandidatesCache() {

  const cache = getTriggerCache();

  cache.candidates = null;

}


