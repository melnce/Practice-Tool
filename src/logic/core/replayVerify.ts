import type { ReplayCapsule } from "./replay.js";
import type { EffectTraceEvent } from "./effects/trace.js";

// --- 1. Types ---

export interface ReplayDiff {
  ok: boolean;

  seedMatch: boolean;
  actionCountMatch: boolean;

  initialStateHashMatch: boolean;
  finalStateHashMatch: boolean;

  firstTraceDiff?:
    | {
        index: number;
        left: EffectTraceEvent | undefined;
        right: EffectTraceEvent | undefined;
      }
    | undefined;

  summary: {
    leftEvents: number;
    rightEvents: number;
    leftByKind: Record<EffectTraceEvent["kind"], number>;
    rightByKind: Record<EffectTraceEvent["kind"], number>;
    leftByOp?: Record<string, number>;
    rightByOp?: Record<string, number>;
  };
}

// --- 2. Structural Equality ---

function traceEventEqual(
  a: EffectTraceEvent | undefined,
  b: EffectTraceEvent | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  if (a.kind !== b.kind) return false;

  // Strict structural check based on discriminated union
  switch (a.kind) {
    case "dispatch_start":
      if (b.kind !== "dispatch_start") return false; // Redundant but safe
      return a.queueSize === b.queueSize;

    case "effect_start":
      if (b.kind !== "effect_start") return false;
      return a.op === b.op && a.depth === b.depth;

    case "effect_end":
      if (b.kind !== "effect_end") return false;
      return a.op === b.op;

    case "effect_pending":
      if (b.kind !== "effect_pending") return false;
      return a.op === b.op;

    case "effect_hash":
      if (b.kind !== "effect_hash") return false;
      return a.op === b.op && a.hash === b.hash;

    case "dispatch_end":
      if (b.kind !== "dispatch_end") return false;
      return a.processed === b.processed && a.remaining === b.remaining;
  }
}

// --- 3. Diff Logic ---

export function diffReplays(a: ReplayCapsule, b: ReplayCapsule): ReplayDiff {
  // Require real numeric seeds — undefined === undefined must not pass
  const seedMatch = typeof a.seed === "number" && a.seed === b.seed;

  const actionsA = a.actions;
  const actionsB = b.actions;
  const actionCountMatch =
    Array.isArray(actionsA) &&
    Array.isArray(actionsB) &&
    actionsA.length === actionsB.length;

  const initialHashA = a.initial?.stateHash;
  const initialHashB = b.initial?.stateHash;
  // Require real hash strings — string-shaped capsules previously compared
  // undefined === undefined and passed vacuously
  const initialStateHashMatch =
    typeof initialHashA === "string" &&
    typeof initialHashB === "string" &&
    initialHashA === initialHashB;

  const finalHashA = a.final?.stateHash;
  const finalHashB = b.final?.stateHash;
  const finalStateHashMatch =
    typeof finalHashA === "string" &&
    typeof finalHashB === "string" &&
    finalHashA === finalHashB;

  const traceA = a.trace || [];
  const traceB = b.trace || [];
  const maxLen = Math.max(traceA.length, traceB.length);
  let firstTraceDiff: ReplayDiff["firstTraceDiff"] = undefined;

  // Initialize summaries
  // We must initialize all kinds to 0 to be deterministic
  const kinds: EffectTraceEvent["kind"][] = [
    "dispatch_start",
    "effect_start",
    "effect_end",
    "effect_pending",
    "effect_hash",
    "dispatch_end",
  ];

  const leftByKind: Record<EffectTraceEvent["kind"], number> = {} as any;
  const rightByKind: Record<EffectTraceEvent["kind"], number> = {} as any;

  for (const k of kinds) {
    leftByKind[k] = 0;
    rightByKind[k] = 0;
  }

  const leftByOp: Record<string, number> = {};
  const rightByOp: Record<string, number> = {};

  for (let i = 0; i < maxLen; i++) {
    const left = traceA[i];
    const right = traceB[i];

    // Check divergence
    if (firstTraceDiff === undefined && !traceEventEqual(left, right)) {
      firstTraceDiff = {
        index: i,
        left,
        right,
      };
    }

    // Aggregate Summaries
    if (left) {
      leftByKind[left.kind]!++;
      if ("op" in left) {
        leftByOp[left.op] = (leftByOp[left.op] || 0) + 1;
      }
    }
    if (right) {
      rightByKind[right.kind]!++;
      if ("op" in right) {
        rightByOp[right.op] = (rightByOp[right.op] || 0) + 1;
      }
    }
  }

  const noTraceDivergence = firstTraceDiff === undefined;

  const ok =
    seedMatch &&
    actionCountMatch &&
    initialStateHashMatch &&
    finalStateHashMatch &&
    noTraceDivergence;

  return {
    ok,
    seedMatch,
    actionCountMatch,
    initialStateHashMatch,
    finalStateHashMatch,
    firstTraceDiff,
    summary: {
      leftEvents: traceA.length,
      rightEvents: traceB.length,
      leftByKind,
      rightByKind,
      leftByOp,
      rightByOp,
    },
  };
}

