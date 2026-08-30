/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../fixtures/setup.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  BLACKBOX_CLEAN_KEY,
  BLACKBOX_CRASH_KEY,
  BLACKBOX_MAX_BYTES,
  BLACKBOX_MAX_SAMPLES,
  BLACKBOX_RING_KEY,
  beginBlackboxSession,
  getBlackboxLastCrash,
  getBlackboxRingByteLength,
  initBlackbox,
  trimBlackboxRing,
  _exportBlackboxForTest,
  _flushBlackboxForTest,
  _forceBlackboxSampleForTest,
  _getBlackboxImageFailCount,
  _getBlackboxSamples,
  _resetBlackboxForTests,
  _simulateAbnormalPersistForTest,
  type BlackboxRing,
  type BlackboxSample,
} from "../../src/ui/blackbox.js";

function setupDom(): void {
  document.body.innerHTML = `
    <p id="blackboxStatus" data-crash="0">No unexpected exit recorded.</p>
    <button id="blackboxCopyBtn" type="button">Copy Trace</button>
    <button id="blackboxExportBtn" type="button">Export Trace</button>
    <input type="checkbox" id="blackboxHeapWarnToggle" />
    <div id="blackboxHeapReadout" hidden></div>
  `;
}

function makeSample(i: number): BlackboxSample {
  return {
    t: i * 5000,
    n: 1000 + i,
    turn: i,
    round: Math.max(1, Math.floor(i / 2)),
    img: 0,
    rm: 0,
    rms: 0,
    rmn: 0,
    gp: 1,
    hu: 10_000_000 + i,
    ht: 20_000_000,
    hl: 100_000_000,
  };
}

