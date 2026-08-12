import type { RNG } from "../core/rng.js";
import { createRng } from "../core/rng.js";
import { isKeepKey } from "./mulliganPolicy.js";
import type { MulliganPolicy, SimCard } from "./types.js";
import { OPENING_HAND_SIZE } from "./types.js";

/**
 * Fisher–Yates shuffle of `buf[0..len)` in place using rng.nextInt.
 * Reuses the buffer — no per-call allocations.
 */
export function shuffleRangeInPlace(
  buf: Int32Array,
  start: number,
  end: number,
  rng: RNG,
): void {
  for (let i = end - 1; i > start; i--) {
    const j = start + rng.nextInt(i - start + 1);
    const tmp = buf[i]!;
    buf[i] = buf[j]!;
    buf[j] = tmp;
  }
}

/** Fill buf with 0..n-1 identity permutation. */
export function fillIdentity(buf: Int32Array, n: number): void {
  for (let i = 0; i < n; i++) buf[i] = i;
}

/**
 * Apply a one-time mulligan on an index buffer.
 *
 * Layout: buf[0..handSize) = hand, buf[handSize..deckLen) = library.
 * Mulliganed hand cards are shuffled back into the library and replaced
 * (bible: Match Flow — "shuffled back and replaced with new draws").
 *
 * Mutates `buf`. Uses `scratch` (length >= deckLen) to avoid overlapping copies.
 * Returns the number of cards mulliganed.
 */
export function applyMulliganInPlace(
  buf: Int32Array,
  deckLen: number,
  handSize: number,
  mulliganHandIndices: readonly number[],
  rng: RNG,
  scratch: Int32Array,
): number {
  if (mulliganHandIndices.length === 0) return 0;

  const mullSet = new Set(mulliganHandIndices);
  let keepCount = 0;
  const mullIds: number[] = [];
  for (let i = 0; i < handSize; i++) {
    const id = buf[i]!;
    if (mullSet.has(i)) mullIds.push(id);
    else scratch[keepCount++] = id;
  }

  let w = keepCount;
  for (let i = handSize; i < deckLen; i++) {
    scratch[w++] = buf[i]!;
  }
  for (const id of mullIds) scratch[w++] = id;

  shuffleRangeInPlace(scratch, keepCount, deckLen, rng);

  for (let i = 0; i < deckLen; i++) buf[i] = scratch[i]!;
  return mullIds.length;
}

/**
 * Build mulligan hand-indices for a keep_list / keep_all policy given
 * the current hand slot contents (deck indices) and card key table.
 */
export function policyMulliganIndices(
  handDeckIndices: readonly number[],
  keys: readonly string[],
  policy: MulliganPolicy,
): number[] {
  if (policy.kind === "keep_all") return [];
  const out: number[] = [];
  for (let i = 0; i < handDeckIndices.length; i++) {
    const di = handDeckIndices[i]!;
    const key = keys[di]!;
    if (!isKeepKey(key, policy)) out.push(i);
  }
  return out;
}

/**
 * Resolve a drill deal: shuffle once, take opening hand.
 */
export function dealOpening(
  deck: readonly SimCard[],
  seed: number | string,
): { seed: number; order: SimCard[]; opening: SimCard[]; rng: RNG } {
  const rng = createRng(seed);
  const n = deck.length;
  const buf = new Int32Array(n);
  fillIdentity(buf, n);
  shuffleRangeInPlace(buf, 0, n, rng);
  const order = Array.from(buf, (i) => deck[i]!);
  const opening = order.slice(0, OPENING_HAND_SIZE);
  return { seed: rng.seed, order, opening, rng };
}

/**
 * After an opening deal with known order and RNG cursor, apply a mulligan
 * (reshuffling returned cards into the remaining library) and draw `turns` cards.
 * `keepHandIndices` are opening-hand slots the player keeps.
 */
export function resolvePathFromOrder(
  order: readonly SimCard[],
  keepHandIndices: readonly number[],
  turns: number,
  rng: RNG,
): { hand: SimCard[]; draws: SimCard[]; seen: SimCard[] } {
  const n = order.length;
  const buf = new Int32Array(n);
  fillIdentity(buf, n);
  const scratch = new Int32Array(n);

  const mull: number[] = [];
  for (let i = 0; i < OPENING_HAND_SIZE; i++) {
    if (!keepHandIndices.includes(i)) mull.push(i);
  }

  if (mull.length > 0) {
    applyMulliganInPlace(buf, n, OPENING_HAND_SIZE, mull, rng, scratch);
  }

  const hand = Array.from(
    { length: OPENING_HAND_SIZE },
    (_, i) => order[buf[i]!]!,
  );
  const draws: SimCard[] = [];
  for (let t = 0; t < turns; t++) {
    const idx = OPENING_HAND_SIZE + t;
    if (idx >= n) break;
    draws.push(order[buf[idx]!]!);
  }
  return { hand, draws, seen: [...hand, ...draws] };
}

/** Keep-all path: no reshuffle; draws are the next cards in the initial order. */
export function resolveKeepAllPath(
  order: readonly SimCard[],
  turns: number,
): { hand: SimCard[]; draws: SimCard[]; seen: SimCard[] } {
  const hand = order.slice(0, OPENING_HAND_SIZE);
  const draws = order.slice(OPENING_HAND_SIZE, OPENING_HAND_SIZE + turns);
  return { hand, draws, seen: [...hand, ...draws] };
}
