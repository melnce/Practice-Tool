import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import type { ProcessingCandidate } from "./process.js";
import type { TriggerSpec } from "./types.js";
import { getBoard, getHand, getCrests } from "../../../core/playerHelpers.js";

// PERF: Helper to get/initialize trigger cache on state
// Storing on state ensures automatic reset when state is reset
function getTriggerCache(): { candidates: any[] | null; actionSeq: number; zoneVersion: number } {
  if (!(state as any)._triggerCache) {
    (state as any)._triggerCache = { candidates: null, actionSeq: -1, zoneVersion: -1 };
  }
  return (state as any)._triggerCache;
}

// PERF: Centralized zone version increment - call this after any zone mutation
export function bumpZoneVersion() {
  (state as any).zoneVersion = ((state as any).zoneVersion ?? 0) + 1;
}

function mapToCandidate(
  card: CardInstance,
  owner: Player,
  source: string,
): ProcessingCandidate {
  const mainTriggers = (card.triggers || []) as TriggerSpec[];
  const stateTriggers = (card.keywordState?.triggers || []) as TriggerSpec[];

  // PERF: Avoid spread if one is empty
  const triggers = stateTriggers.length === 0
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
function hasTriggers(card: CardInstance): boolean {
  const mainLen = card.triggers?.length ?? 0;
  const stateLen = card.keywordState?.triggers?.length ?? 0;
  return mainLen > 0 || stateLen > 0;
}

export function getAllZoneCandidates(): ProcessingCandidate[] {
  // PERF: Return cached result if still in same action AND zones haven't mutated
  const actionSeq = (state as any).actionSeq ?? 0;
  const zoneVersion = (state as any).zoneVersion ?? 0;
  const cache = getTriggerCache();

  if (cache.candidates && cache.actionSeq === actionSeq && cache.zoneVersion === zoneVersion) {
    return cache.candidates;
  }

  // P1-3 FIX: Sort board candidates by insertionTs for deterministic ordering
  // Hand candidates don't need sorting (array order is already deterministic)
  // PERF: Filter out cards with no triggers before mapping
  const firstBoard = getBoard(state, "first")
    .filter(hasTriggers)
    .slice()
    .sort((a, b) => ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0));
  const secondBoard = getBoard(state, "second")
    .filter(hasTriggers)
    .slice()
    .sort((a, b) => ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0));

  const result = [
    ...firstBoard.map((c) => mapToCandidate(c, "first", "board")),
    ...secondBoard.map((c) => mapToCandidate(c, "second", "board")),
    ...getHand(state, "first").filter(hasTriggers).map((c) => mapToCandidate(c, "first", "hand")),
    ...getHand(state, "second").filter(hasTriggers).map((c) => mapToCandidate(c, "second", "hand")),
  ];

  // Cache for reuse within this action (until zone mutates)
  cache.candidates = result;
  cache.actionSeq = actionSeq;
  cache.zoneVersion = zoneVersion;

  return result;
}

// Deprecated: use bumpZoneVersion instead for explicit zone mutations
export function invalidateZoneCandidatesCache() {
  const cache = getTriggerCache();
  cache.candidates = null;
}


export function getCrestCandidates(
  activePlayer: Player,
): ProcessingCandidate[] {
  const crests = getCrests(state, activePlayer);
  if (!Array.isArray(crests)) return [];

  return crests.map((crest) => {
    // Phase 2: Only use triggers array (singular trigger field removed)
    const rawTriggers = Array.isArray(crest.triggers) ? crest.triggers : [];

    return {
      card: crest,
      owner: activePlayer,
      source: "crest",
      triggers: rawTriggers as TriggerSpec[],
    };
  });
}















