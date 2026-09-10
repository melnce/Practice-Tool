// src/bench/trace/traceRunner.ts — headless trace game runner

import { state } from "../../core/gameState.js";
import { hashGameState } from "../../core/stateHash.js";
import { isGameOver } from "../../core/gameOver.js";
import { createRng } from "../../core/rng.js";
import { startNewGame } from "../../engine.js";
import {
  getLegalSoakActions,
  pickSoakAction,
  applySoakActionWithOutcome,
  installSoakAdapter,
  prepareSoakReplay,
  DEFAULT_TURN_CAP,
  DEFAULT_ACTION_CAP,
  type SoakAction,
} from "../soakEnv.js";
import { registerSoakDeck } from "../soakDecks.js";
import type { IdDeckFile } from "./deckResolve.js";
import { resolveIdDeckFile, idDeckToSortedArray } from "./deckResolve.js";
import { installTraceRng, uninstallTraceRng } from "./rngRecorder.js";
import { toCanonicalState, canonicalJson } from "./canonicalState.js";
import {
  soakActionToNeutral,
  getLegalNeutralActions,
} from "./neutralAction.js";
import { derivePicks } from "./pickDerive.js";
import type {
  TraceHeader,
  TraceActionLine,
  NeutralAction,
  Pick,
} from "./types.js";
import { captureSnapshot } from "../../core/history.js";
import type { GameState } from "../../core/types/index.js";
import { getHand } from "../../core/playerHelpers.js";

export type TraceRunOptions = {
  seed: number;
  gameIndex: number;
  deckA: IdDeckFile;
  deckB: IdDeckFile;
  turnCap?: number;
  actionCap?: number;
};

export type TraceRunResult = {
  header: TraceHeader;
  lines: TraceActionLine[];
  finalHash: string;
};

function snapshot(): GameState {
  return captureSnapshot();
}

