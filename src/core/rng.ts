// src/core/rng.ts

export interface RNG {
  readonly seed: number;
  readonly cursor: number;
  nextFloat(): number; // [0,1)
  nextInt(maxExclusive: number): number; // [0,max)
  pick<T>(arr: readonly T[]): T | null; // null if empty
  shuffle<T>(arr: readonly T[]): T[]; // returns new array
  makeUid(prefix?: string): string; // deterministic UID
  snapshot(): { seed: number; cursor: number; uidCounter: number };
  restore(s: { seed: number; cursor: number; uidCounter?: number }): void;
}

// --- PRNG core: mulberry32 ---------------------------------------------------
// Keep internal state as uint32 (>>> 0). Checkpoint arithmetic uses the same
// truncation so restore() matches the forward stream past the float64 boundary
// (~2^53 / 0x6d2b79f5 ≈ 4,917,758 draws).
function mulberry32(a: number) {
  let state = a >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
  };
}

// Simple string/number -> 32-bit seed
function toSeed(v: number | string | bigint): number {
  if (typeof v === "number" && Number.isFinite(v)) return v >>> 0;
  if (typeof v === "bigint") return Number(v & 0xffffffffn) >>> 0;
  const s = String(v);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class MulberryRNG implements RNG {
  private _seed: number;
  private _cursor: number;
  private _gen: () => number;

  // P1-1 FIX: Checkpoint cache for O(1) restore during MCTS rollbacks
  private static readonly CHECKPOINT_INTERVAL = 1000;
  private _checkpoints: Map<number, number> = new Map(); // cursor -> internal state (seed offset)
  private _uidCounter: number = 0; // PERF: Monotonic UID counter (faster than RNG)

  constructor(seedLike: number | string | bigint) {
    this._seed = toSeed(seedLike);
    this._cursor = 0;
    this._uidCounter = 0; // PERF: Monotonic UID counter
    this._gen = mulberry32(this._seed);
    // Store initial checkpoint
    this._checkpoints.set(0, this._seed);
  }

  get seed() {
    return this._seed;
  }
  get cursor() {
    return this._cursor;
  }

  nextFloat(): number {
    const r = this._gen();
    this._cursor++;

    // P1-1 FIX: Auto-checkpoint at intervals for fast restore
    if (this._cursor % MulberryRNG.CHECKPOINT_INTERVAL === 0) {
      // Internal state after N calls is (seed + N * 0x6d2b79f5) >>> 0
      this._checkpoints.set(
        this._cursor,
        (this._seed + Math.imul(this._cursor, 0x6d2b79f5)) >>> 0,
      );
    }

    return r;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  pick<T>(arr: readonly T[]): T | null {
    if (!arr || arr.length === 0) return null;
    const idx = this.nextInt(arr.length);
    return arr[idx] ?? null;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const copy = [...arr];
    const n = copy.length;
    for (let i = n - 1; i > 0; i--) {
      const j = this.nextInt(i + 1); // 0 inclusive, i+1 exclusive (so 0 to i)
      const temp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = temp;
    }
    return copy;
  }

  // PERF: Monotonic counter instead of RNG-based UID generation
  makeUid(prefix = "uid_"): string {
    return prefix + (++this._uidCounter).toString(36);
  }

  snapshot() {
    return {
      seed: this._seed,
      cursor: this._cursor,
      uidCounter: this._uidCounter,
    };
  }

  restore(s: { seed: number; cursor: number; uidCounter?: number }): void {
    // Checkpoints were computed under the previous seed — drop them on seed change
    if (s.seed !== this._seed) {
      this._checkpoints.clear();
      this._checkpoints.set(0, s.seed >>> 0);
    }

    this._seed = s.seed >>> 0;
    this._uidCounter = s.uidCounter ?? 0; // Restore UID counter for determinism

    // P1-1 FIX: Use checkpoints for O(1) restore when possible
    // Find the nearest checkpoint at or before the target cursor
    let nearestCheckpoint = 0;
    let nearestState = this._seed;

    for (const [cursor, checkpointState] of this._checkpoints) {
      if (cursor <= s.cursor && cursor > nearestCheckpoint) {
        nearestCheckpoint = cursor;
        nearestState = checkpointState;
      }
    }

    // Restore from nearest checkpoint
    this._gen = mulberry32(nearestState);
    this._cursor = nearestCheckpoint;

    // Fast-forward only from checkpoint (max CHECKPOINT_INTERVAL-1 iterations)
    const remaining = s.cursor - nearestCheckpoint;
    for (let i = 0; i < remaining; i++) {
      this._gen();
    }
    this._cursor = s.cursor;

    // Clear checkpoints beyond target cursor (they're now invalid)
    for (const cursor of this._checkpoints.keys()) {
      if (cursor > s.cursor) {
        this._checkpoints.delete(cursor);
      }
    }
  }
}

export function createRng(seedLike: number | string | bigint): RNG {
  return new MulberryRNG(seedLike);
}
