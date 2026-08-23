/**
 * DOM cleanup proof for floating combat text.
 * Usage: npm run build && npx tsx scripts/floating-text-cleanup-repro.mjs
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const PORT = Number(process.env.FLOATING_TEXT_PORT || 8881);
const BURST = Number(process.env.FLOATING_TEXT_BURST || 60);
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

async function runRepro() {
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

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    const result = await page.evaluate(async (burst) => {
      const t = window.__svwbTest;
      if (!t) throw new Error("missing __svwbTest");
      t.seedRng(9001);
      t.loadDecks(
        { name: "blue", cards: [] },
        { name: "red", cards: [] },
        { drawOpening: false },
      );
      const s = window.gameState;
      s.phase = "main";
      s.gameStarted = true;
      t.render();

      const baseline = document.querySelectorAll(
        ".floating-combat-text",
      ).length;
      const { peak } = t.burstCombatFloaters(burst);
      const peakStats = t.getCombatFloaterStats();

      await new Promise((r) => setTimeout(r, 2700));

      const afterStats = t.getCombatFloaterStats();
      return {
        baseline,
        peak,
        peakDom: peakStats.dom,
        peakTracked: peakStats.tracked,
        afterDom: afterStats.dom,
        trackedAfter: afterStats.tracked,
        timersAfter: afterStats.timers,
        burst,
      };
    }, BURST);

    console.log("=== Floating combat text DOM cleanup repro ===");
    console.log(JSON.stringify(result, null, 2));

    const ok =
      result.afterDom === result.baseline &&
      result.trackedAfter === 0 &&
      result.timersAfter === 0;
    if (!ok) {
      console.error("FAIL: floaters or timers did not return to baseline");
      process.exit(1);
    }
    console.log(
      "PASS: DOM node count and internal trackers returned to baseline",
    );
  } finally {
    await browser.close();
    server.close();
  }
}

runRepro().catch((err) => {
  console.error(err);
  process.exit(1);
});
