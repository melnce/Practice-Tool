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
import { TraceRunnerError, isLegalSoakAction } from "./traceErrors.js";
import type {
  TraceHeader,
  TraceActionLine,
  NeutralAction,
  Pick,
} from "./types.js";
import { captureSnapshot } from "../../core/history.js";
import type { GameState } from "../../core/types/index.js";
import { getHand } from "../../core/playerHelpers.js";
import { validateTargetSelection } from "../../logic/core/targeting/validation.js";

export type TraceRunOptions = {
  seed: number;
  gameIndex: number;
  deckA: IdDeckFile;
  deckB: IdDeckFile;
  turnCap?: number;
  actionCap?: number;
};

export type TraceCompletion =
  | "terminal"
  | "turn_cap"
  | "action_cap"
  | "no_legal_actions";

export type TraceRunResult = {
  header: TraceHeader;
  lines: TraceActionLine[];
  finalHash: string;
  completion: TraceCompletion;
};

function snapshot(): GameState {
  return captureSnapshot();
}

function isFuseFinalizePending(gameState: GameState): boolean {
  const eff = gameState.pendingTargetEffect?.eff as
    | { op?: string; action?: string }
    | undefined;
  return eff?.op === "fuse" && eff?.action === "finalize";
}

type PendingFuseCtx = {
  action: Extract<SoakAction, { type: "FUSE" }>;
  player: "first" | "second";
  hostPos: number;
  handUidsBefore: string[];
  banishUidsBefore: Set<string>;
};

function applyTraceAction(
  action: SoakAction,
  lineIndex: number,
  gameIndex: number,
): void {
  if (action.type === "CHOOSE_TARGET" && action.target.type === "card") {
    const pending = state.pendingTargetEffect;
    if (!pending) {
      throw new TraceRunnerError(
        `CHOOSE_TARGET with no pending prompt at i=${lineIndex}: ${JSON.stringify(action)}`,
        { action, lineIndex, gameIndex },
      );
    }
    const validation = validateTargetSelection(
      state,
      pending,
      action.target.uid,
    );
    if (!validation.ok) {
      throw new TraceRunnerError(
        `CHOOSE_TARGET invalid at i=${lineIndex}: ${validation.reason ?? "invalid"} (${JSON.stringify(action)})`,
        { action, lineIndex, gameIndex },
      );
    }
  }

  const hashBefore = hashGameState(state);
  const telemetry = applySoakActionWithOutcome(action, undefined, {
    skipCanonicalize: true,
  });

  if (telemetry.playBlocked) {
    throw new TraceRunnerError(
      `PLAY_CARD blocked at i=${lineIndex}: ${telemetry.playBlocked.reason} (${JSON.stringify(action)})`,
      { action, lineIndex, gameIndex },
    );
  }

  const hashDriftOptional =
    action.type === "CHOOSE_TARGET" ||
    action.type === "TOGGLE_MULLIGAN" ||
    action.type === "CONFIRM_MULLIGAN" ||
    action.type === "ATTACK";
  if (!hashDriftOptional && hashGameState(state) === hashBefore) {
    throw new TraceRunnerError(
      `action rejected (state unchanged) at i=${lineIndex}: ${JSON.stringify(action)}`,
      { action, lineIndex, gameIndex },
    );
  }
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
  let completion: TraceCompletion = "no_legal_actions";
  let pendingFuse: PendingFuseCtx | null = null;

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
    if (isGameOver(state)) {
      completion = "terminal";
      break;
    }
    if ((state.turnNumber | 0) > turnCap) {
      completion = "turn_cap";
      break;
    }
    if (appliedActions >= actionCap) {
      completion = "action_cap";
      break;
    }

    const legal = getLegalSoakActions();
    if (legal.length === 0) break;

    if (pendingFuse && !isFuseFinalizePending(state)) {
      pendingFuse = null;
    }

    const raw = pickSoakAction(legal, policyRng);
    const action = canonicalizeTraceAction(raw, state, {
      legalSoakActions: legal,
    });
    if (!isLegalSoakAction(action, legal)) {
      throw new TraceRunnerError(
        `canonicalized action not legal at i=${actionIndex}: ${JSON.stringify(action)} (from ${JSON.stringify(raw)})`,
        { action, lineIndex: actionIndex, gameIndex: opts.gameIndex },
      );
    }
    const before = snapshot();
    clearActionDraws();

    if (action.type === "TOGGLE_MULLIGAN") {
      applySoakActionWithOutcome(action, undefined, { skipCanonicalize: true });
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
      applyTraceAction(action, actionIndex, opts.gameIndex);
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
      applyTraceAction(action, actionIndex, opts.gameIndex);
      appliedActions++;
      pendingFuse = {
        action,
        player: action.player,
        hostPos: hostPos < 0 ? 0 : hostPos,
        handUidsBefore: handBefore.map((c) => c?.uid ?? ""),
        banishUidsBefore: banishUidSet(before.players[action.player].banish),
      };
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CHOOSE_TARGET") {
      applyTraceAction(action, actionIndex, opts.gameIndex);
      appliedActions++;
      if (!isFuseFinalizePending(state)) {
        const after = snapshot();
        const fuseCtx = pendingFuse;
        pendingFuse = null;
        const partnerPositions = deriveFusePartnerPositions(
          fuseCtx.handUidsBefore,
          fuseCtx.hostPos,
          fuseCtx.banishUidsBefore,
          banishUidSet(after.players[fuseCtx.player].banish),
        );
        const neutral = soakActionToNeutral(fuseCtx.action, before, {
          fuseHostPos: fuseCtx.hostPos,
          fusePartners: partnerPositions,
        });
        if (neutral) emitLine(neutral, before, after);
      }
      recorder.clearRolls();
      continue;
    }

    if (pendingFuse && action.type === "CONFIRM_TARGETS") {
      applyTraceAction(action, actionIndex, opts.gameIndex);
      appliedActions++;
      const after = snapshot();
      const fuseCtx = pendingFuse;
      pendingFuse = null;
      const partnerPositions = deriveFusePartnerPositions(
        fuseCtx.handUidsBefore,
        fuseCtx.hostPos,
        fuseCtx.banishUidsBefore,
        banishUidSet(after.players[fuseCtx.player].banish),
      );
      const neutral = soakActionToNeutral(fuseCtx.action, before, {
        fuseHostPos: fuseCtx.hostPos,
        fusePartners: partnerPositions,
      });
      if (neutral) emitLine(neutral, before, after);
      continue;
    }

    applyTraceAction(action, actionIndex, opts.gameIndex);
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

  if (completion === "no_legal_actions" && !isGameOver(state)) {
    const lastLegal = getLegalSoakActions().length;
    throw new TraceRunnerError(
      `game stalled at i=${actionIndex} phase=${state.phase} legal=${lastLegal} (not terminal, cap not reached)`,
      { lineIndex: actionIndex, gameIndex: opts.gameIndex },
    );
  }

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

  return { header, lines, finalHash, completion };
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
