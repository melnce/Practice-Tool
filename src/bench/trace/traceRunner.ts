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
import { setDrawRecording, clearActionDraws } from "./drawRecorder.js";
import { toCanonicalState, canonicalJson } from "./canonicalState.js";
import {
  soakActionToNeutral,
  getLegalNeutralActions,
} from "./neutralAction.js";
import { derivePicks } from "./pickDerive.js";
import { canonicalizeTraceAction } from "./traceCanonicalize.js";
import {
  banishUidSet,
  deriveFusePartnerPositions,
} from "./fusePartnerDerive.js";
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

  prepareSoakReplay({ fuse: true, interactiveModes: true });
  installSoakAdapter({ interactiveModes: true });
  (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
  (globalThis as any).HEADLESS = true;

  await startNewGame({
    deckAId,
    deckBId,
    seed: gameSeed,
  });

  const openingHands = {
    a: getHand(state, "first").map((c) => String(c.id)),
    b: getHand(state, "second").map((c) => String(c.id)),
  };

  const recorder = installTraceRng(state)!;
  setDrawRecording(true);
  const policyRng = createRng(`soak-policy-${opts.seed}-${opts.gameIndex}`);

  const lines: TraceActionLine[] = [];
  let actionIndex = 0;
  let appliedActions = 0;
  let pendingFuse: {
    action: SoakAction;
    hostPos: number;
    handUidsBefore: string[];
    banishUidsBefore: Set<string>;
  } | null = null;

  const emitLine = (
    neutral: NeutralAction,
    before: GameState,
    after: GameState,
    extraPicks: Pick[] = [],
  ) => {
    const rolls = recorder.getRolls();
    recorder.clearRolls();
    const rng = [...derivePicks(rolls, before), ...extraPicks];
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

    const action = canonicalizeTraceAction(
      pickSoakAction(legal, policyRng),
      state,
    );
    const before = snapshot();
    clearActionDraws();

    if (action.type === "TOGGLE_MULLIGAN") {
      applySoakActionWithOutcome(action);
      appliedActions++;
      recorder.clearRolls();
      continue;
    }

    if (action.type === "CONFIRM_MULLIGAN") {
      const handBefore = getHand(before, action.player);
      const bag =
        action.player === "first"
          ? before.mulliganFirstSelected
          : before.mulliganSecondSelected;
      const swap: [boolean, boolean, boolean, boolean] = [
        bag?.has(handBefore[0]?.uid ?? "") ?? false,
        bag?.has(handBefore[1]?.uid ?? "") ?? false,
        bag?.has(handBefore[2]?.uid ?? "") ?? false,
        bag?.has(handBefore[3]?.uid ?? "") ?? false,
      ];
      applySoakActionWithOutcome(action);
      appliedActions++;
      const after = snapshot();
      const neutral = soakActionToNeutral(action, before, {
        mulliganSwap: swap,
      });
      if (neutral) emitLine(neutral, before, after);
      continue;
    }

    if (action.type === "FUSE") {
      const handBefore = getHand(before, action.player);
      const hostPos = handBefore.findIndex((c) => c?.uid === action.cardUid);
      applySoakActionWithOutcome(action);
      appliedActions++;
      pendingFuse = {
        action,
        hostPos: hostPos < 0 ? 0 : hostPos,
        handUidsBefore: handBefore.map((c) => c?.uid ?? ""),
        banishUidsBefore: banishUidSet(before.players[action.player].banish),
      };
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CHOOSE_TARGET") {
      applySoakActionWithOutcome(action);
      appliedActions++;
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CONFIRM_TARGETS") {
      applySoakActionWithOutcome(action);
      appliedActions++;
      const after = snapshot();
      const fusePlayer = pendingFuse.action.player;
      const partnerPositions = deriveFusePartnerPositions(
        pendingFuse.handUidsBefore,
        pendingFuse.hostPos,
        pendingFuse.banishUidsBefore,
        banishUidSet(after.players[fusePlayer].banish),
      );
      const neutral = soakActionToNeutral(pendingFuse.action, before, {
        fuseHostPos: pendingFuse.hostPos,
        fusePartners: partnerPositions,
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
        {
          confirm: {
            player: before.activePlayer === "first" ? "a" : "b",
          },
        },
        before,
        after,
      );
      continue;
    }

    const neutral = soakActionToNeutral(action, before);
    if (neutral) {
      emitLine(neutral, before, snapshot());
    } else {
      recorder.clearRolls();
    }
  }

  setDrawRecording(false);
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
    opening_hands: openingHands,
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
