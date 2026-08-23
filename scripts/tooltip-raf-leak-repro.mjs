/**
 * Repro: tooltip RAF loop accumulation during hover + board re-renders.
 * Short headless harness — NOT player-qa.
 *
 * Usage: npm run build && npx tsx scripts/tooltip-raf-leak-repro.mjs
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const RERENDERS = Number(process.env.RAF_RERENDERS || 300);
const FORCE_VM_CHANGE = process.env.RAF_FORCE_VM === "1";
const PORT = Number(process.env.RAF_REPRO_PORT || 8879);
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
  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__rafAudit = {
      scheduled: 0,
      executed: 0,
      peakConcurrent: 0,
      concurrent: 0,
      tooltipHandles: 0,
      peakTooltipHandles: 0,
      counterWalks: 0,
    };

    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      const audit = window.__rafAudit;
      audit.scheduled += 1;
      audit.concurrent += 1;
      audit.peakConcurrent = Math.max(audit.peakConcurrent, audit.concurrent);
      return origRaf(() => {
        audit.concurrent -= 1;
        audit.executed += 1;
        cb(performance.now());
      });
    };

    window.__countTooltipHandles = () => {
      let n = 0;
      document.querySelectorAll("[data-has-tooltip]").forEach((el) => {
        if (el.__ttRaf != null) n += 1;
      });
      return n;
    };
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    await page.evaluate(
      ({ useBoard }) => {
        const t = window.__svwbTest;
        t.seedRng(424242);
        t.loadDecks(
          { name: "blue", cards: [] },
          { name: "red", cards: [] },
          { drawOpening: false },
        );
        const s = window.gameState;
        s.phase = "main";
        s.gameStarted = true;
        s.players.first.hand = [];
        s.players.first.followerEnterHistory = [];
        if (useBoard) {
          t.summonToBoard("first", "10844110");
        } else {
          t.addToHand("first", "10844110", 1);
        }
        t.advanceToTurn(5, "first");
        t.render();
      },
      { useBoard: process.env.RAF_ZONE === "board" },
    );

    const zone = process.env.RAF_ZONE === "board" ? "#blueBoard" : "#blueHand";
    const card = page.locator(`${zone} .card`).first();
    const box = await card.boundingBox();
    if (!box) throw new Error("card not visible for hover");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);

    // Let RAF loop spin up (~12 frames at 60fps)
    await page.waitForTimeout(200);

    const beforeRenders = await page.evaluate(() => {
      const audit = window.__rafAudit;
      const hovered = document.querySelector('[data-has-tooltip="1"]:hover');
      const tip = document.getElementById("cardTooltip");
      return {
        scheduled: audit.scheduled,
        executed: audit.executed,
        peakConcurrent: audit.peakConcurrent,
        tooltipHandles: window.__countTooltipHandles(),
        hasHovered: !!hovered,
        tooltipVisible: tip?.style.display !== "none",
      };
    });

    let peakHandlesDuringRenders = beforeRenders.tooltipHandles;
    const batchSize = Math.floor(RERENDERS / 10);
    for (let batch = 0; batch < 10; batch++) {
      await page.evaluate(
        ({ batch, batchSize, forceVmChange }) => {
          const t = window.__svwbTest;
          const s = window.gameState;
          const start = batch * batchSize;
          for (let i = 0; i < batchSize; i++) {
            const step = start + i;
            s.players.first.pp = (step % 10) + 1;
            if (forceVmChange) {
              const handCard = s.players.first.hand[0];
              const boardCard = s.players.first.board[0];
              const target = handCard || boardCard;
              if (target) {
                target.buffs = {
                  attack: step % 5,
                  defense: step % 4,
                };
              }
            }
            if (step % 3 === 0) {
              s.players.first.followerEnterHistory.push({
                name: "Drache & Aluzard, Burning Blood",
                tribes: [],
                cardId: "10844110",
              });
            } else if (
              step % 3 === 1 &&
              s.players.first.followerEnterHistory.length
            ) {
              s.players.first.followerEnterHistory.pop();
            }
            t.render();
          }
        },
        { batch, batchSize, forceVmChange: FORCE_VM_CHANGE },
      );
      const handles = await page.evaluate(() => window.__countTooltipHandles());
      peakHandlesDuringRenders = Math.max(peakHandlesDuringRenders, handles);
    }

    await page.waitForTimeout(300);

    const afterRenders = await page.evaluate(() => {
      const audit = window.__rafAudit;
      const tooltipHandles = window.__countTooltipHandles();
      audit.peakTooltipHandles = Math.max(
        audit.peakTooltipHandles || 0,
        tooltipHandles,
      );
      return {
        scheduled: audit.scheduled,
        executed: audit.executed,
        peakConcurrent: audit.peakConcurrent,
        tooltipHandles,
        peakTooltipHandles: audit.peakTooltipHandles,
      };
    });

    const rafDelta = afterRenders.scheduled - beforeRenders.scheduled;

    console.log("=== Tooltip RAF leak repro ===");
    console.log(
      `Mode: zone=${process.env.RAF_ZONE || "hand"} forceVm=${FORCE_VM_CHANGE}`,
    );
    console.log(`Re-renders while hovered: ${RERENDERS}`);
    console.log("Before forced re-renders (200ms hover):");
    console.log(JSON.stringify(beforeRenders, null, 2));
    console.log("After forced re-renders:");
    console.log(JSON.stringify(afterRenders, null, 2));
    console.log(`RAF scheduled during hover+re-renders: ${rafDelta}`);
    console.log(
      `Peak live __ttRaf handles during re-renders: ${peakHandlesDuringRenders}`,
    );
    console.log(
      `Live __ttRaf handles after re-renders: ${afterRenders.tooltipHandles}`,
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
