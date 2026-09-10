// src/bench/trace/drawRecorder.ts — record deck→hand draws in engine order

import type { CardInstance } from "../../core/types/index.js";
import type { Pick } from "./types.js";

let active = false;
const actionDraws: string[] = [];

export function setDrawRecording(on: boolean): void {
  active = on;
  actionDraws.length = 0;
}

export function clearActionDraws(): void {
  actionDraws.length = 0;
}

/** Called from drawCard when a card moves deck → hand. */
export function recordTraceDraw(card: CardInstance): void {
  if (!active || !card?.id) return;
  actionDraws.push(String(card.id));
}

export function consumeDrawPicks(): Pick[] {
  return actionDraws.map((id) => ({ what: "draw", chose: id }));
}
