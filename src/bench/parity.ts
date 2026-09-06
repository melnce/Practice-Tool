// src/bench/parity.ts
// Dispatch-parity soak: engine (UI) vs core (headless) must agree on legal actions and state.

import { state } from "../core/gameState.js";
import { hashGameState } from "../core/stateHash.js";
import { startNewGame } from "../engine.js";
import type {
  SoakAction,
  SoakGameResult,
  RunSoakGameOptions,
  JsonPathDiff,
} from "./soakEnv.js";
import {
  runSoakGame,
  getLegalSoakActions,
  sortSoakActions,
  canonicalJson,
  captureLegalSnapshot,
  maskCanonicalSnapshot,
  diffJsonPaths,
  PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS,
  captureFullSnapshot,
  prepareSoakReplay,
  applySoakActionWithOutcome,
} from "./soakEnv.js";

export type ParitySnapshot = {
  legal: string;
  stateFp: string;
};

export type ParityDivergence = {
  actionIndex: number;
  action: SoakAction;
  kind: "legal" | "state";
  engineLegal: string;
  coreLegal: string;
  engineStateFp: string;
  coreStateFp: string;
  /** Whether masked/hash state fingerprints matched at this action. */
  stateFpEqual: boolean;
  /** First differing JSON paths when state fingerprints differ (masked canonical only). */
  stateDiffPaths?: JsonPathDiff[];
  message: string;
  /** First differing legal JSON path (legal mismatches only). */
  signaturePath: string;
};

export type ParitySoakResult = SoakGameResult & {
  paritySnapshots?: ParitySnapshot[];
  parityDivergence?: ParityDivergence;
};

function safeHash(): string {
  try {
    return hashGameState(state);
  } catch (e) {
    return `hash_error:${e instanceof Error ? e.message : String(e)}`;
  }
}

/** State fingerprint for parity: hashGameState, or masked canonical when ignore fields are set. */
export function computeParityStateFingerprint(
  ignoreFields: readonly string[],
): string {
  if (ignoreFields.length === 0) return safeHash();
  const canon = captureFullSnapshot().canon;
  return maskCanonicalSnapshot(canon, ignoreFields);
}

export function captureParitySnapshot(
  ignoreFields: readonly string[],
): ParitySnapshot {
  return {
    legal: captureLegalSnapshot(),
    stateFp: computeParityStateFingerprint(ignoreFields),
  };
}

function stateDiffPathsFromFingerprints(
  engineFp: string,
  coreFp: string,
): JsonPathDiff[] | undefined {
  if (engineFp === coreFp) return undefined;
  try {
    const exp = JSON.parse(engineFp) as unknown;
    const act = JSON.parse(coreFp) as unknown;
    return diffJsonPaths(exp, act);
  } catch {
    return [{ path: "(hash)", a: engineFp, b: coreFp }];
  }
}

export function formatParityMismatch(div: ParityDivergence): string {
  const kindLabel = div.kind === "legal" ? "legal-actions" : "state";
  const stateLine = `state fingerprints: ${div.stateFpEqual ? "equal" : "DIFFER"} (engine=${div.engineStateFp.slice(0, 12)}… core=${div.coreStateFp.slice(0, 12)}…)`;
  const exp =
    div.kind === "legal"
      ? (JSON.parse(div.engineLegal) as unknown)
      : div.engineStateFp;
  const act =
    div.kind === "legal"
      ? (JSON.parse(div.coreLegal) as unknown)
      : div.coreStateFp;
  const diffs =
    div.kind === "legal"
      ? diffJsonPaths(exp, act)
      : (div.stateDiffPaths ??
        (exp !== act ? [{ path: "(state)", a: exp, b: act }] : []));
  const diffText = diffs
    .map(
      (d) =>
        `  ${d.path}: engine=${JSON.stringify(d.a)} core=${JSON.stringify(d.b)}`,
    )
    .join("\n");
  const stateDiffText =
    !div.stateFpEqual && div.stateDiffPaths?.length
      ? `\nstate diff paths:\n${div.stateDiffPaths
          .map(
            (d) =>
              `  ${d.path}: engine=${JSON.stringify(d.a)} core=${JSON.stringify(d.b)}`,
          )
          .join("\n")}`
      : "";
  return (
    `parity ${kindLabel} mismatch at action ${div.actionIndex} ` +
    `(${JSON.stringify(div.action)}):\n${stateLine}\n${diffText}${stateDiffText}`
  );
}

