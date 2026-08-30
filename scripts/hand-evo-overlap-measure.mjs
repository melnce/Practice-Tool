#!/usr/bin/env node
/**
 * Measure hand vs Evo button overlap — before/after diagnostics.
 * Usage: npm run build && node scripts/hand-evo-overlap-measure.mjs [--tag=before]
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const tag =
  process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "measure";
const OUT = join(ROOT, "reports", "ui", "hand-evo-overlap", tag);
const PORT = Number(process.env.HAND_EVO_PORT || 8883);
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

function rectsIntersect(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

async function setupFullHand(page) {
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
    s.activePlayer = "second";
    s.players.second.evoCharges = 2;
    s.players.second.superEvoCharges = 2;
    for (let i = 0; i < 9; i++) {
      t.addToHand("second", "10001110");
    }
    t.render();
  });
}

async function measureViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);

  const metrics = await page.evaluate(() => {
    const evo = document.querySelector("#redNormalEvo");
    const hand = document.querySelector("#redHand");
    const leader = document.querySelector(".side-red .leader-container");
    const cards = [...(hand?.querySelectorAll(".card") ?? [])];

    const evoRect = evo?.getBoundingClientRect();
    const handRect = hand?.getBoundingClientRect();
    const leaderRect = leader?.getBoundingClientRect();

    const cardRects = cards.map((c, i) => {
      const r = c.getBoundingClientRect();
      const style = getComputedStyle(c);
      return {
        i,
        layoutWidth: c.offsetWidth,
        visualWidth: r.width,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
        transform: style.transform,
        zIndex: style.zIndex,
        marginLeft: style.marginLeft,
      };
    });

    const evoCenter = evoRect
      ? {
          x: evoRect.left + evoRect.width / 2,
          y: evoRect.top + evoRect.height / 2,
        }
      : null;
    const topElement = evoCenter
      ? document.elementFromPoint(evoCenter.x, evoCenter.y)
      : null;

    return {
      evoRect: evoRect
        ? {
            left: evoRect.left,
            right: evoRect.right,
            top: evoRect.top,
            bottom: evoRect.bottom,
            width: evoRect.width,
            height: evoRect.height,
          }
        : null,
      handRect: handRect
        ? { left: handRect.left, right: handRect.right, width: handRect.width }
        : null,
      leaderRect: leaderRect
        ? {
            left: leaderRect.left,
            right: leaderRect.right,
            zIndex: getComputedStyle(leader).zIndex,
          }
        : null,
      cardCount: cards.length,
      cardRects,
      handScale: getComputedStyle(hand)
        .getPropertyValue("--hand-local-scale")
        .trim(),
      elementFromPointEvo: topElement
        ? {
            id: topElement.id,
            className: topElement.className,
            tag: topElement.tagName,
          }
        : null,
    };
  });

  const evo = metrics.evoRect;
  const intersections = metrics.cardRects.filter((c) =>
    evo ? rectsIntersect(c.rect, evo) : false,
  );

  return {
    viewport: { width, height },
    ...metrics,
    evoIntersectsCards: intersections.length,
    evoClickable:
      metrics.elementFromPointEvo?.id === "redNormalEvo" ||
      metrics.elementFromPointEvo?.tag === "BUTTON",
    layoutVsVisualMismatch: metrics.cardRects.some(
      (c) => Math.abs(c.layoutWidth - c.visualWidth) > 2,
    ),
  };
}

async function run() {
  if (!existsSync(join(BUILD, "index.html"))) {
    console.error("Missing build/ — run npm run build first");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  const server = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const results = [];
  try {
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => !!window.__svwbTest);
      await setupFullHand(page);

      const m = await measureViewport(page, vp.width, vp.height);
      results.push(m);

      await page.screenshot({
        path: join(OUT, `${vp.width}x${vp.height}.png`),
        fullPage: false,
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const reportPath = join(OUT, "metrics.json");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`Wrote ${reportPath}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
