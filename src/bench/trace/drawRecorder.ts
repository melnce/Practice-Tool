// src/bench/trace/drawRecorder.ts — record deck zone picks in engine order

import type { CardInstance } from "../../core/types/index.js";
import { recordTraceDeckPickRoll, recordTraceDrawRoll } from "./rngRecorder.js";

let active = false;

export function setDrawRecording(on: boolean): void {
  active = on;
}

export function clearActionDraws(): void {
  // Rolls live in the trace RNG recorder; clear via recorder.clearRolls().
}

/** Called from drawCard when a card moves deck → hand. */
export function recordTraceDraw(card: CardInstance): void {
  if (!active || !card?.id) return;
  recordTraceDrawRoll(String(card.id));
}

/** Called when a card leaves the deck without a random roll (search, summon-from-deck). */
export function recordTraceDeckPick(card: CardInstance): void {
  if (!active || !card?.id) return;
  recordTraceDeckPickRoll(String(card.id));
}
