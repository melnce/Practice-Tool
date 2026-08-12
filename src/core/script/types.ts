/**
 * Scripted sparring-line format (NOT an AI opponent).
 *
 * Card identity: stable `cardId` + occurrence index within the zone at
 * resolve time. Raw `uid_<n>` values are intentionally rejected — any engine
 * change that adds/removes a `makeUid()` call would silently invalidate them.
 *
 * Bump SCRIPT_SCHEMA_VERSION on incompatible shape changes.
 */

import type { Player } from "../types/player.js";

/** Incompatible bumps must reject old files rather than mis-apply them. */
export const SCRIPT_SCHEMA_VERSION = 1 as const;

/** Reference a card by catalog id + N-th match in the relevant zone (0-based). */
export type ScriptCardRef = {
  cardId: string;
  /** Occurrence among cards with the same cardId in the zone. Default 0. */
  occ?: number;
};

export type ScriptDefenderRef = ScriptCardRef | { kind: "leader" };

export type ScriptStep =
  | { op: "END_TURN" }
  | { op: "PLAY_CARD"; card: ScriptCardRef }
  | {
      op: "ATTACK";
      attacker: ScriptCardRef;
      defender: ScriptDefenderRef;
    }
  | { op: "EVOLVE"; card: ScriptCardRef; mode: "normal" | "super" }
  | { op: "ENGAGE"; card: ScriptCardRef }
  | { op: "BONUS_PP" }
  | { op: "CHOOSE_TARGET"; target: ScriptDefenderRef }
  | { op: "CHOOSE_MODE"; indices: number[] }
  | { op: "TOGGLE_MULLIGAN"; card: ScriptCardRef }
  | { op: "CONFIRM_MULLIGAN" };

export type ScriptDocument = {
  schemaVersion: typeof SCRIPT_SCHEMA_VERSION;
  name: string;
  /** Side the line drives. */
  scriptedSide: Player;
  /** Opening seed used when the line was recorded (optional for mid-game loads). */
  seed?: number;
  deckAId?: string;
  deckBId?: string;
  steps: ScriptStep[];
  notes?: string;
};

export type ScriptProgress = {
  schemaVersion: typeof SCRIPT_SCHEMA_VERSION;
  /** Display name of the loaded script. */
  name: string;
  scriptedSide: Player;
  /** Next step index to execute (0..steps.length). */
  cursor: number;
  /** True when playback halted on a mismatch. */
  diverged?: boolean;
  divergeReason?: string;
};

export class ScriptSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptSchemaError";
  }
}

export class ScriptDivergeError extends Error {
  readonly stepIndex: number;
  readonly step: ScriptStep | null;

  constructor(stepIndex: number, step: ScriptStep | null, message: string) {
    super(message);
    this.name = "ScriptDivergeError";
    this.stepIndex = stepIndex;
    this.step = step;
  }
}
