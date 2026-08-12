import { createRng } from "../core/rng.js";
import {
  applyMulliganInPlace,
  fillIdentity,
  policyMulliganIndices,
  shuffleRangeInPlace,
} from "./drawSim.js";
import type {
  Condition,
  ConsistencyConfig,
  ConsistencyResult,
  MulliganPolicy,
  SimCard,
} from "./types.js";
import { OPENING_HAND_SIZE } from "./types.js";

/**
 * Fast Monte Carlo over shuffles + draws only.
 *
 * Per iteration:
 * 1. Shuffle deck indices in a reusable buffer
 * 2. Opening 4, apply mulligan policy (returned cards reshuffled into library)
 * 3. Draw one per turn through `turnHorizon`
 * 4. Track whether `condition` holds after opening and after each turn draw
 *
 * Seat (play/draw) does not change draw counts in Worlds Beyond — both players
 * draw 1 on their first turn. The seat field is recorded for UI/context;
 * Bonus PP affects tempo only and is not modelled here.
 */
export function runConsistency(
  deck: readonly SimCard[],
  condition: Condition,
  config: ConsistencyConfig,
): ConsistencyResult {
  const deckLen = deck.length;
  if (deckLen === 0) {
    throw new Error("runConsistency: empty deck");
  }
  if (config.turnHorizon < 1) {
    throw new Error("runConsistency: turnHorizon must be >= 1");
  }
  if (config.iterations < 1) {
    throw new Error("runConsistency: iterations must be >= 1");
  }

  const rng = createRng(config.seed);
  const keys = deck.map((c) => c.key);
  const costs = new Int16Array(deckLen);
  for (let i = 0; i < deckLen; i++) costs[i] = deck[i]!.cost;

  // Intern condition card keys / costs for fast hot-loop checks
  const checker = compileCondition(condition, keys, costs);

  const buf = new Int32Array(deckLen);
  const scratch = new Int32Array(deckLen);
  const handSlots = new Array<number>(OPENING_HAND_SIZE);

  const hitOpening = { n: 0 };
  const hitByTurn = new Int32Array(config.turnHorizon + 1);

  const t0 =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  for (let iter = 0; iter < config.iterations; iter++) {
    fillIdentity(buf, deckLen);
    shuffleRangeInPlace(buf, 0, deckLen, rng);

    for (let i = 0; i < OPENING_HAND_SIZE; i++) handSlots[i] = buf[i]!;

    const mullIdx = policyMulliganIndices(handSlots, keys, config.mulligan);
    if (mullIdx.length > 0) {
      applyMulliganInPlace(
        buf,
        deckLen,
        OPENING_HAND_SIZE,
        mullIdx,
        rng,
        scratch,
      );
    }

    checker.reset();
    for (let i = 0; i < OPENING_HAND_SIZE; i++) {
      checker.add(buf[i]!);
    }
    if (checker.satisfied()) hitOpening.n++;

    for (let turn = 1; turn <= config.turnHorizon; turn++) {
      const di = OPENING_HAND_SIZE + turn - 1;
      if (di < deckLen) checker.add(buf[di]!);
      if (checker.satisfied()) hitByTurn[turn]!++;
    }
  }

  const t1 =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  const probabilityByTurn: number[] = new Array(config.turnHorizon + 1).fill(0);
  for (let turn = 1; turn <= config.turnHorizon; turn++) {
    probabilityByTurn[turn] = hitByTurn[turn]! / config.iterations;
  }

  return {
    seed: rng.seed,
    iterations: config.iterations,
    turnHorizon: config.turnHorizon,
    probabilityByTurn,
    probabilityOpening: hitOpening.n / config.iterations,
    elapsedMs: t1 - t0,
  };
}

/** Precompile condition into a mutable counter checker for the hot loop. */
function compileCondition(
  condition: Condition,
  keys: readonly string[],
  costs: Int16Array,
): { reset(): void; add(deckIndex: number): void; satisfied(): boolean } {
  // Flatten to leaf matchers with running counts
  type Leaf =
    | { kind: "cards"; mask: Uint8Array; need: number; have: number }
    | { kind: "costs"; costSet: Set<number>; need: number; have: number };

  const leaves: Leaf[] = [];
  type Node =
    | { kind: "leaf"; i: number }
    | { kind: "and"; kids: Node[] }
    | { kind: "or"; kids: Node[] };

  function build(c: Condition): Node {
    if (c.kind === "and") return { kind: "and", kids: c.of.map(build) };
    if (c.kind === "or") return { kind: "or", kids: c.of.map(build) };
    if (c.kind === "cards") {
      const keySet = new Set(c.keys);
      const mask = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) {
        if (keySet.has(keys[i]!)) mask[i] = 1;
      }
      const i = leaves.length;
      leaves.push({ kind: "cards", mask, need: c.atLeast, have: 0 });
      return { kind: "leaf", i };
    }
    // costs
    const i = leaves.length;
    leaves.push({
      kind: "costs",
      costSet: new Set(c.costs),
      need: c.atLeast,
      have: 0,
    });
    return { kind: "leaf", i };
  }

  const root = build(condition);

  function evalNode(n: Node): boolean {
    if (n.kind === "leaf") {
      const leaf = leaves[n.i]!;
      return leaf.have >= leaf.need;
    }
    if (n.kind === "and") return n.kids.every(evalNode);
    return n.kids.some(evalNode);
  }

  return {
    reset() {
      for (const leaf of leaves) leaf.have = 0;
    },
    add(deckIndex: number) {
      for (const leaf of leaves) {
        if (leaf.kind === "cards") {
          if (leaf.mask[deckIndex]) leaf.have++;
        } else if (leaf.costSet.has(costs[deckIndex]!)) {
          leaf.have++;
        }
      }
    },
    satisfied() {
      return evalNode(root);
    },
  };
}

/** Convenience: run with an explicit keep-list policy. */
export function keepListPolicy(keepKeys: readonly string[]): MulliganPolicy {
  return { kind: "keep_list", keepKeys };
}

export function keepAllPolicy(): MulliganPolicy {
  return { kind: "keep_all" };
}
