import { GameState, PlayerAction } from "../../core/types/index.js";
import { EffectTraceEvent, createArrayTrace } from "./effects/trace.js";

// We will use PlayerAction as the Action type
type Action = PlayerAction;

// --- 1. Types ---

export interface ReplayCapsule {
  version: string;
  seed: number;
  initial: { stateHash: string };
  actions: readonly Action[];
  trace: readonly EffectTraceEvent[];
  final: { stateHash: string };
}

export interface ReplayConfig {
  version: string;
  seed: number;
  actions: readonly Action[];
  // Initial state creator.
  // If not provided, the runner assumes the caller has already set up the global state
  // or provides a way to reset it.
  // However, strictly following the prompt: "init?: (seed: number) => GameState"
  init?: (seed: number) => GameState;

  // The engine's action dispatcher. Must be injected to avoid circular deps.
  // It takes the current state and an action, applies it, and returns the (possibly mutated) state.
  applyAction: (
    state: GameState,
    action: Action,
    traceCtx?: { trace: ReturnType<typeof createArrayTrace>["sink"] },
  ) => GameState;

  traceDepth?: boolean;
}

// --- 2. Stable Hashing (FNV-1a) ---

const FNV_OFFSET_BASIS_32 = 2166136261;
const FNV_PRIME_32 = 16777619;

function fnv1a(str: string): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  return hash >>> 0;
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  // Object: sort keys
  const keys = Object.keys(obj).sort();
  const parts = keys
    .map((k) => {
      const val = obj[k];
      // Skip undefined to match JSON behavior (mostly) or include explicitly?
      // JSON.stringify skips undefined values in objects.
      if (val === undefined) return "";
      return JSON.stringify(k) + ":" + stableStringify(val);
    })
    .filter((p) => p !== "");

  return "{" + parts.join(",") + "}";
}

export function computeStateHash(gameState: GameState): string {
  // We hash specific critical slices of state to avoid enormous strings if possible,
  // or we hash the whole thing if it's reasonable. For safety and completeness,
  // we'll hash the structured shape.

  // To avoid circular structures or irrelevant UI state, we might select fields.
  // For this generic implementation, we assume GameState is largely data.
  // If GameState has methods or circular refs, this will fail.
  // Assuming GameState types define data-data.

  // We'll strip known non-serializable or noisy fields if necessary.
  // For now, stableStringify everything.
  const str = stableStringify(gameState);
  const hash = fnv1a(str);
  return hash.toString(16);
}

// --- 3. Runner ---

/**
 * Deterministic Replay Runner.
 *
 * Usage Example:
 * ```ts
 * import { runWithReplay } from "./replay.js";
 * import { dispatchAction } from "../../mainDispatch.js"; // your engine
 * import { resetGameState } from "../../../core/gameState.js";
 *
 * const capsule = runWithReplay({
 *   version: "1.0.0",
 *   seed: 12345,
 *   actions: myActions,
 *   init: (seed) => resetGameState({ seed }), // ensure this returns/sets state
 *   applyAction: (s, a, ctx) => {
 *      // ensure your dispatcher can accept the trace sink in context!
 *      // if dispatchAction uses runEffects, pass { trace: ctx?.trace } to it.
 *      return dispatchAction(s, a, { trace: ctx?.trace });
 *   }
 * });
 * ```
 */
export function runWithReplay(cfg: ReplayConfig): ReplayCapsule {
  // 1. Initialize State
  let currentState: GameState;
  if (cfg.init) {
    currentState = cfg.init(cfg.seed);
  } else {
    // Fallback: If no init provided, we assumes the user has set up state externally
    // OR we might throw. The prompt suggests wrapping "resetGameState".
    // Use a safe default if possible, or demand init.
    // We'll assume the caller *must* provide init to be safe about seeding logic.
    throw new Error(
      "[Replay] 'init' function is required to ensure correct seeding.",
    );
  }

  const initialHash = computeStateHash(currentState);

  // 2. Setup Trace
  const { sink, events } = createArrayTrace();

  // 3. Apply Actions
  for (const action of cfg.actions) {
    // The applyAction wrapper is responsible for plumbing the sink into the engine.
    currentState = cfg.applyAction(currentState, action, { trace: sink });
  }

  const finalHash = computeStateHash(currentState);

  return {
    version: cfg.version,
    seed: cfg.seed,
    initial: { stateHash: initialHash },
    actions: cfg.actions,
    trace: events,
    final: { stateHash: finalHash },
  };
}















