// src/core/rng.ts

export interface RNG {
  readonly seed: number;
  readonly cursor: number;
  nextFloat(): number; // [0,1)
  nextInt(maxExclusive: number): number; // [0,max)
  pick<T>(arr: readonly T[]): T | null; // null if empty
  shuffle<T>(arr: readonly T[]): T[]; // returns new array
  makeUid(prefix?: string): string; // deterministic UID
  snapshot(): { seed: number; cursor: number };
  restore(s: { seed: number; cursor: number }): void;
}

// --- PRNG core: mulberry32 ---------------------------------------------------
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
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

  constructor(seedLike: number | string | bigint) {
    this._seed = toSeed(seedLike);
    this._cursor = 0;
    this._gen = mulberry32(this._seed);
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

  makeUid(prefix = "uid_"): string {
    const from = 36 ** 8;
    const num = this.nextInt(from);
    return prefix + num.toString(36).padStart(8, "0");
  }

  snapshot() {
    return { seed: this._seed, cursor: this._cursor };
  }

  restore(s: { seed: number; cursor: number }): void {
    this._seed = s.seed;
    this._gen = mulberry32(this._seed);
    this._cursor = 0;
    // Fast-forward
    for (let i = 0; i < s.cursor; i++) {
      this._gen();
    }
    this._cursor = s.cursor;
  }
}

export function createRng(seedLike: number | string | bigint): RNG {
  return new MulberryRNG(seedLike);
}














