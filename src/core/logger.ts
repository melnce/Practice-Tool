// src/core/logger.ts
import { state } from "./gameState.js";

/* =========================
   Stable stringify + hash
   ========================= */

const STRIP_KEYS = new Set([
  // UI/ephemeral flags that shouldn't affect game logic
  "__mulliganSelectable",
  "__mulliganSelected",
  "__dragging",
  "__hover",
  "__glow",
  "__ui",
  "potential_attack",
  "potential_defense",
  "_death_snapshot",
  "draggingId",
  "dropTargetId",
  "element",
  "el",
  "dom",
]);

function isPlainObject(v: any): boolean {
  return (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof Set) &&
    !(v instanceof Map) &&
    !(v instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(v)
  );
}

function normalizeForStable(value: any, seen: WeakSet<object>): any {
  if (value == null) return value;

  // Avoid cycles
  if (typeof value === "object" || typeof value === "function") {
    if (seen.has(value)) return "[[CYCLE]]";
    seen.add(value);
  }

  const t = typeof value;
  if (t === "function") return undefined; // drop
  if (t === "bigint") return value.toString(); // keep deterministically
  if (value instanceof Date) return value.toISOString();

  // Typed arrays → normal arrays
  if (ArrayBuffer.isView(value)) return Array.from(value as any);

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  if (Array.isArray(value)) {
    return value.map((v) => normalizeForStable(v, seen));
  }

  if (value instanceof Set) {
    // sets serialized in sorted order for determinism
    const arr = Array.from(value).map((v) => normalizeForStable(v, seen));
    try {
      arr.sort();
    } catch {
      void 0;
    }
    return { "~~set": arr };
  }

  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    const entries = Array.from(value.entries()).map(([k, v]) => [
      String(k),
      normalizeForStable(v, seen),
    ]);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [k, v] of entries) obj[k] = v;
    return { "~~map": obj };
  }

  if (isPlainObject(value)) {
    const out: Record<string, any> = {};
    const keys = Object.keys(value)
      .filter((k) => !STRIP_KEYS.has(k))
      .sort();
    for (const k of keys) {
      const v = normalizeForStable(value[k], seen);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // Primitive (number/string/boolean)
  return value;
}

function stableStringify(obj: any): string {
  const normalized = normalizeForStable(obj, new WeakSet());
  return JSON.stringify(normalized);
}

/* ------------- Hashing ------------- */

// Fallback 64-bit FNV-1a (hex) for non-secure contexts
function fnv1a64Hex(str: string): string {
  let h1 = 0xcbf29ce4 ^ 0; // low 32
  let h2 = 0x84222325 ^ 0; // high 32 (arbitrary offset continuation)
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; // xor into low
    // 64-bit multiply by FNV prime (0x100000001B3)
    // (emulated via 32-bit parts)
    const low = (h1 * 0x1b3) >>> 0;
    const high = (h2 * 0x1b3 + (((h1 * 0x1b3) / 2 ** 32) >>> 0)) >>> 0;
    h1 = low;
    h2 = high;
  }
  const toHex = (n: number) => n.toString(16).padStart(8, "0");
  return toHex(h2) + toHex(h1);
}

async function sha256Hex(str: string): Promise<string> {
  // Use WebCrypto if available; otherwise fallback to FNV-1a
  try {
    if (crypto?.subtle) {
      const data = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* fall through */
  }
  return fnv1a64Hex(str);
}

/* =========================
   Public Logger API
   ========================= */

let _id = 0;
let _mirrorToConsole = true;
let _sessionTag: string | null = null;
let _maxEntries = 10000; // safety cap
const _log: any[] = [];

/**
 * Compute a deterministic hash of the current game state.
 * Exposed in case you need ad-hoc checks.
 */
export async function computeStateHash(): Promise<string> {
  const json = stableStringify(state);
  return await sha256Hex(json);
}

/**
 * Append a log entry. Non-blocking: pushes immediately, fills hash when ready.
 * @param {string} type  Short label ("rng","play","attack","trigger","death","turn", etc.)
 * @param {object} details  Small, JSON-serializable details payload.
 * @returns {number} entry id
 */
export function logEvent(type: string, details: any = {}): number | undefined {
  if ((globalThis as any).HEADLESS) return; // <-- Add this line to silence logs in headless mode
  const id = ++_id;

  // Basic metadata snapshot (cheap)
  const meta = {
    id,
    ts: Date.now(),
    type,
    session: _sessionTag || null,
    turn: state.roundCount ?? 0,
    activePlayer: state.activePlayer ?? "first",
  };

  // Create shell entry immediately
  const entry = { ...meta, details, stateHash: null as string | null };
  _log.push(entry);

  // Enforce cap
  if (_log.length > _maxEntries) _log.splice(0, _log.length - _maxEntries);

  // Fill hash asynchronously and mirror to console when ready
  void computeStateHash().then((h) => {
    entry.stateHash = h;
    if (_mirrorToConsole) {
      // Compact log line for readability; expand entry for full object
      console.log(
        `[LOG #${id}] ${type} | turn=${meta.turn} owner=${meta.activePlayer} | hash=${h}`,
        entry,
      );
    }
  });

  return id;
}

/** Get a shallow copy of all log entries. */
export function getLogs(): any[] {
  return _log.slice();
}

/** Clear the in-memory log. */
export function clearLogs(): void {
  _log.length = 0;
}

/** Set a short tag for this run (e.g., seed, deck names). */
export function setSessionTag(tag: string): void {
  _sessionTag = String(tag || "");
}

/** Mirror entries to console (default: true). */
export function setConsoleMirroring(enabled: boolean): void {
  _mirrorToConsole = !!enabled;
}

/** Cap the number of kept entries (older entries are dropped). */
export function setMaxLogEntries(n: number): void {
  if (Number.isFinite(n) && n > 0) _maxEntries = n | 0;
}

/** Download logs as JSON (for repro / bug reports). */
export function downloadLogs(filename = "game_log.json"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob(
    [JSON.stringify({ session: _sessionTag, log: _log }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/* Optional: expose helpers to window for quick debugging */
if (typeof window !== "undefined") {
  (window as any)._gameLog = _log;
  (window as any).downloadGameLog = downloadLogs;
  (window as any).clearGameLog = clearLogs;
  (window as any).computeStateHash = computeStateHash;
  (window as any).setGameLogSession = setSessionTag;
}