export async function runTraceGame(
  opts: TraceRunOptions,
): Promise<TraceRunResult> {
  const turnCap = opts.turnCap ?? DEFAULT_TURN_CAP;
  const actionCap = opts.actionCap ?? DEFAULT_ACTION_CAP;
  const gameSeed = opts.seed + opts.gameIndex * 1_000_003;

  const deckARaw = resolveIdDeckFile(opts.deckA);
  const deckBRaw = resolveIdDeckFile(opts.deckB);
  const deckAId = registerSoakDeck(
    deckARaw,
    `trace_a_${opts.seed}_${opts.gameIndex}`,
  );
  const deckBId = registerSoakDeck(
    deckBRaw,
    `trace_b_${opts.seed}_${opts.gameIndex}`,
  );

  prepareSoakReplay({ fuse: true, interactiveModes: false });
  installSoakAdapter({ interactiveModes: false });
  (globalThis as any).__SVWB_INTERACTIVE_MODES__ = false;
  (globalThis as any).HEADLESS = true;

  await startNewGame({
    deckAId,
    deckBId,
    seed: gameSeed,
  });

  const recorder = installTraceRng(state)!;
  const policyRng = createRng(`soak-policy-${opts.seed}-${opts.gameIndex}`);

  const lines: TraceActionLine[] = [];
  let actionIndex = 0;
  let appliedActions = 0;
  let mulliganToggles: Map<string, boolean> | null = null;
  let pendingFuse: {
    action: SoakAction;
    partnerPositions: number[];
  } | null = null;

  const emitLine = (
    neutral: NeutralAction,
    before: GameState,
    after: GameState,
    extraPicks: Pick[] = [],
  ) => {
    const rolls = recorder.getRolls();
    recorder.clearRolls();
    const rng = [...derivePicks(rolls, before, after), ...extraPicks];
    lines.push({
      i: actionIndex++,
      action: neutral,
      rng,
      state: toCanonicalState(after),
      legal: getLegalNeutralActions(after),
    });
  };

  while (true) {
    if (isGameOver(state)) break;
    if ((state.turnNumber | 0) > turnCap || appliedActions >= actionCap) break;

    const legal = getLegalSoakActions();
    if (legal.length === 0) break;

    const action = pickSoakAction(legal, policyRng);
    const before = snapshot();

    if (action.type === "TOGGLE_MULLIGAN") {
      if (!mulliganToggles) mulliganToggles = new Map();
      const hand = getHand(state, action.player);
      const pos = hand.findIndex((c) => c.uid === action.cardUid);
      if (pos >= 0 && pos < 4) {
        mulliganToggles.set(`${action.player}:${pos}`, true);
      }
      applySoakActionWithOutcome(action);
      appliedActions++;
      recorder.clearRolls();
      continue;
    }

    if (action.type === "CONFIRM_MULLIGAN") {
      const swap: [boolean, boolean, boolean, boolean] = [
        mulliganToggles?.get(`${action.player}:0`) ?? false,
        mulliganToggles?.get(`${action.player}:1`) ?? false,
        mulliganToggles?.get(`${action.player}:2`) ?? false,
        mulliganToggles?.get(`${action.player}:3`) ?? false,
      ];
      applySoakActionWithOutcome(action);
      appliedActions++;
      const after = snapshot();
      const neutral = soakActionToNeutral(action, after, {
        mulliganSwap: swap,
      });
      if (neutral) emitLine(neutral, before, after);
      mulliganToggles = null;
      continue;
    }

    if (action.type === "FUSE") {
      applySoakActionWithOutcome(action);
      appliedActions++;
      pendingFuse = { action, partnerPositions: [] };
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CHOOSE_TARGET") {
      const hand = getHand(state, action.player);
      if (action.target.type === "card") {
        const targetUid = action.target.uid;
        const pos = hand.findIndex((c) => c?.uid === targetUid);
        if (pos >= 0) pendingFuse.partnerPositions.push(pos);
      }
      applySoakActionWithOutcome(action);
      appliedActions++;
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CONFIRM_TARGETS") {
      applySoakActionWithOutcome(action);
      appliedActions++;
      const after = snapshot();
      const neutral = soakActionToNeutral(pendingFuse.action, after, {
        fusePartners: pendingFuse.partnerPositions,
      });
      pendingFuse = null;
      if (neutral) emitLine(neutral, before, after);
      continue;
    }

    applySoakActionWithOutcome(action);
    appliedActions++;

    if (action.type === "FORCE_COMPLETE_PENDING") {
      const after = snapshot();
      emitLine(
        { confirm: { player: state.activePlayer === "first" ? "a" : "b" } },
        before,
        after,
      );
      continue;
    }

    const neutral = soakActionToNeutral(action, state);
    if (neutral) {
      emitLine(neutral, before, snapshot());
    } else {
      recorder.clearRolls();
    }
  }

  uninstallTraceRng(state);
  prepareSoakReplay({ fuse: false, interactiveModes: false });

  const finalHash = hashGameState(state);
  const header: TraceHeader = {
    v: 1,
    engine: "practice-tool",
    seed: gameSeed,
    first: "a",
    deck_a: idDeckToSortedArray(opts.deckA),
    deck_b: idDeckToSortedArray(opts.deckB),
    x_final_hash: finalHash,
  };

  return { header, lines, finalHash };
}

export function formatTraceJsonl(
  header: TraceHeader,
  lines: TraceActionLine[],
): string {
  const parts = [canonicalJson(header)];
  for (const line of lines) {
    parts.push(canonicalJson(line));
  }
  return parts.join("\n") + "\n";
}

/** Install trace RNG around an existing soak session (hash-equivalence checks). */
export function withTraceRngRecording<T>(fn: () => T | Promise<T>): Promise<{
  result: T;
  rollCount: number;
}> {
  const recorder = installTraceRng(state);
  const run = async () => {
    try {
      const result = await fn();
      return { result, rollCount: recorder?.getRolls().length ?? 0 };
    } finally {
      uninstallTraceRng(state);
    }
  };
  return run();
}
