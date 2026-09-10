// src/bench/trace/rngRecorder.ts — roll-identical RNG recording wrapper

import type { RNG } from "../../core/rng.js";
import { getBoard } from "../../core/playerHelpers.js";
import type { CardInstance, GameState, Player } from "../../core/types/index.js";
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

function toNum(v: unknown): number {
  return typeof v === "number" ? v : v == null ? 0 : +v;
}

/** Matches cleanup.ts pending-death sweep: skip cards about to leave the board. */
function boardCardSurvives(c: CardInstance): boolean {
  if (!c || typeof c !== "object") return false;
  if ((c as { pendingDestruction?: boolean }).pendingDestruction) return false;
  if (c.type === "Follower" && toNum(c.defense) <= 0) return false;
  if (c.type === "Amulet" && c.hasCountdown && toNum(c.countdown) <= 0) {
    return false;
  }
  return true;
}

function liveBoardSlot(
  gameState: GameState,
  card: CardInstance,
): { owner: Player; slot: number } | null {
  const owner = card.owner;
  if (!owner) return null;
  const board = getBoard(gameState, owner);
  let slot = 0;
  for (const c of board) {
    if (!c) continue;
    if (!boardCardSurvives(c)) continue;
    if (c.uid === card.uid) return { owner, slot };
    slot++;
  }
  return null;
}

function cardPickIdentity(
  card: CardInstance,
  gameState: GameState | null,
): {
  uid: string;
  card: string;
  zone: string;
  slot?: number;
  owner?: Player;
} {
  const zone = card.zone ?? "unknown";
  const out: {
    uid: string;
    card: string;
    zone: string;
    slot?: number;
    owner?: Player;
  } = {
    uid: card.uid,
    card: String(card.id),
    zone,
  };
  if (zone === "board" && gameState) {
    const loc = liveBoardSlot(gameState, card);
    if (loc) {
      out.slot = loc.slot;
      out.owner = loc.owner;
    }
  }
  return out;
}

function pickChoseIdentity(
  value: unknown,
  gameState: GameState | null,
): unknown {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  const card = value as CardInstance;
  if (card.uid && card.id != null) {
    return cardPickIdentity(card, gameState);
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
  recordDraw: (cardId: string) => void;
  recordDeckPick: (cardId: string) => void;
};

export function createRecordingRng(
  inner: RNG,
  getState?: () => GameState | null,
): RecordingRng {
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
        chose: pickChoseIdentity(chosen, getState?.() ?? null),
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
    recordDraw(cardId: string) {
      rolls.push({ m: "draw", card: cardId });
    },
    recordDeckPick(cardId: string) {
      rolls.push({ m: "deck_pick", card: cardId });
    },
  };
}

let installedInner: RNG | null = null;
let installedState: GameState | null = null;
let activeRecorder: RecordingRng | null = null;

/** Wrap state.rng for tracing. No-op when disabled. */
export function installTraceRng(state: GameState): RecordingRng | null {
  if (activeRecorder) return activeRecorder;
  installedInner = state.rng;
  installedState = state;
  activeRecorder = createRecordingRng(installedInner, () => installedState);
  state.rng = activeRecorder.rng;
  return activeRecorder;
}

export function uninstallTraceRng(state: { rng: RNG }): void {
  if (!activeRecorder || !installedInner) return;
  state.rng = installedInner;
  installedInner = null;
  installedState = null;
  activeRecorder = null;
}

export function getActiveRecorder(): RecordingRng | null {
  return activeRecorder;
}

export function recordTraceDrawRoll(cardId: string): void {
  activeRecorder?.recordDraw(cardId);
}

export function recordTraceDeckPickRoll(cardId: string): void {
  activeRecorder?.recordDeckPick(cardId);
}
