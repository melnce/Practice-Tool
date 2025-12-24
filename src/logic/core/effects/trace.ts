import { EffectOp, GameState } from "../../../core/types.js";
import { hashGameState } from "../../../core/stateHash.js";

// =============================================================================
// TRACE EVENT TYPES
// =============================================================================

export type EffectTraceEvent =
  | { kind: "dispatch_start"; queueSize: number }
  | { kind: "effect_start"; op: EffectOp; depth: number }
  | { kind: "effect_end"; op: EffectOp }
  | { kind: "effect_pending"; op: EffectOp }
  | { kind: "effect_hash"; op: EffectOp; hash: string }  // NEW: Per-op hash for determinism
  | { kind: "dispatch_end"; processed: number; remaining: number };

export interface EffectTraceSink {
  emit(event: EffectTraceEvent): void;
}

// =============================================================================
// TRACE UTILITIES
// =============================================================================

/**
 * Dev utility: Create array-based trace sink for testing
 */
export function createArrayTrace(): {
  sink: EffectTraceSink;
  events: EffectTraceEvent[];
} {
  const events: EffectTraceEvent[] = [];
  return {
    events,
    sink: {
      emit(e) {
        events.push(e);
      },
    },
  };
}

/**
 * Create a hash-recording trace sink for replay verification.
 * Wraps an optional inner sink and adds per-op state hashing.
 */
export function createHashTraceSink(
  getState: () => GameState,
  inner?: EffectTraceSink,
): {
  sink: EffectTraceSink;
  hashes: Array<{ op: EffectOp; hash: string }>;
} {
  const hashes: Array<{ op: EffectOp; hash: string }> = [];

  return {
    hashes,
    sink: {
      emit(e) {
        // Forward to inner sink if present
        if (inner) inner.emit(e);

        // Capture hash after each effect completes
        if (e.kind === "effect_end") {
          const hash = hashGameState(getState());
          hashes.push({ op: e.op, hash });
          // Emit hash event
          if (inner) inner.emit({ kind: "effect_hash", op: e.op, hash });
        }
      },
    },
  };
}

/**
 * Compare two hash arrays for determinism verification.
 * Returns first mismatch or null if identical.
 */
export function compareHashArrays(
  expected: Array<{ op: EffectOp; hash: string }>,
  actual: Array<{ op: EffectOp; hash: string }>,
): { mismatch: false } | { mismatch: true; index: number; expected: string; actual: string; op: EffectOp } {
  if (expected.length !== actual.length) {
    return {
      mismatch: true,
      index: Math.max(expected.length, actual.length) - 1,
      expected: `${expected.length} ops`,
      actual: `${actual.length} ops`,
      op: "unknown" as EffectOp,
    };
  }

  for (let i = 0; i < expected.length; i++) {
    if (expected[i]!.hash !== actual[i]!.hash) {
      return {
        mismatch: true,
        index: i,
        expected: expected[i]!.hash,
        actual: actual[i]!.hash,
        op: expected[i]!.op,
      };
    }
  }

  return { mismatch: false };
}

// =============================================================================
// GLOBAL TRACE CONTEXT
// =============================================================================

let globalTrace: EffectTraceSink | undefined;
let hashVerificationEnabled = false;

export function setGlobalTrace(sink: EffectTraceSink | undefined) {
  globalTrace = sink;
}

export function getGlobalTrace(): EffectTraceSink | undefined {
  return globalTrace;
}

/**
 * Enable/disable per-op hash verification mode.
 * When enabled, every effect completion triggers state hashing.
 */
export function setHashVerificationMode(enabled: boolean) {
  hashVerificationEnabled = enabled;
}

export function isHashVerificationEnabled(): boolean {
  return hashVerificationEnabled;
}
















