// src/core/rng.ts
import { logEvent } from "./logger.js";


// --- PRNG core: mulberry32 ---------------------------------------------------
function mulberry32(a: number) {
    return function () {
        let t = (a += 0x6D2B79F5);
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

let _rng: () => number = () => Math.random(); // Default to Math.random
let _seed: number | null = null;
let _cursor = 0;

/** Set the seed to enable deterministic mode, or null to revert to Math.random() */
export function setRNGSeed(seedLike: number | string | bigint | null | undefined): void {
    if (seedLike === null || seedLike === undefined) {
        _seed = null;
        _rng = () => Math.random();
        _cursor = 0;
        logEvent("rng", { op: "seed", seed: "auto" });
    } else {
        _seed = toSeed(seedLike);
        _rng = mulberry32(_seed);
        _cursor = 0;
        logEvent("rng", { op: "seed", seed: _seed });
    }
}

/** Legacy alias for setRNGSeed (backwards compatibility) */
export function setSeed(seedLike: number | string | bigint): void {
    setRNGSeed(seedLike);
}

/** Get the current numeric seed (or null if auto) */
export function getSeed(): number | null {
    return _seed;
}

/** Next float in [0, 1) */
export function rand(): number {
    const r = _rng();
    _cursor++;
    logEvent("rng", { value: r, cursor: _cursor });
    return r;
}

/** Integer in [0, max) */
export function randInt(max: number): number {
    if (!Number.isFinite(max) || max <= 0) return 0;
    const result = Math.floor(rand() * max);
    logEvent("rng", { op: "pick", fn: "randInt", from: max, result });
    return result;
}

/** Pick one element (or null) */
export function choice<T>(arr: T[] | null | undefined): T | null {
    if (!arr || arr.length === 0) return null;
    const poolSize = arr.length;
    const resultIdx = randInt(poolSize);
    logEvent("rng", { op: "pick", fn: "choice", from: poolSize, resultIdx });
    return arr[resultIdx];
}

/** In-place Fisher–Yates shuffle using the current RNG (or a provided rand-like fn) */
export function shuffleInPlace<T>(arr: T[], rng: () => number = rand): T[] {
    const n = arr.length;
    for (let i = n - 1; i > 0; i--) {
        const from = i + 1;
        const resultIdx = Math.floor(rng() * from);
        logEvent("rng", { op: "pick", fn: "shuffleInPlace_step", from, resultIdx });
        [arr[i], arr[resultIdx]] = [arr[resultIdx], arr[i]];
    }
    return arr;
}

/** UID generator using seeded RNG */
export function makeUid(prefix = "uid_"): string {
    const from = 36 ** 8;
    const num = randInt(from);
    logEvent("rng", { op: "pick", fn: "makeUid", from, result: num });
    return prefix + num.toString(36).padStart(8, "0");
}

/** Get current RNG state snapshot */
export function getRngSnapshot() {
    return { seed: _seed, cursor: _cursor };
}

/** Restore RNG state from snapshot */
export function setRngSnapshot(snap: any) {
    if (!snap || typeof snap.seed === "undefined") return;
    setSeed(snap.seed);
    // advance to the same cursor position
    for (let i = 0; i < (snap.cursor | 0); i++) _rng();
    _cursor = snap.cursor | 0;
}
