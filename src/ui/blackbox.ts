/**
 * Crash black-box recorder — observes heap / DOM / image-load vitals into
 * localStorage so evidence survives an OOM kill. Observation only; no game
 * behaviour changes.
 */

import { state } from "../core/gameState.js";
import { showToast } from "./toast.js";

export const BLACKBOX_RING_KEY = "svwb.blackbox.ring";
export const BLACKBOX_CLEAN_KEY = "svwb.blackbox.clean";
export const BLACKBOX_CRASH_KEY = "svwb.blackbox.crash";
export const BLACKBOX_WARN_KEY = "svwb.blackbox.warnHeap";

export const BLACKBOX_MAX_SAMPLES = 240;
/** Hard byte ceiling for the serialized ring (UTF-16-ish estimate via length*2 avoided; use UTF-8 length). */
export const BLACKBOX_MAX_BYTES = 48_000;
export const BLACKBOX_SAMPLE_MS = 5_000;
/** Flush to localStorage at most this often — localStorage is sync. */
export const BLACKBOX_FLUSH_MS = 10_000;
export const BLACKBOX_HEAP_WARN_RATIO = 0.7;

export const BLACKBOX_WARN_TOGGLE_ID = "blackboxHeapWarnToggle";
export const BLACKBOX_STATUS_ID = "blackboxStatus";
export const BLACKBOX_EXPORT_BTN_ID = "blackboxExportBtn";
export const BLACKBOX_COPY_BTN_ID = "blackboxCopyBtn";
export const BLACKBOX_HEAP_READOUT_ID = "blackboxHeapReadout";

/** Compact sample written to the ring buffer. */
export interface BlackboxSample {
  /** Monotonic ms since session start (performance.now). */
  t: number;
  /** document.getElementsByTagName("*").length */
  n: number;
  turn: number;
  round: number;
  /** Cumulative failed card-art image loads this session. */
  img: number;
  /** Chrome performance.memory — omitted when unavailable. */
  hu?: number;
  ht?: number;
  hl?: number;
}

export interface BlackboxRing {
  v: 1;
  sessionId: string;
  startedAt: number;
  samples: BlackboxSample[];
  peakNodes: number;
  peakHeap?: number;
}

export interface BlackboxCrashReport {
  detectedAt: number;
  ring: BlackboxRing;
}

type PerfMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

let sessionId = "";
let sessionStartedAt = 0;
let sessionOriginNow = 0;
let samples: BlackboxSample[] = [];
let peakNodes = 0;
let peakHeap: number | undefined;
let imgFailCount = 0;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let imageListenerBound = false;
let shutdownBound = false;
let gameWatchBound = false;
let lastCrash: BlackboxCrashReport | null = null;
let warnEnabled = false;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function byteLength(s: string): number {
  // TextEncoder is fine in modern browsers; fall back for odd hosts.
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s).length;
  }
  return s.length;
}

function readMemory(): PerfMemory | null {
  try {
    const perf = performance as Performance & { memory?: PerfMemory };
    const mem = perf.memory;
    if (
      !mem ||
      typeof mem.usedJSHeapSize !== "number" ||
      typeof mem.jsHeapSizeLimit !== "number"
    ) {
      return null;
    }
    return mem;
  } catch {
    return null;
  }
}

function countDomNodes(): number {
  try {
    return document.getElementsByTagName("*").length;
  } catch {
    return 0;
  }
}

function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildRing(): BlackboxRing {
  return {
    v: 1,
    sessionId,
    startedAt: sessionStartedAt,
    samples: samples.slice(),
    peakNodes,
    ...(peakHeap !== undefined ? { peakHeap } : {}),
  };
}

