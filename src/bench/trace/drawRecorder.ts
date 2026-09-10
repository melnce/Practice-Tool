// src/bench/trace/drawRecorder.ts — record deck zone picks in engine order

import type { CardInstance } from "../../core/types/index.js";
import type { Pick } from "./types.js";

let active = false;
const actionPicks: Pick[] = [];

export function setDrawRecording(on: boolean): void {
  active = on;
  actionPicks.length = 0;
}

export function clearActionDraws(): void {
  actionPicks.length = 0;
}

/** Called from drawCard when a card moves deck → hand. */
export function recordTraceDraw(card: CardInstance): void {
  if (!active || !card?.id) return;
  actionPicks.push({ what: "draw", chose: String(card.id) });
}

/** Called when a card leaves the deck without a random roll (search, summon-from-deck). */
export function recordTraceDeckPick(card: CardInstance): void {
  if (!active || !card?.id) return;
  actionPicks.push({
    what: "multiset_pick",
    among: "deck",
    chose: String(card.id),
  });
}

export function consumeActionPicks(): Pick[] {
  return actionPicks.slice();
}

/** @deprecated use consumeActionPicks */
export function consumeDrawPicks(): Pick[] {
  return consumeActionPicks();
}
