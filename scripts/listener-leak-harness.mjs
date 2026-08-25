/**
 * Event-listener leak harness — drives the built app headlessly and samples
 * Chromium Performance.getMetrics (Nodes, JSEventListeners, JSHeapUsedSize).
 *
 * Usage: npm run build && npx tsx scripts/listener-leak-harness.mjs
 *
 * Env:
 *   LISTENER_LEAK_CYCLES=18   stress cycles (default 18)
 *   LISTENER_LEAK_PORT=8882   static server port
 *   LISTENER_LEAK_SEED=424242 fixed game seed
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
const CYCLES = Number(process.env.LISTENER_LEAK_CYCLES || 18);
const PORT = Number(process.env.LISTENER_LEAK_PORT || 8882);
const SEED = Number(process.env.LISTENER_LEAK_SEED || 424242);
const CHROME =
  process.env.CHROME_PATH ||
  (existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : "/usr/local/bin/google-chrome");

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

async function hoverAllCards(page, passes = 3) {
  const zones = ["#blueHand", "#redHand", "#blueBoard", "#redBoard"];
  for (let p = 0; p < passes; p++) {
    for (const zone of zones) {
      const cards = page.locator(`${zone} .card`);
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        await cards
          .nth(i)
          .hover({ force: true })
          .catch(() => {});
        await page.waitForTimeout(8);
      }
    }
    // History drawer items (hist preview path)
    const histItems = page.locator(".hist-item");
    const histCount = await histItems.count();
    for (let i = 0; i < histCount; i++) {
      await histItems
        .nth(i)
        .hover({ force: true })
        .catch(() => {});
      await page.waitForTimeout(8);
    }
  }
}

async function endTurns(page, count = 4) {
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
    await page.waitForTimeout(140);
    await dismissOverlays(page);
  }
}

async function undoRedo(page) {
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(35);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Control+Y");
    await page.waitForTimeout(35);
  }
}

function printTable(rows) {
  const header = "| checkpoint | DOM nodes | JS event listeners | JS heap |";
  const sep = "|---|---:|---:|---:|";
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    console.log(
      `| ${r.checkpoint} | ${r.nodes} | **${r.listeners}** | ${r.heapMb} MB |`,
    );
  }
}

function analyzeTrend(rows) {
  const baseline = rows[0];
  const checkpoints = rows.slice(1);

  // Flag listener growth at stable DOM counts (the leak signature).
  const stableDomViolations = [];
  for (let i = 1; i < rows.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = rows[j];
      const b = rows[i];
      const nodeDelta =
        Math.abs(b.nodes - a.nodes) / Math.max(a.nodes, b.nodes, 1);
      if (nodeDelta > 0.03) continue;
      const listenerGrowth =
        (b.listeners - a.listeners) / Math.max(a.listeners, 1);
      if (listenerGrowth > 0.1) {
        stableDomViolations.push({
          from: a.checkpoint,
          to: b.checkpoint,
          nodes: b.nodes,
          listenersBefore: a.listeners,
          listenersAfter: b.listeners,
          growthPct: Number((listenerGrowth * 100).toFixed(1)),
        });
      }
    }
  }

  // Listeners-per-node at high-DOM checkpoints should not drift upward forever.
  const ratios = checkpoints.map((r) => ({
    checkpoint: r.checkpoint,
    ratio: r.listeners / Math.max(r.nodes, 1),
    nodes: r.nodes,
    listeners: r.listeners,
  }));
  const highDom = ratios.filter((r) => r.nodes >= baseline.nodes * 1.5);
  let ratioDrift = 0;
  if (highDom.length >= 4) {
    const firstHalf = highDom.slice(0, Math.floor(highDom.length / 2));
    const secondHalf = highDom.slice(Math.floor(highDom.length / 2));
    const avg = (arr) =>
      arr.reduce((s, r) => s + r.ratio, 0) / Math.max(arr.length, 1);
    ratioDrift = avg(secondHalf) - avg(firstHalf);
  }

  const passStableDom = stableDomViolations.length === 0;
  const passRatioDrift = ratioDrift <= 0.15;
  const pass = passStableDom && passRatioDrift;

  return {
    baseline,
    stableDomViolations,
    ratioDrift: Number(ratioDrift.toFixed(4)),
    passStableDom,
    passRatioDrift,
    pass,
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
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

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

    // Open history drawer so hist-item hovers exercise preview path
    await page
      .locator("#historyToggle")
      .click()
      .catch(() => {});
    await page.waitForTimeout(100);

    rows.push({
      checkpoint: "after start",
      ...(await sampleMetrics(cdp)),
    });

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      await hoverAllCards(page, 3);
      await endTurns(page, 4);
      await undoRedo(page);
      rows.push({
        checkpoint: `cycle ${cycle}`,
        ...(await sampleMetrics(cdp)),
      });
    }

    console.log("=== Event-listener leak harness ===");
    console.log(`Seed: ${SEED}  Cycles: ${CYCLES}`);
    printTable(rows);

    const analysis = analyzeTrend(rows);
    console.log("");
    console.log("Analysis:");
    console.log(
      JSON.stringify(
        {
          baselineListeners: analysis.baseline.listeners,
          stableDomViolations: analysis.stableDomViolations.length,
          stableDomViolationSamples: analysis.stableDomViolations.slice(0, 5),
          highDomRatioDrift: analysis.ratioDrift,
          passStableDom: analysis.passStableDom,
          passRatioDrift: analysis.passRatioDrift,
          pass: analysis.pass,
        },
        null,
        2,
      ),
    );

    if (!analysis.pass) {
      console.error(
        "FAIL: listeners grow at stable DOM counts (leak signature)",
      );
      process.exitCode = 1;
      return;
    }
    console.log("PASS: no listener growth at stable DOM counts");
  } finally {
    await browser.close();
    server.close();
  }
}

runHarness().catch((err) => {
  console.error(err);
  process.exit(1);
});
