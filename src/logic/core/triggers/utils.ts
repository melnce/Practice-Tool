import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types/index.js";
import { ProcessingCandidate } from "./process.js";
import { TriggerSpec } from "./types.js";
import { getBoard, getHand, getCrests } from "../../../core/playerHelpers.js";

function mapToCandidate(
  card: CardInstance,
  owner: Player,
  source: string,
): ProcessingCandidate {
  const mainTriggers = (card.triggers || []) as TriggerSpec[];
  const stateTriggers = (card.keywordState?.triggers || []) as TriggerSpec[];

  return {
    card,
    owner,
    source,
    triggers: [...mainTriggers, ...stateTriggers],
  };
}

export function getAllZoneCandidates(): ProcessingCandidate[] {
  // P1-3 FIX: Sort board candidates by insertionTs for deterministic ordering
  // Hand candidates don't need sorting (array order is already deterministic)
  const firstBoard = getBoard(state, "first")
    .slice()
    .sort((a, b) => ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0));
  const secondBoard = getBoard(state, "second")
    .slice()
    .sort((a, b) => ((a as any).insertionTs ?? 0) - ((b as any).insertionTs ?? 0));

  return [
    ...firstBoard.map((c) => mapToCandidate(c, "first", "board")),
    ...secondBoard.map((c) => mapToCandidate(c, "second", "board")),
    ...getHand(state, "first").map((c) => mapToCandidate(c, "first", "hand")),
    ...getHand(state, "second").map((c) => mapToCandidate(c, "second", "hand")),
  ];
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















