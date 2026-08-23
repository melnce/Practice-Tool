#!/usr/bin/env node
/**
 * Phase 2 UI screenshot pass — headless Chromium, built app, fixed seed.
 * Asserts header/stats overlap clearance; captures required visual states.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reports/ui/phase2");
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const SEED = 424242;
const WIDTHS = [1440, 1900, 2560];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server not ready at ${url}`);
}

function assertNoHeaderStatsOverlap(page) {
  return page.evaluate(() => {
    const header = document.getElementById("controlPanel");
    const redStats = document.getElementById("redStatsContainer");
    if (!header || !redStats) {
      return { ok: false, reason: "missing controlPanel or redStatsContainer" };
    }
    const h = header.getBoundingClientRect();
    const s = redStats.getBoundingClientRect();
    const gap = s.top - h.bottom;
    if (gap < -2) {
      return {
        ok: false,
        reason: `overlap: header bottom=${h.bottom.toFixed(1)} stats top=${s.top.toFixed(1)} gap=${gap.toFixed(1)}`,
      };
    }
    return { ok: true, gap: Math.round(gap) };
  });
}

async function startGame(page, seed = SEED) {
  await page.fill("#seedInput", String(seed));
  await page.click("#startGameBtn");
  await page.waitForFunction(
    () => window.gameState?.gameStarted === true,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);
}

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${path.relative(ROOT, file)}`);
}

async function stageMidGameBoard(page) {
  await page.evaluate(async () => {
    const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
    await loadCardDatabase();
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { getCardById } = await import("/src/data/cardDatabase.ts");
    const { applyKeywordsFromList } =
      await import("/src/logic/core/keywords/apply.js");
    const { render } = await import("/src/ui/render.ts");

    resetGameState(424242);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.roundCount = 6;
    state.players.first.pp = 6;
    state.players.first.maxPP = 6;
    state.players.first.evoCharges = 2;
    state.players.first.superEvoCharges = 1;
    state.players.second.pp = 6;
    state.players.second.maxPP = 6;

    const mk = (id, owner, patch = {}) => {
      const tmpl = getCardById(id);
      if (!tmpl) throw new Error(`missing card ${id}`);
      const c = {
        ...structuredClone(tmpl),
        uid: `uid_${id}_${Math.random().toString(36).slice(2, 8)}`,
        owner,
        buffs: { attack: 0, defense: 0 },
        zone: "board",
        can_attack: false,
        hasAttacked: false,
        justPlayed: true,
        ...patch,
      };
      applyKeywordsFromList(c);
      return c;
    };

    // Evolved follower (blue)
    const evolved = mk("10001110", "first", {
      hasEvolved: true,
      evoType: "normal",
      attack: 3,
      defense: 4,
      base_attack: 1,
      base_defense: 2,
    });

    // Ward follower (red)
    const ward = mk("10001110", "second", { hasWard: true });

    // Damaged follower (red)
    const damaged = mk("10001130", "second", {
      defense: 1,
      base_defense: 3,
      peak_defense: 3,
    });

    state.players.first.board = [evolved];
    state.players.second.board = [ward, damaged];
    state.players.first.hand = [
      mk("10041310", "first", { zone: "hand" }),
      mk("10001110", "first", { zone: "hand" }),
      mk("10001130", "first", { zone: "hand" }),
    ];
    render();
  });
  await page.waitForTimeout(300);
}

async function stageHiddenHand(page) {
  await page.evaluate(async () => {
    const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
    await loadCardDatabase();
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { getCardById } = await import("/src/data/cardDatabase.ts");
    const { applyKeywordsFromList } =
      await import("/src/logic/core/keywords/apply.js");
    const { render } = await import("/src/ui/render.ts");
    const { startRecording, setHiddenHandEnabled } =
      await import("/src/logic/script/runtime.ts");

    resetGameState(424242);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 5;
    state.players.first.maxPP = 5;
    state.players.second.pp = 5;
    state.players.second.maxPP = 5;

    const mk = (id, owner) => {
      const tmpl = getCardById(id);
      const c = {
        ...structuredClone(tmpl),
        uid: `h_${id}_${Math.random().toString(36).slice(2, 6)}`,
        owner,
        buffs: { attack: 0, defense: 0 },
        zone: "hand",
      };
      applyKeywordsFromList(c);
      return c;
    };

    state.players.second.hand = [
      mk("10001110", "second"),
      mk("10001130", "second"),
      mk("10041310", "second"),
      mk("10001110", "second"),
      mk("10001130", "second"),
    ];
    startRecording({ name: "screenshot", scriptedSide: "second" });
    setHiddenHandEnabled(true);
    render();
  });
  await page.waitForTimeout(300);
}

async function stageTargeting(page) {
  await page.evaluate(async () => {
    const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
    await loadCardDatabase();
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { getCardById } = await import("/src/data/cardDatabase.ts");
    const { applyKeywordsFromList } =
      await import("/src/logic/core/keywords/apply.js");
    const { render } = await import("/src/ui/render.ts");

    resetGameState(42);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;

    const spellTpl = getCardById("10041310");
    const enemyTpl = getCardById("10001110");
    if (!spellTpl || !enemyTpl) throw new Error("card DB missing test cards");

    const spell = {
      ...structuredClone(spellTpl),
      uid: "spell_uid",
      owner: "first",
      buffs: { attack: 0, defense: 0 },
      zone: "hand",
    };
    const enemy = {
      ...structuredClone(enemyTpl),
      uid: "enemy_uid",
      owner: "second",
      buffs: { attack: 0, defense: 0 },
      zone: "board",
      peak_defense: Number(enemyTpl.defense),
      can_attack: false,
      hasAttacked: false,
      justPlayed: true,
    };
    applyKeywordsFromList(enemy);

    state.players.first.hand = [spell];
    state.players.second.board = [enemy];
    render();
  });

  const handCard = page.locator("#blueHand .card").first();
  await handCard.click({ button: "right" });
  await page.waitForSelector("body.select-mode", { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function main() {
  ensureDir(OUT);

  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let previewLog = "";
  preview.stdout?.on("data", (d) => {
    previewLog += d;
  });
  preview.stderr?.on("data", (d) => {
    previewLog += d;
  });

  const consoleErrors = [];

  try {
    await waitForServer(BASE);

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/?test=1`);
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => !!window.__svwbTest);

      await startGame(page);

      const overlap = await assertNoHeaderStatsOverlap(page);
      if (!overlap.ok) {
        throw new Error(`Overlap at ${width}px: ${overlap.reason}`);
      }
      console.log(`✓ ${width}px overlap check passed (gap=${overlap.gap}px)`);

      await screenshot(page, `baseline-${width}.png`);
    }

    // Visual state evidence
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);

    await stageMidGameBoard(page);
    await screenshot(page, "state-midgame-board.png");

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await stageHiddenHand(page);
    await screenshot(page, "state-hidden-hand.png");

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await stageTargeting(page);
    await screenshot(page, "state-targeting-selection.png");

    if (consoleErrors.length) {
      throw new Error(`Console errors: ${consoleErrors.join("; ")}`);
    }
    console.log("✓ Console clean on load");

    await browser.close();
    console.log(`\nScreenshots written to ${path.relative(ROOT, OUT)}/`);
  } finally {
    preview.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
