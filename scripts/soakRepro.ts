/**
 * Shared soak repro load / replay helpers for soak:promote and replay:check.
 */
import { readFileSync } from "fs";
import { hashGameState } from "../src/core/stateHash.js";
import { state } from "../src/core/gameState.js";
import { startNewGame } from "../src/engine.js";
import { deckSpecForSeed, registerSoakDeck } from "../src/bench/soakDecks.js";
import {
  applySoakActionWithOutcome,
  DEFAULT_SOAK_DISPATCH,
  type SoakAction,
} from "../src/bench/soakEnv.js";
import type { RawDeckObject } from "../src/data/rawDeck.js";

export type SoakReproFile = {
  seed: number;
  gameIndex: number;
  gameSeed?: number;
  deckAId?: string;
  deckBId?: string;
  deckARaw?: RawDeckObject;
  deckBRaw?: RawDeckObject;
  outcome: string;
  error?: string;
  findings?: string[];
  trace: SoakAction[];
};

export type ReplaySoakResult = {
  initialHash: string;
  finalHash: string;
  error?: string;
  threw: boolean;
  actionsApplied: number;
};

export function loadSoakRepro(path: string): SoakReproFile {
  return JSON.parse(readFileSync(path, "utf8")) as SoakReproFile;
}

export function gameSeedFromRepro(repro: SoakReproFile): number {
  return repro.gameSeed ?? repro.seed + repro.gameIndex * 1_000_003;
}

export function resolveDeckIds(repro: SoakReproFile): {
  deckAId: string;
  deckBId: string;
} {
  if (repro.deckARaw && repro.deckBRaw && repro.deckAId && repro.deckBId) {
    registerSoakDeck(repro.deckARaw, repro.deckAId);
    registerSoakDeck(repro.deckBRaw, repro.deckBId);
    return { deckAId: repro.deckAId, deckBId: repro.deckBId };
  }
  const spec = deckSpecForSeed(repro.seed, repro.gameIndex);
  return { deckAId: spec.deckAId, deckBId: spec.deckBId };
}

export async function replaySoakRepro(
  repro: SoakReproFile,
): Promise<ReplaySoakResult> {
  const { deckAId, deckBId } = resolveDeckIds(repro);
  const gameSeed = gameSeedFromRepro(repro);

  await startNewGame({ deckAId, deckBId, seed: gameSeed });
  const initialHash = hashGameState(state);

  let error: string | undefined;
  let threw = false;
  let actionsApplied = 0;

  try {
    for (const action of repro.trace) {
      applySoakActionWithOutcome(action, DEFAULT_SOAK_DISPATCH);
      actionsApplied++;
    }
  } catch (e) {
    threw = true;
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    initialHash,
    finalHash: hashGameState(state),
    error,
    threw,
    actionsApplied,
  };
}

/** First-line error signature without stack paths (stable across re-runs). */
export function errorSignature(err: string | undefined): string {
  if (!err) return "";
  const line = err.split("\n")[0] ?? err;
  return line
    .replace(/^Error:\s*/i, "")
    .replace(/\s+at\s+.*$/g, "")
    .trim();
}

export function reproducesRecordedFailure(
  repro: SoakReproFile,
  replay: ReplaySoakResult,
): { ok: boolean; reason?: string } {
  if (repro.outcome === "completed") {
    if (replay.threw) {
      return {
        ok: false,
        reason: "repro outcome was completed but replay threw",
      };
    }
    return { ok: true };
  }

  if (repro.outcome === "crash" || repro.outcome === "invariant") {
    if (!replay.threw) {
      return {
        ok: false,
        reason: `repro outcome was ${repro.outcome} but replay completed without throwing`,
      };
    }
    const expected = errorSignature(repro.error);
    const actual = errorSignature(replay.error);
    if (
      expected &&
      actual &&
      expected !== actual &&
      !actual.includes(expected)
    ) {
      return {
        ok: false,
        reason: `error mismatch:\n  repro:  ${expected}\n  replay: ${actual}`,
      };
    }
    return { ok: true };
  }

  // hang / parity / history — outcome recorded; replay should not throw unexpectedly
  if (replay.threw) {
    return {
      ok: false,
      reason: `repro outcome was ${repro.outcome} but replay threw: ${replay.error}`,
    };
  }
  return { ok: true };
}

export function findingSlug(repro: SoakReproFile): string {
  const raw = repro.findings?.[0] ?? repro.outcome ?? "unknown";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function goldenIdForRepro(repro: SoakReproFile): string {
  return `soak_${findingSlug(repro)}_seed${repro.seed}_g${repro.gameIndex}`;
}

export function parseSoakGoldenId(
  id: string,
): { soakSeed: number; gameIndex: number } | null {
  const m = /^soak_.+_seed(\d+)_g(\d+)$/.exec(id);
  if (!m) return null;
  return { soakSeed: Number(m[1]), gameIndex: Number(m[2]) };
}

export function isSoakGoldenId(id: string): boolean {
  return id.startsWith("soak_") && parseSoakGoldenId(id) !== null;
}

export async function replaySoakGolden(capsule: {
  id: string;
  seed: number;
  actions: SoakAction[];
}): Promise<ReplaySoakResult> {
  const parsed = parseSoakGoldenId(capsule.id);
  if (!parsed) {
    throw new Error(`invalid soak golden id: ${capsule.id}`);
  }
  const repro: SoakReproFile = {
    seed: parsed.soakSeed,
    gameIndex: parsed.gameIndex,
    gameSeed: capsule.seed,
    outcome: "completed",
    trace: capsule.actions,
  };
  return replaySoakRepro(repro);
}
