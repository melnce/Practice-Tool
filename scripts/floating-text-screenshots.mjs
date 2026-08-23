#!/usr/bin/env node
/**
 * Capture floating combat text screenshots for reports/ui/floating-text/.
 * Usage: npm run build && npx tsx scripts/floating-text-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const OUT = join(ROOT, "reports", "ui", "floating-text");
const PORT = Number(process.env.FLOATING_TEXT_PORT || 8882);
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    await page.evaluate(() => {
      const t = window.__svwbTest;
      if (!t) throw new Error("missing test bridge");
      t.seedRng(777);
      t.loadDecks(
        { name: "blue", cards: [] },
        { name: "red", cards: [] },
        { drawOpening: false },
      );
      const s = window.gameState;
      s.phase = "main";
      s.gameStarted = true;
      s.activePlayer = "first";
      s.players.first.hp = 10;
      t.render();
    });

    const emit = (events) =>
      page.evaluate((events) => {
        window.__svwbTest?.emitLeaderCombatLogs(events);
      }, events);

    await emit([{ type: "damage", amount: 3 }]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, "leader-damage.png") });

    await page.waitForTimeout(1200);
    await emit([{ type: "heal", amount: 2 }]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, "leader-heal.png") });

    await page.waitForTimeout(1200);
    await emit([
      { type: "heal", amount: 1 },
      { type: "damage", amount: 1 },
    ]);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "leader-heal-then-damage.png") });

    const floaters = await page
      .locator("#blueLeader .floating-combat-text")
      .allTextContents();
    console.log("Floaters (heal+damage case):", floaters);
    if (floaters.length !== 2 || floaters[0] !== "+1" || floaters[1] !== "-1") {
      throw new Error(`Unexpected floaters: ${JSON.stringify(floaters)}`);
    }
    if (errors.length > 0) {
      throw new Error(`Console errors: ${errors.join("\n")}`);
    }
    console.log(`Screenshots saved to ${OUT}`);
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
