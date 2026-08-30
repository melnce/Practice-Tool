/**
 * DOM / event-listener retention harness.
 *
 * Drives the built app headlessly through a fixed cycle shape, forces GC via
 * CDP HeapProfiler.collectGarbage before every sample, and judges the TREND
 * across checkpoints (linear post-GC growth) rather than pairwise % heuristics.
 *
 * Usage:
 *   npm run build && npx tsx scripts/listener-leak-harness.mjs
 *
 * Env:
 *   LISTENER_LEAK_CYCLES=30     stress cycles (default 30)
 *   LISTENER_LEAK_PORT=8882     static server port
 *   LISTENER_LEAK_SEED=424242   fixed game seed
 *   LISTENER_LEAK_RETAIN=1      inject intentional retain-on-replace (self-test)
 *
 * Cycle shape (fixed): 3 end-turns + hover every card in all four zones
 * + 4× Ctrl+Z + 4× Ctrl+Y. Samples after start and every 10 cycles.
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { withSettingsDrawer } from "./settings-drawer-helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const CYCLES = Number(process.env.LISTENER_LEAK_CYCLES || 30);
const PORT = Number(process.env.LISTENER_LEAK_PORT || 8882);
const SEED = Number(process.env.LISTENER_LEAK_SEED || 424242);
const INJECT_RETAIN = process.env.LISTENER_LEAK_RETAIN === "1";
const SAMPLE_EVERY = Number(process.env.LISTENER_LEAK_SAMPLE_EVERY || 10);
const CHROME =
  process.env.CHROME_PATH ||
  (existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : "/usr/local/bin/google-chrome");

/** Post-GC growth per 10-cycle interval that counts as "material". */
const NODE_INTERVAL_THRESHOLD = 400;
const LISTENER_INTERVAL_THRESHOLD = 200;
/** Total post-GC growth start→end that counts as "material". */
const NODE_TOTAL_THRESHOLD = 800;
const LISTENER_TOTAL_THRESHOLD = 400;
/** Need this many intervals with material growth to call it linear. */
const MIN_GROWING_INTERVALS = 2;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      let filePath = join(BUILD, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      res.end(readFileSync(filePath));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function sampleMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const map = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return {
    nodes: Math.round(map.Nodes ?? 0),
    listeners: Math.round(map.JSEventListeners ?? 0),
    heapMb: Number(((map.JSHeapUsedSize ?? 0) / (1024 * 1024)).toFixed(1)),
  };
}

async function forceGc(cdp, page) {
  await page.mouse.move(5, 5).catch(() => {});
  await page.evaluate(() => {
    if (typeof gc === "function") gc();
  });
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 80));
}

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const choice = page.locator(".choice-option");
    if (
      await choice
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await choice
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(40);
      continue;
    }
    const selectable = page.locator(".card.selectable, .leader.selectable");
    if (
      await selectable
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await selectable
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(40);
    }
    const confirm = page.locator("#targetingConfirmation button");
    if (
      await confirm
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await confirm
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(40);
      continue;
    }
    const pending = await page.evaluate(
      () => !!window.gameState?.pendingTargetEffect,
    );
    if (!pending) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(40);
  }
}

async function confirmMulligans(page) {
  for (let i = 0; i < 4; i++) {
    const phase = await page.evaluate(() => window.gameState?.phase);
    if (phase !== "mulligan") return;
    if (
      await page
        .locator("#blueMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#blueMulliganConfirm").click();
      await page.waitForTimeout(120);
      continue;
    }
    if (
      await page
        .locator("#redMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#redMulliganConfirm").click();
      await page.waitForTimeout(120);
      continue;
    }
    await page.waitForTimeout(80);
  }
}

async function startGame(page, { blue, red, seed }) {
  await withSettingsDrawer(page, async () => {
    await page.selectOption("#blueDeckSelect", blue);
    await page.selectOption("#redDeckSelect", red);
    await page.locator("#seedInput").fill(String(seed));
    await page.locator("#startGameBtn").click();
  });
  await page.waitForFunction(
    () =>
      window.gameState?.phase === "mulligan" ||
      window.gameState?.gameStarted === true,
    undefined,
    { timeout: 20000 },
  );
}

async function hoverAllCards(page) {
  const zones = ["#blueHand", "#redHand", "#blueBoard", "#redBoard"];
  for (const zone of zones) {
    const cards = page.locator(`${zone} .card`);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards
        .nth(i)
        .hover({ force: true })
        .catch(() => {});
      await page.waitForTimeout(5);
    }
  }
  const histItems = page.locator(".hist-item");
  const histCount = await histItems.count();
  for (let i = 0; i < Math.min(histCount, 30); i++) {
    await histItems
      .nth(i)
      .hover({ force: true })
      .catch(() => {});
    await page.waitForTimeout(5);
  }
}

async function endTurns(page, count = 3) {
  for (let i = 0; i < count; i++) {
    await dismissOverlays(page);
    const btn = page
      .locator("#endTurnBlue:visible, #endTurnRed:visible")
      .first();
    if (!(await btn.count())) break;
    if (await btn.isDisabled().catch(() => true)) {
      await dismissOverlays(page);
    }
    if (await btn.isDisabled().catch(() => true)) break;
    await btn.click({ force: true });
    await page.waitForTimeout(120);
    await dismissOverlays(page);
  }
}