function compareParitySnapshots(
  actionIndex: number,
  action: SoakAction,
  engine: ParitySnapshot,
  core: ParitySnapshot,
): ParityDivergence | null {
  const stateFpEqual = engine.stateFp === core.stateFp;
  const stateDiffPaths = stateFpEqual
    ? undefined
    : stateDiffPathsFromFingerprints(engine.stateFp, core.stateFp);

  if (engine.legal !== core.legal) {
    const exp = JSON.parse(engine.legal) as unknown;
    const act = JSON.parse(core.legal) as unknown;
    const diffs = diffJsonPaths(exp, act);
    const signaturePath = diffs[0]?.path ?? "(legal)";
    const div: ParityDivergence = {
      actionIndex,
      action,
      kind: "legal",
      engineLegal: engine.legal,
      coreLegal: core.legal,
      engineStateFp: engine.stateFp,
      coreStateFp: core.stateFp,
      stateFpEqual,
      ...(stateDiffPaths ? { stateDiffPaths } : {}),
      signaturePath,
      message: "",
    };
    div.message = formatParityMismatch(div);
    return div;
  }
  if (!stateFpEqual) {
    const div: ParityDivergence = {
      actionIndex,
      action,
      kind: "state",
      engineLegal: engine.legal,
      coreLegal: core.legal,
      engineStateFp: engine.stateFp,
      coreStateFp: core.stateFp,
      stateFpEqual,
      ...(stateDiffPaths ? { stateDiffPaths } : {}),
      signaturePath: stateDiffPaths?.[0]?.path ?? "(state)",
      message: "",
    };
    div.message = formatParityMismatch(div);
    return div;
  }
  return null;
}

export type RunParitySoakGameOptions = RunSoakGameOptions & {
  parityIgnoreFields?: readonly string[];
};

/**
 * Play on engine path (recording trace + per-action snapshots), then replay
 * the trace on core path and compare legal actions + state after every action.
 */
export async function runParitySoakGame(
  opts: RunParitySoakGameOptions,
): Promise<ParitySoakResult> {
  const ignoreFields =
    opts.parityIgnoreFields ??
    (opts.historyCheck || opts.positionCheck
      ? [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS]
      : []);

  const paritySnapshots: ParitySnapshot[] = [];

  const engineResult = await runSoakGame({
    ...opts,
    dispatch: "engine",
    onAfterAction: (ctx) => {
      paritySnapshots.push({
        legal: ctx.legal,
        stateFp: ctx.stateFp,
      });
    },
    parityIgnoreFields: ignoreFields,
  });

  if (engineResult.outcome !== "completed") {
    return { ...engineResult, paritySnapshots };
  }

  const { seed, gameIndex, trace } = engineResult;
  const fuse = opts.fuse ?? false;
  const interactiveModes = opts.interactiveModes ?? false;

  prepareSoakReplay({ fuse, interactiveModes });

  try {
    await startNewGame({
      deckAId: engineResult.deckAId,
      deckBId: engineResult.deckBId,
      seed: seed + gameIndex * 1_000_003,
    });

    for (let i = 0; i < trace.length; i++) {
      const action = trace[i]!;
      applySoakActionWithOutcome(action, "core");
      const coreSnap = captureParitySnapshot(ignoreFields);
      const engineSnap = paritySnapshots[i];
      if (!engineSnap) {
        return {
          ...engineResult,
          outcome: "parity",
          error: `parity snapshot missing at action ${i + 1}`,
          findings: [`parity snapshot missing at action ${i + 1}`],
          paritySnapshots,
        };
      }
      const div = compareParitySnapshots(i + 1, action, engineSnap, coreSnap);
      if (div) {
        return {
          ...engineResult,
          outcome: "parity",
          error: div.message,
          findings: [div.message],
          parityDivergence: div,
          paritySnapshots,
        };
      }
    }

    const coreHash = safeHash();
    if (coreHash !== engineResult.finalHash) {
      const div: ParityDivergence = {
        actionIndex: trace.length,
        action: { type: "END_TURN" } as SoakAction,
        kind: "state",
        engineLegal: "",
        coreLegal: "",
        engineStateFp: engineResult.finalHash,
        coreStateFp: coreHash,
        stateFpEqual: false,
        stateDiffPaths: [
          { path: "(final-hash)", a: engineResult.finalHash, b: coreHash },
        ],
        signaturePath: "(final-hash)",
        message: `parity state mismatch at game end: engine=${engineResult.finalHash} core=${coreHash}`,
      };
      return {
        ...engineResult,
        outcome: "parity",
        error: div.message,
        findings: [div.message],
        parityDivergence: div,
        paritySnapshots,
      };
    }

    return { ...engineResult, paritySnapshots };
  } catch (e) {
    return {
      ...engineResult,
      outcome: "parity",
      error: `core replay crash: ${e instanceof Error ? e.message : String(e)}`,
      findings: [
        `core replay crash: ${e instanceof Error ? e.message : String(e)}`,
      ],
      paritySnapshots,
    };
  } finally {
    prepareSoakReplay({ fuse: false, interactiveModes: false });
  }
}

/** Signature key for bucketing parity violations in soak summary. */
export function parityViolationSignature(div: ParityDivergence): string {
  const actionType =
    typeof div.action === "object" && div.action && "type" in div.action
      ? String(div.action.type)
      : "unknown";
  if (!div.stateFpEqual && div.stateDiffPaths?.[0]?.path) {
    return `state:${actionType}:${div.stateDiffPaths[0].path}`;
  }
  if (div.kind === "legal" && div.stateFpEqual) {
    return `legal-equal-state:${actionType}`;
  }
  return `${div.kind}:${actionType}:${div.signaturePath}`;
}

/** Canonical legal actions JSON (exported for tests). */
export function canonicalLegalSoakActions(): string {
  return canonicalJson(sortSoakActions(getLegalSoakActions()));
}