function parseRing(raw: string | null): BlackboxRing | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BlackboxRing;
    if (
      !parsed ||
      parsed.v !== 1 ||
      !Array.isArray(parsed.samples) ||
      typeof parsed.sessionId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function trimToCaps(ring: BlackboxRing): BlackboxRing {
  let next = ring.samples;
  if (next.length > BLACKBOX_MAX_SAMPLES) {
    next = next.slice(next.length - BLACKBOX_MAX_SAMPLES);
  }
  let candidate: BlackboxRing = { ...ring, samples: next };
  let serialized = JSON.stringify(candidate);
  while (
    byteLength(serialized) > BLACKBOX_MAX_BYTES &&
    candidate.samples.length > 1
  ) {
    const drop = Math.max(1, Math.floor(candidate.samples.length * 0.1));
    candidate = {
      ...candidate,
      samples: candidate.samples.slice(drop),
    };
    serialized = JSON.stringify(candidate);
  }
  // Absolute last resort: keep a single sample if still over budget.
  if (
    byteLength(serialized) > BLACKBOX_MAX_BYTES &&
    candidate.samples.length > 0
  ) {
    candidate = {
      ...candidate,
      samples: candidate.samples.slice(-1),
    };
  }
  return candidate;
}

/** Persist ring; returns serialized byte length (0 on failure). */
export function flushBlackboxRing(): number {
  if (!sessionId) return 0;
  const trimmed = trimToCaps(buildRing());
  samples = trimmed.samples;
  peakNodes = trimmed.peakNodes;
  peakHeap = trimmed.peakHeap;
  const json = JSON.stringify(trimmed);
  if (!safeSet(BLACKBOX_RING_KEY, json)) return 0;
  dirty = false;
  return byteLength(json);
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (dirty) flushBlackboxRing();
  }, BLACKBOX_FLUSH_MS);
}

function takeSample(): BlackboxSample | null {
  if (!state.gameStarted) return null;

  const mem = readMemory();
  const nodes = countDomNodes();
  const sample: BlackboxSample = {
    t: Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        sessionOriginNow,
    ),
    n: nodes,
    turn: state.turnNumber | 0,
    round: state.roundCount | 0,
    img: imgFailCount,
  };
  if (mem) {
    sample.hu = mem.usedJSHeapSize;
    sample.ht = mem.totalJSHeapSize;
    sample.hl = mem.jsHeapSizeLimit;
    if (peakHeap === undefined || mem.usedJSHeapSize > peakHeap) {
      peakHeap = mem.usedJSHeapSize;
    }
    updateHeapWarning(mem);
  }
  if (nodes > peakNodes) peakNodes = nodes;

  samples.push(sample);
  if (samples.length > BLACKBOX_MAX_SAMPLES) {
    samples = samples.slice(samples.length - BLACKBOX_MAX_SAMPLES);
  }
  dirty = true;
  scheduleFlush();
  return sample;
}

function updateHeapWarning(mem: PerfMemory): void {
  const el = document.getElementById(BLACKBOX_HEAP_READOUT_ID);
  if (!el) return;
  if (!warnEnabled || !mem.jsHeapSizeLimit) {
    el.hidden = true;
    return;
  }
  const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
  if (ratio < BLACKBOX_HEAP_WARN_RATIO) {
    el.hidden = true;
    return;
  }
  const pct = Math.round(ratio * 100);
  const usedMb = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(0);
  const limitMb = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
  el.textContent = `Heap ${pct}% (${usedMb}/${limitMb} MB)`;
  el.hidden = false;
}

function isCardArtImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || "";
  if (!src) return false;
  return (
    src.includes("static.dotgg.gg/shadowverse/cards/") ||
    /\.webp(?:\?|$)/i.test(src)
  );
}

function onImageError(ev: Event): void {
  const target = ev.target;
  if (!(target instanceof HTMLImageElement)) return;
  if (!isCardArtImage(target)) return;
  // Count each failure once per src attempt (fallback retries also count —
  // climbing failures are the signal under test).
  imgFailCount += 1;
}

function bindImageFailureListener(): void {
  if (imageListenerBound || typeof document === "undefined") return;
  document.addEventListener("error", onImageError, true);
  imageListenerBound = true;
}

function setCleanShutdown(clean: boolean): void {
  if (clean) safeSet(BLACKBOX_CLEAN_KEY, "1");
  else safeRemove(BLACKBOX_CLEAN_KEY);
}

function isCleanShutdown(): boolean {
  return safeGet(BLACKBOX_CLEAN_KEY) === "1";
}