async function undoRedo(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(30);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+Y");
    await page.waitForTimeout(30);
  }
}

function printTable(rows) {
  const header = "| checkpoint | DOM nodes | JS event listeners | JS heap |";
  const sep = "|---|---:|---:|---:|";
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    console.log(
      `| ${r.checkpoint} | ${r.nodes} | ${r.listeners} | ${r.heapMb} MB |`,
    );
  }
}

/**
 * Trend judge: after forced GC, is growth linear and material across intervals?
 * Bounded one-time jumps (e.g. mid-game board filling) do not fail.
 */
export function analyzePostGcTrend(rows) {
  if (rows.length < 3) {
    return {
      pass: false,
      reason: "need at least 3 checkpoints",
      nodeDeltas: [],
      listenerDeltas: [],
    };
  }

  const nodeDeltas = [];
  const listenerDeltas = [];
  for (let i = 1; i < rows.length; i++) {
    nodeDeltas.push(rows[i].nodes - rows[i - 1].nodes);
    listenerDeltas.push(rows[i].listeners - rows[i - 1].listeners);
  }

  const growingNodeIntervals = nodeDeltas.filter(
    (d) => d > NODE_INTERVAL_THRESHOLD,
  ).length;
  const growingListenerIntervals = listenerDeltas.filter(
    (d) => d > LISTENER_INTERVAL_THRESHOLD,
  ).length;

  const totalNodeGrowth = rows[rows.length - 1].nodes - rows[0].nodes;
  const totalListenerGrowth =
    rows[rows.length - 1].listeners - rows[0].listeners;

  const nodesLeaking =
    growingNodeIntervals >= MIN_GROWING_INTERVALS &&
    totalNodeGrowth > NODE_TOTAL_THRESHOLD;
  const listenersLeaking =
    growingListenerIntervals >= MIN_GROWING_INTERVALS &&
    totalListenerGrowth > LISTENER_TOTAL_THRESHOLD;

  const pass = !nodesLeaking && !listenersLeaking;

  return {
    pass,
    nodesLeaking,
    listenersLeaking,
    nodeDeltas,
    listenerDeltas,
    totalNodeGrowth,
    totalListenerGrowth,
    growingNodeIntervals,
    growingListenerIntervals,
    thresholds: {
      NODE_INTERVAL_THRESHOLD,
      LISTENER_INTERVAL_THRESHOLD,
      NODE_TOTAL_THRESHOLD,
      LISTENER_TOTAL_THRESHOLD,
      MIN_GROWING_INTERVALS,
    },
  };
}

async function runHarness() {
  if (!existsSync(join(BUILD, "index.html"))) {
    console.error("Missing build/ — run npm run build first");
    process.exit(1);
  }

  const server = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  if (INJECT_RETAIN) {
    // Self-test only: retain every replaced child so post-GC metrics climb.
    await page.addInitScript(() => {
      window.__leakRetainBucket = [];
      const origReplace = Element.prototype.replaceChild;
      Element.prototype.replaceChild = function replaceChildLeak(
        newNode,
        oldNode,
      ) {
        try {
          window.__leakRetainBucket.push(oldNode);
        } catch {
          /* ignore */
        }
        return origReplace.call(this, newNode, oldNode);
      };
      const origRemove = Element.prototype.removeChild;
      Element.prototype.removeChild = function removeChildLeak(child) {
        try {
          window.__leakRetainBucket.push(child);
        } catch {
          /* ignore */
        }
        return origRemove.call(this, child);
      };
    });
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");

  const rows = [];

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    await startGame(page, {
      blue: "swordcraft_rally",
      red: "abysscraft_necromancy",
      seed: SEED,
    });
    await confirmMulligans(page);
    await page.waitForFunction(
      () => window.gameState?.phase === "main",
      undefined,
      { timeout: 15000 },
    );

    await page
      .locator("#historyToggle")
      .click()
      .catch(() => {});
    await page.waitForTimeout(100);

    await forceGc(cdp, page);
    rows.push({
      checkpoint: "after start + GC",
      ...(await sampleMetrics(cdp)),
    });

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      await endTurns(page, 3);
      await hoverAllCards(page);
      await undoRedo(page);
      if (cycle % SAMPLE_EVERY === 0 || cycle === CYCLES) {
        await forceGc(cdp, page);
        rows.push({
          checkpoint: `after ${cycle} cycles + GC`,
          ...(await sampleMetrics(cdp)),
        });
      }
    }

    console.log("=== DOM / listener retention harness ===");
    console.log(
      `Seed: ${SEED}  Cycles: ${CYCLES}  Sample every: ${SAMPLE_EVERY}  InjectRetain: ${INJECT_RETAIN}`,
    );
    printTable(rows);

    const analysis = analyzePostGcTrend(rows);
    console.log("");
    console.log("Analysis:");
    console.log(JSON.stringify(analysis, null, 2));

    if (!analysis.pass) {
      console.error(
        "FAIL: post-GC node/listener counts grow linearly (retention leak)",
      );
      await browser.close();
      server.close();
      process.exit(1);
    }
    console.log(
      "PASS: post-GC node/listener trend is flat (within thresholds)",
    );
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

runHarness().catch((err) => {
  console.error(err);
  process.exit(1);
});