// --- 4. Formatting ---

function formatTraceEvent(e: EffectTraceEvent | undefined): string {
  if (!e) return "undefined";
  switch (e.kind) {
    case "dispatch_start":
      return `dispatch_start(queueSize=${e.queueSize})`;
    case "effect_start":
      return `effect_start(op=${e.op}, depth=${e.depth})`;
    case "effect_end":
      return `effect_end(op=${e.op})`;
    case "effect_pending":
      return `effect_pending(op=${e.op})`;
    case "effect_hash":
      return `effect_hash(op=${e.op}, hash=${e.hash})`;
    case "dispatch_end":
      return `dispatch_end(processed=${e.processed}, remaining=${e.remaining})`;
  }
}

export function formatReplayDiff(diff: ReplayDiff): string {
  const lines: string[] = [];

  lines.push(`Replay Verification: ${diff.ok ? "PASS" : "FAIL"}`);
  lines.push(`Seed Match: ${diff.seedMatch}`);
  lines.push(`Action Count Match: ${diff.actionCountMatch}`);
  lines.push(`Initial State Match: ${diff.initialStateHashMatch}`);
  lines.push(`Final State Match: ${diff.finalStateHashMatch}`);

  lines.push(`\nTrace Comparison:`);
  lines.push(`Left Events: ${diff.summary.leftEvents}`);
  lines.push(`Right Events: ${diff.summary.rightEvents}`);

  if (diff.firstTraceDiff) {
    lines.push(`\nFirst Divergence at index ${diff.firstTraceDiff.index}:`);
    lines.push(`Left:  ${formatTraceEvent(diff.firstTraceDiff.left)}`);
    lines.push(`Right: ${formatTraceEvent(diff.firstTraceDiff.right)}`);
  } else {
    lines.push(`\nTraces are identical structure.`);
  }

  lines.push(`\nSummary by Kind:`);
  // kinds is already defined locally in diffReplays but we need it here.
  // We can iterate keys of summary record, but sorted for stability.
  const kinds = Object.keys(
    diff.summary.leftByKind,
  ).sort() as EffectTraceEvent["kind"][];

  // Header
  lines.push(`Kind`.padEnd(20) + `Left`.padEnd(10) + `Right`.padEnd(10));
  lines.push("-".repeat(40));

  for (const k of kinds) {
    const l = diff.summary.leftByKind[k];
    const r = diff.summary.rightByKind[k];
    lines.push(`${k.padEnd(20)}${String(l).padEnd(10)}${String(r).padEnd(10)}`);
  }

  if (diff.summary.leftByOp && diff.summary.rightByOp) {
    lines.push(`\nTop Ops (by Left count):`);

    // Collect all ops
    const allOps = new Set([
      ...Object.keys(diff.summary.leftByOp),
      ...Object.keys(diff.summary.rightByOp),
    ]);

    const sortedOps = Array.from(allOps).sort((a, b) => {
      const countA = diff.summary.leftByOp?.[a] || 0;
      const countB = diff.summary.leftByOp?.[b] || 0;
      // Descending left count
      if (countB !== countA) return countB - countA;
      // Ascending name
      return a.localeCompare(b);
    });

    const top10 = sortedOps.slice(0, 10);
    lines.push(`Op`.padEnd(30) + `Left`.padEnd(10) + `Right`.padEnd(10));
    lines.push("-".repeat(50));

    for (const op of top10) {
      const l = diff.summary.leftByOp[op] || 0;
      const r = diff.summary.rightByOp[op] || 0;
      lines.push(
        `${op.padEnd(30)}${String(l).padEnd(10)}${String(r).padEnd(10)}`,
      );
    }
  }

  return lines.join("\n");
}

/*
Usage Example:
import { runWithReplay } from "./replay.js";
import { diffReplays, formatReplayDiff } from "./replayVerify.js";

// Assume setup...
const a = runWithReplay({ ...configA });
const b = runWithReplay({ ...configB });

const diff = diffReplays(a, b);
if (!diff.ok) {
    console.log(formatReplayDiff(diff));
}
*/
