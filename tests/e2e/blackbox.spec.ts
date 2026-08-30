/**
 * Crash black-box E2E — abnormal end detection, ring bounds, image-fail counter.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join("reports", "ui", "blackbox");
const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
}

async function startMinimalGame(page: Page) {
  await page.evaluate(() => {
    const t = window.__svwbTest;
    if (!t) throw new Error("missing test bridge");
    t.seedRng(42);
    t.loadDecks(
      { name: "blue", cards: [] },
      { name: "red", cards: [] },
      { drawOpening: false },
    );
    const s = window.gameState;
    s.gameStarted = true;
    s.phase = "main";
    s.activePlayer = "first";
    s.turnNumber = 3;
    s.roundCount = 2;
    t.render();
    t.beginBlackboxSession();
  });
}

test.describe("crash black-box", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("detects abnormal end and surfaces trace in settings", async ({
    page,
  }) => {
    // Seed a prior unclean session before boot — mirrors a tab OOM where
    // pagehide/beforeunload never ran (Playwright reload always fires them).
    await page.addInitScript(() => {
      const ring = {
        v: 1,
        sessionId: "e2e-crash",
        startedAt: Date.now() - 120_000,
        samples: [
          {
            t: 0,
            n: 1400,
            turn: 1,
            round: 1,
            img: 0,
            rm: 0,
            rms: 0,
            rmn: 0,
            gp: 1,
            hu: 40e6,
            ht: 50e6,
            hl: 100e6,
          },
          {
            t: 5000,
            n: 2200,
            turn: 2,
            round: 1,
            img: 2,
            rm: 1,
            rms: 1,
            rmn: 0,
            gp: 2,
            hu: 55e6,
            ht: 60e6,
            hl: 100e6,
            ev: "rs",
            ft: 18,
            fr: 9,
          },
          {
            t: 10000,
            n: 9800,
            turn: 4,
            round: 2,
            img: 7,
            rm: 2,
            rms: 2,
            rmn: 0,
            gp: 3,
            hu: 82e6,
            ht: 90e6,
            hl: 100e6,
            ev: "rs",
            ft: 22,
            fr: 11,
          },
        ],
        peakNodes: 9800,
        peakHeap: 82e6,
        rematchTotal: 2,
        rematchSame: 2,
        rematchNew: 0,
        gamesStarted: 3,
        gamesPlayed: 2,
      };
      localStorage.setItem("svwb.blackbox.ring", JSON.stringify(ring));
      localStorage.removeItem("svwb.blackbox.clean");
      localStorage.removeItem("svwb.blackbox.crash");
    });

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");

    const crash = await page.evaluate(() => {
      const raw = localStorage.getItem("svwb.blackbox.crash");
      return raw ? JSON.parse(raw) : null;
    });
    expect(crash).toBeTruthy();
    expect(crash.ring.samples.length).toBe(3);
    expect(crash.ring.peakNodes).toBe(9800);

    // Toast should mention unexpected end
    await expect(page.locator("#actionToast.visible")).toContainText(
      /ended unexpectedly/i,
      { timeout: 3000 },
    );
    await shot(page, "post-crash-toast");

    await page.click("#settingsToggle");
    await expect(page.locator("#settingsDrawer")).toHaveClass(/open/);
    const status = page.locator("#blackboxStatus");
    await expect(status).toHaveAttribute("data-crash", "1");
    await expect(status).toContainText(/ended unexpectedly/i);
    await expect(status).toContainText(/9,800|9800/);
    await status.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "post-crash-notice");

    await expect(page.locator("#blackboxCopyBtn")).toBeVisible();
    await expect(page.locator("#blackboxExportBtn")).toBeVisible();
    await page.locator("#blackboxExportBtn").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot(page, "diagnostics-export");
  });

  test("ring buffer stays under byte cap across a long session", async ({
    page,
  }) => {
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await startMinimalGame(page);

    const result = await page.evaluate(() => {
      const t = window.__svwbTest!;
      const max = t.getBlackboxMaxBytes();
      let peakBytes = 0;
      for (let i = 0; i < 400; i++) {
        window.gameState.turnNumber = i;
        window.gameState.roundCount = Math.max(1, Math.floor(i / 2));
        t.forceBlackboxSample();
        if (i % 10 === 0) {
          const bytes = t.flushBlackbox();
          if (bytes > peakBytes) peakBytes = bytes;
        }
      }
      const finalBytes = t.flushBlackbox();
      return {
        peakBytes: Math.max(peakBytes, finalBytes),
        finalBytes,
        max,
        samples: t.getBlackboxSampleCount(),
      };
    });

    expect(result.samples).toBeLessThanOrEqual(240);
    expect(result.finalBytes).toBeLessThanOrEqual(result.max);
    expect(result.peakBytes).toBeLessThanOrEqual(result.max);
  });

  test("failed-image counter increments when webp is blocked", async ({
    page,
  }) => {
    await page.route("**/*.webp", (route) => route.abort());
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await startMinimalGame(page);

    const before = await page.evaluate(() =>
      window.__svwbTest!.getBlackboxImageFailCount(),
    );
    expect(before).toBe(0);

    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://static.dotgg.gg/shadowverse/cards/10001110.webp";
      document.body.appendChild(img);
    });

    await page.waitForFunction(
      () => window.__svwbTest!.getBlackboxImageFailCount() > 0,
      null,
      { timeout: 10_000 },
    );
    const after = await page.evaluate(() =>
      window.__svwbTest!.getBlackboxImageFailCount(),
    );
    expect(after).toBeGreaterThan(0);

    const sample = await page.evaluate(() => {
      window.__svwbTest!.forceBlackboxSample();
      return window.__svwbTest!.forceBlackboxSample() as { img: number };
    });
    expect(sample.img).toBeGreaterThan(0);
  });

  test("failed-image counter stays 0 when webp loads", async ({ page }) => {
    // Fulfill with a tiny valid 1x1 webp
    const tinyWebp = Buffer.from(
      "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
      "base64",
    );
    await page.route("**/*.webp", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/webp",
        body: tinyWebp,
      });
    });

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await startMinimalGame(page);

    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const img = document.createElement("img");
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("webp should load"));
        img.src = "https://static.dotgg.gg/shadowverse/cards/10001110.webp";
        document.body.appendChild(img);
      });
    });

    await page.waitForTimeout(300);
    const count = await page.evaluate(() =>
      window.__svwbTest!.getBlackboxImageFailCount(),
    );
    expect(count).toBe(0);
  });

  test("sampler has negligible frame-time impact", async ({ page }) => {
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await startMinimalGame(page);

    const timing = await page.evaluate(() => {
      const t = window.__svwbTest!;
      const measure = (fn: () => void, n: number) => {
        const times: number[] = [];
        for (let i = 0; i < n; i++) {
          const a = performance.now();
          fn();
          times.push(performance.now() - a);
        }
        times.sort((x, y) => x - y);
        return times[Math.floor(times.length * 0.95)] ?? 0;
      };

      const baseline = measure(() => {
        // Empty work comparable to a no-op frame slice
        void document.getElementsByTagName("*").length;
      }, 40);

      const withSample = measure(() => {
        t.forceBlackboxSample();
      }, 40);

      return { baseline, withSample };
    });

    // Sampling itself should stay well under a frame budget (16ms).
    expect(timing.withSample).toBeLessThan(8);
  });

  test("rematch boundary samples tag same/new seed and preserve the ring", async ({
    page,
  }) => {
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await startMinimalGame(page);

    const result = await page.evaluate(() => {
      const t = window.__svwbTest!;
      window.gameState.turnNumber = 14;
      window.gameState.roundCount = 7;
      t.forceBlackboxSample();
      t.noteBlackboxRematch(true);
      window.gameState.turnNumber = 9;
      window.gameState.roundCount = 5;
      t.noteBlackboxRematch(false);
      t.flushBlackbox();
      const raw = localStorage.getItem("svwb.blackbox.ring");
      const ring = raw ? JSON.parse(raw) : null;
      const boundaries = (ring?.samples ?? []).filter(
        (s: { ev?: string }) => s.ev === "rs" || s.ev === "rn",
      );
      return {
        rematchTotal: ring?.rematchTotal,
        rematchSame: ring?.rematchSame,
        rematchNew: ring?.rematchNew,
        gamesPlayed: ring?.gamesPlayed,
        sampleCount: ring?.samples?.length,
        boundaries,
      };
    });

    expect(result.rematchTotal).toBe(2);
    expect(result.rematchSame).toBe(1);
    expect(result.rematchNew).toBe(1);
    expect(result.gamesPlayed).toBe(2);
    expect(result.sampleCount).toBeGreaterThanOrEqual(3);
    expect(result.boundaries).toHaveLength(2);
    expect(result.boundaries[0].ev).toBe("rs");
    expect(result.boundaries[0].ft).toBe(14);
    expect(result.boundaries[1].ev).toBe("rn");
    expect(result.boundaries[1].ft).toBe(9);
  });
});
