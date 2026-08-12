/**
 * Scripted mode-choice hook.
 * When a sparring line is playing back, mode picks come from the script —
 * never from the HEADLESS heuristic AI path.
 */

import type { Player } from "../../core/types/player.js";

export type ScriptedModeRequest = {
  owner: Player;
  optionCount: number;
  selectCount: number;
};

type ModePickProvider = (req: ScriptedModeRequest) => number[] | null;

let provider: ModePickProvider | null = null;

/** Register (or clear) the playback provider that supplies mode indices. */
export function setScriptedModePickProvider(
  next: ModePickProvider | null,
): void {
  provider = next;
}

/**
 * Returns indices to pick for a mode effect, or null to use the normal
 * human modal / (non-script) headless path.
 */
export function getScriptedModePicks(
  req: ScriptedModeRequest,
): number[] | null {
  if (!provider) return null;
  return provider(req);
}

/** Recording sink: called when the human confirms mode picks for a scripted side. */
type ModeRecordSink = (owner: Player, indices: number[]) => void;
let recordSink: ModeRecordSink | null = null;

export function setScriptedModeRecordSink(sink: ModeRecordSink | null): void {
  recordSink = sink;
}

export function recordScriptedModePicks(
  owner: Player,
  indices: number[],
): void {
  recordSink?.(owner, indices);
}