function onPageHide(): void {
  if (dirty || samples.length > 0) flushBlackboxRing();
  setCleanShutdown(true);
}

function bindShutdownHandlers(): void {
  if (shutdownBound || typeof window === "undefined") return;
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);
  shutdownBound = true;
}

function startSampler(): void {
  if (sampleTimer !== null) return;
  // Immediate sample so a crash seconds after start still leaves evidence.
  takeSample();
  sampleTimer = setInterval(() => {
    takeSample();
  }, BLACKBOX_SAMPLE_MS);
}

function stopSampler(): void {
  if (sampleTimer !== null) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

/** Begin / reset a recording session when a game becomes active. */
export function beginBlackboxSession(): void {
  if (dirty) flushBlackboxRing();
  sessionId = newSessionId();
  sessionStartedAt = Date.now();
  sessionOriginNow =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  samples = [];
  peakNodes = 0;
  peakHeap = undefined;
  imgFailCount = 0;
  dirty = false;
  setCleanShutdown(false);
  safeRemove(BLACKBOX_RING_KEY);
  startSampler();
}

function watchGameStart(): void {
  if (gameWatchBound) return;
  gameWatchBound = true;
  let wasStarted = !!state.gameStarted;
  if (wasStarted) beginBlackboxSession();

  // Light poll — avoids coupling to every render path.
  setInterval(() => {
    const started = !!state.gameStarted;
    if (started && !wasStarted) beginBlackboxSession();
    if (!started && wasStarted) {
      stopSampler();
      if (dirty) flushBlackboxRing();
    }
    wasStarted = started;
  }, 1000);
}

function formatBytes(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "n/a";
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function refreshStatusUi(): void {
  const status = document.getElementById(BLACKBOX_STATUS_ID);
  if (!status) return;
  if (!lastCrash) {
    status.textContent = "No unexpected exit recorded.";
    status.dataset.crash = "0";
    return;
  }
  const { ring } = lastCrash;
  const peakH = formatBytes(ring.peakHeap);
  status.textContent = `Last session ended unexpectedly — peak heap ${peakH}, peak nodes ${ring.peakNodes.toLocaleString()}, ${ring.samples.length} samples.`;
  status.dataset.crash = "1";
}

function exportPayload(): string {
  const ring =
    lastCrash?.ring ??
    (sessionId ? buildRing() : parseRing(safeGet(BLACKBOX_RING_KEY)));
  return JSON.stringify(
    {
      schema: "svwb.blackbox.v1",
      exportedAt: new Date().toISOString(),
      abnormal: !!lastCrash,
      cleanShutdown: isCleanShutdown(),
      imageFailCount: imgFailCount,
      ring,
      crash: lastCrash,
    },
    null,
    2,
  );
}

async function copyExport(): Promise<boolean> {
  const text = exportPayload();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function downloadExport(): void {
  const text = exportPayload();
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `svwb-blackbox-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function detectAbnormalEnd(): BlackboxCrashReport | null {
  const ring = parseRing(safeGet(BLACKBOX_RING_KEY));
  if (!ring || ring.samples.length === 0) return null;
  if (isCleanShutdown()) return null;

  const report: BlackboxCrashReport = {
    detectedAt: Date.now(),
    ring,
  };
  safeSet(BLACKBOX_CRASH_KEY, JSON.stringify(report));
  return report;
}

function loadPersistedCrash(): BlackboxCrashReport | null {
  const raw = safeGet(BLACKBOX_CRASH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BlackboxCrashReport;
    if (!parsed?.ring?.samples?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isBlackboxHeapWarnEnabled(): boolean {
  return warnEnabled;
}

export function setBlackboxHeapWarnEnabled(on: boolean): void {
  warnEnabled = on;
  try {
    localStorage.setItem(BLACKBOX_WARN_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  const mem = readMemory();
  if (mem) updateHeapWarning(mem);
  else {
    const el = document.getElementById(BLACKBOX_HEAP_READOUT_ID);
    if (el) el.hidden = true;
  }
}

function loadWarnPref(): boolean {
  const raw = safeGet(BLACKBOX_WARN_KEY);
  return raw === "1";
}

/** Wire settings controls (call after DOM ready). */
export function wireBlackboxUi(): void {
  const warnToggle = document.getElementById(
    BLACKBOX_WARN_TOGGLE_ID,
  ) as HTMLInputElement | null;
  if (warnToggle) {
    warnToggle.checked = warnEnabled;
    warnToggle.addEventListener("change", () => {
      setBlackboxHeapWarnEnabled(warnToggle.checked);
    });
  }

  const exportBtn = document.getElementById(BLACKBOX_EXPORT_BTN_ID);
  exportBtn?.addEventListener("click", () => {
    downloadExport();
    showToast("Black box exported", 1600);
  });

  const copyBtn = document.getElementById(BLACKBOX_COPY_BTN_ID);
  copyBtn?.addEventListener("click", () => {
    void copyExport().then((ok) => {
      showToast(ok ? "Black box copied" : "Copy failed", 1600);
    });
  });

  refreshStatusUi();
}

/**
 * Boot entry: detect prior abnormal end, bind listeners, watch for game start.
 */
export function initBlackbox(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  warnEnabled = loadWarnPref();
  bindImageFailureListener();
  bindShutdownHandlers();

  const detected = detectAbnormalEnd();
  lastCrash = detected ?? loadPersistedCrash();

  if (detected) {
    const peakH = formatBytes(detected.ring.peakHeap);
    showToast(
      `Last session ended unexpectedly (peak heap ${peakH}, nodes ${detected.ring.peakNodes.toLocaleString()}). Details in Settings.`,
      5200,
    );
  }

  // Fresh boot after detection: leave ring in place until a new session
  // overwrites it, but mark clean so a soft reload without playing does not
  // re-fire the notice forever. Crash snapshot remains in BLACKBOX_CRASH_KEY.
  if (detected) setCleanShutdown(true);

  watchGameStart();
  wireBlackboxUi();
  refreshStatusUi();
}

/** Test / QA helpers */
export function _getBlackboxImageFailCount(): number {
  return imgFailCount;
}

export function _recordBlackboxImageFailureForTest(): void {
  imgFailCount += 1;
}

export function _getBlackboxSamples(): BlackboxSample[] {
  return samples.slice();
}

export function _getBlackboxPeakNodes(): number {
  return peakNodes;
}

export function _forceBlackboxSampleForTest(): BlackboxSample | null {
  return takeSample();
}

export function _flushBlackboxForTest(): number {
  return flushBlackboxRing();
}

export function _resetBlackboxForTests(): void {
  stopSampler();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  sessionId = "";
  sessionStartedAt = 0;
  sessionOriginNow = 0;
  samples = [];
  peakNodes = 0;
  peakHeap = undefined;
  imgFailCount = 0;
  dirty = false;
  lastCrash = null;
  warnEnabled = false;
  safeRemove(BLACKBOX_RING_KEY);
  safeRemove(BLACKBOX_CLEAN_KEY);
  safeRemove(BLACKBOX_CRASH_KEY);
  safeRemove(BLACKBOX_WARN_KEY);
}

export function _setLastCrashForTest(report: BlackboxCrashReport | null): void {
  lastCrash = report;
  refreshStatusUi();
}

export function _exportBlackboxForTest(): string {
  return exportPayload();
}

export function _simulateAbnormalPersistForTest(ring: BlackboxRing): void {
  const trimmed = trimToCaps(ring);
  safeSet(BLACKBOX_RING_KEY, JSON.stringify(trimmed));
  safeRemove(BLACKBOX_CLEAN_KEY);
}

export function getBlackboxLastCrash(): BlackboxCrashReport | null {
  return lastCrash;
}

export function getBlackboxRingByteLength(): number {
  const raw = safeGet(BLACKBOX_RING_KEY);
  return raw ? byteLength(raw) : 0;
}

/** Pure helper exported for unit tests — trim ring to caps. */
export function trimBlackboxRing(ring: BlackboxRing): BlackboxRing {
  return trimToCaps(ring);
}
