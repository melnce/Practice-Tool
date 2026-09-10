// src/bench/trace/rngRecorder.ts — roll-identical RNG recording wrapper

import type { RNG } from "../../core/rng.js";
import type { CardInstance } from "../../core/types/index.js";
import type { RawRoll } from "./types.js";

const SKIP_STACK_PREFIXES = [
  "src/bench/trace/",
  "src/core/rng.ts",
  "node:",
  "node:internal",
];

function captureCallSite(): string {
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n");
  for (const line of lines) {
    const m = line.match(/(?:at\s+)?(?:.*\s+\()?([^():]+):(\d+):(\d+)\)?/);
    if (!m) continue;
    const file = m[1]!;
    if (SKIP_STACK_PREFIXES.some((p) => file.includes(p))) continue;
    if (!file.includes("src/")) continue;
    const short = file.includes("/workspace/")
      ? file.split("/workspace/")[1]!
      : file.replace(/^.*\/(src\/)/, "$1");
    return `${short}:${m[2]}`;
  }
  return "unknown:0";
}

function cardPickIdentity(card: CardInstance): {
  uid: string;
  card: string;
  zone: string;
  slot?: number;
} {
  const zone = card.zone ?? "unknown";
  const out: { uid: string; card: string; zone: string; slot?: number } = {
    uid: card.uid,
    card: String(card.id),
    zone,
  };
  if (zone === "board" && card.owner) {
    // slot resolved lazily by consumer if needed
  }
  return out;
}

function pickChoseIdentity(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  const card = value as CardInstance;
  if (card.uid && card.id != null) {
    return cardPickIdentity(card);
  }
  if ("index" in (value as object) && "opt" in (value as object)) {
    const entry = value as { index: number; opt: unknown };
    return { mode: entry.index, opt: entry.opt };
  }
  return value;
}

function shuffleOrder(arr: readonly unknown[]): unknown {
  return arr.map((el) => {
    if (el && typeof el === "object" && "id" in (el as object)) {
      return String((el as CardInstance).id);
    }
    return el;
  });
}

export type RecordingRng = {
  rng: RNG;
  getRolls: () => RawRoll[];
  clearRolls: () => void;
};

export function createRecordingRng(inner: RNG): RecordingRng {
  const rolls: RawRoll[] = [];

  const rng: RNG = {
    get seed() {
      return inner.seed;
    },
    get cursor() {
      return inner.cursor;
    },
    nextFloat(): number {
      const site = captureCallSite();
      const v = inner.nextFloat();
      rolls.push({ m: "nextFloat", site, v });
      return v;
    },
    nextInt(maxExclusive: number): number {
      const site = captureCallSite();
      const n = inner.nextInt(maxExclusive);
      rolls.push({ m: "nextInt", n, k: maxExclusive, site });
      return n;
    },
    pick<T>(arr: readonly T[]): T | null {
      const site = captureCallSite();
      const k = arr?.length ?? 0;
      const chosen = inner.pick(arr);
      const n = chosen == null ? 0 : arr.findIndex((x) => Object.is(x, chosen));
      rolls.push({
        m: "pick",
        n: n < 0 ? 0 : n,
        k,
        site,
        chose: pickChoseIdentity(chosen),
      });
      return chosen;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const site = captureCallSite();
      const out = inner.shuffle(arr);
      rolls.push({
        m: "shuffle",
        n: arr.length,
        site,
        order: shuffleOrder(out),
      });
      return out;
    },
    makeUid(prefix?: string): string {
      return inner.makeUid(prefix);
    },
    snapshot() {
      return inner.snapshot();
    },
    restore(s) {
      inner.restore(s);
    },
  };

  return {
    rng,
    getRolls: () => rolls.slice(),
    clearRolls: () => {
      rolls.length = 0;
    },
  };
}

let installedInner: RNG | null = null;
let activeRecorder: RecordingRng | null = null;

/** Wrap state.rng for tracing. No-op when disabled. */
export function installTraceRng(state: { rng: RNG }): RecordingRng | null {
  if (activeRecorder) return activeRecorder;
  installedInner = state.rng;
  activeRecorder = createRecordingRng(installedInner);
  state.rng = activeRecorder.rng;
  return activeRecorder;
}

export function uninstallTraceRng(state: { rng: RNG }): void {
  if (!activeRecorder || !installedInner) return;
  state.rng = installedInner;
  installedInner = null;
  activeRecorder = null;
}

export function getActiveRecorder(): RecordingRng | null {
  return activeRecorder;
}