describe("blackbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).HEADLESS = false;
    localStorage.clear();
    setupDom();
    resetGameState(1);
    state.gameStarted = false;
    _resetBlackboxForTests();
  });

  afterEach(() => {
    _resetBlackboxForTests();
    vi.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("trims the ring to MAX_SAMPLES and MAX_BYTES", () => {
    const samples = Array.from({ length: BLACKBOX_MAX_SAMPLES + 80 }, (_, i) =>
      makeSample(i),
    );
    const ring: BlackboxRing = {
      v: 1,
      sessionId: "test",
      startedAt: 1,
      samples,
      peakNodes: 9999,
      peakHeap: 50_000_000,
    };
    const trimmed = trimBlackboxRing(ring);
    expect(trimmed.samples.length).toBeLessThanOrEqual(BLACKBOX_MAX_SAMPLES);
    expect(
      new TextEncoder().encode(JSON.stringify(trimmed)).length,
    ).toBeLessThanOrEqual(BLACKBOX_MAX_BYTES);
  });

  it("records samples while a game is active and flushes under the byte cap", () => {
    state.gameStarted = true;
    beginBlackboxSession();
    expect(_getBlackboxSamples().length).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 30; i++) {
      state.turnNumber = i;
      state.roundCount = Math.max(1, Math.floor(i / 2));
      _forceBlackboxSampleForTest();
    }
    const bytes = _flushBlackboxForTest();
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(BLACKBOX_MAX_BYTES);
    expect(getBlackboxRingByteLength()).toBeLessThanOrEqual(BLACKBOX_MAX_BYTES);
    expect(_getBlackboxSamples().length).toBeGreaterThan(10);
  });

  it("does not sample when no game is active", () => {
    state.gameStarted = false;
    beginBlackboxSession();
    // beginBlackboxSession calls takeSample once; gameStarted false → null
    expect(_getBlackboxSamples().length).toBe(0);
    expect(_forceBlackboxSampleForTest()).toBeNull();
  });

  it("detects abnormal termination on boot", () => {
    const ring: BlackboxRing = {
      v: 1,
      sessionId: "crashed",
      startedAt: Date.now() - 60_000,
      samples: [makeSample(0), makeSample(1), makeSample(2)],
      peakNodes: 12345,
      peakHeap: 80_000_000,
    };
    _simulateAbnormalPersistForTest(ring);
    expect(localStorage.getItem(BLACKBOX_CLEAN_KEY)).toBeNull();

    initBlackbox();

    const crash = getBlackboxLastCrash();
    expect(crash).not.toBeNull();
    expect(crash?.ring.peakNodes).toBe(12345);
    expect(crash?.ring.peakHeap).toBe(80_000_000);
    expect(localStorage.getItem(BLACKBOX_CRASH_KEY)).toBeTruthy();

    const status = document.getElementById("blackboxStatus");
    expect(status?.dataset.crash).toBe("1");
    expect(status?.textContent || "").toMatch(/ended unexpectedly/i);
  });

  it("does not treat a clean shutdown as a crash", () => {
    const ring: BlackboxRing = {
      v: 1,
      sessionId: "clean",
      startedAt: Date.now() - 60_000,
      samples: [makeSample(0)],
      peakNodes: 100,
    };
    localStorage.setItem(BLACKBOX_RING_KEY, JSON.stringify(ring));
    localStorage.setItem(BLACKBOX_CLEAN_KEY, "1");

    initBlackbox();
    expect(getBlackboxLastCrash()).toBeNull();
    const status = document.getElementById("blackboxStatus");
    expect(status?.dataset.crash).toBe("0");
  });

  it("counts card-art image load failures via capture listener", () => {
    initBlackbox();
    expect(_getBlackboxImageFailCount()).toBe(0);

    const img = document.createElement("img");
    img.src = "https://static.dotgg.gg/shadowverse/cards/10001110.webp";
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error", { bubbles: false }));

    // Resource error events do not bubble; capture listener on document needs
    // the event to go through the capture path. Synthesize via document path:
    const ev = new Event("error", { bubbles: true });
    Object.defineProperty(ev, "target", { value: img });
    document.dispatchEvent(ev);

    // Our listener is on document capture; dispatching on document won't
    // hit capture-from-target. Call the path the browser would: fire on img
    // while the capture listener is bound — jsdom may not route resource
    // errors. Fallback: verify listener increments when EventTarget path works.
    // Directly exercise by creating an ErrorEvent-like dispatch from img.
    img.dispatchEvent(new Event("error"));

    // In jsdom, document capture listeners DO receive events dispatched on
    // descendants during the capture/target phases for Event (not all resource errors).
    expect(_getBlackboxImageFailCount()).toBeGreaterThanOrEqual(1);
  });

  it("export JSON includes sample schema fields", () => {
    state.gameStarted = true;
    beginBlackboxSession();
    _forceBlackboxSampleForTest();
    _flushBlackboxForTest();
    const raw = _exportBlackboxForTest();
    const parsed = JSON.parse(raw);
    expect(parsed.schema).toBe("svwb.blackbox.v1");
    expect(parsed.ring.v).toBe(1);
    expect(Array.isArray(parsed.ring.samples)).toBe(true);
    const s = parsed.ring.samples[0];
    expect(s).toMatchObject({
      t: expect.any(Number),
      n: expect.any(Number),
      turn: expect.any(Number),
      round: expect.any(Number),
      img: expect.any(Number),
      rm: expect.any(Number),
      rms: expect.any(Number),
      rmn: expect.any(Number),
      gp: expect.any(Number),
    });
    expect(parsed.rematch).toMatchObject({
      total: expect.any(Number),
      sameSeed: expect.any(Number),
      newSeed: expect.any(Number),
      gamesStarted: expect.any(Number),
      gamesPlayed: expect.any(Number),
    });
    expect(Array.isArray(parsed.plot)).toBe(true);
  });

  it("records rematch boundary samples without wiping the ring", async () => {
    const { noteBlackboxRematch } = await import("../../src/ui/blackbox.js");
    state.gameStarted = true;
    state.turnNumber = 12;
    state.roundCount = 6;
    beginBlackboxSession();
    _forceBlackboxSampleForTest();
    const before = _getBlackboxSamples().length;
    expect(before).toBeGreaterThanOrEqual(1);

    noteBlackboxRematch(true);
    const afterSame = _getBlackboxSamples();
    expect(afterSame.length).toBe(before + 1);
    const boundary = afterSame[afterSame.length - 1];
    expect(boundary?.ev).toBe("rs");
    expect(boundary?.rm).toBe(1);
    expect(boundary?.rms).toBe(1);
    expect(boundary?.rmn).toBe(0);
    expect(boundary?.ft).toBe(12);
    expect(boundary?.fr).toBe(6);

    state.turnNumber = 8;
    state.roundCount = 4;
    noteBlackboxRematch(false);
    const afterNew = _getBlackboxSamples();
    expect(afterNew.length).toBe(before + 2);
    const boundaryNew = afterNew[afterNew.length - 1];
    expect(boundaryNew?.ev).toBe("rn");
    expect(boundaryNew?.rm).toBe(2);
    expect(boundaryNew?.rms).toBe(1);
    expect(boundaryNew?.rmn).toBe(1);
    expect(boundaryNew?.ft).toBe(8);

    // Rematch restart must not wipe prior samples
    beginBlackboxSession();
    expect(_getBlackboxSamples().length).toBe(before + 2);

    const parsed = JSON.parse(_exportBlackboxForTest());
    expect(parsed.rematch.total).toBe(2);
    expect(parsed.rematch.sameSeed).toBe(1);
    expect(parsed.rematch.newSeed).toBe(1);
    expect(parsed.rematchBoundaries.length).toBe(2);
    expect(parsed.plot.some((p: { ev?: string }) => p.ev === "rs")).toBe(true);
  });
});
