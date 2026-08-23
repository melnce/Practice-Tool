#!/usr/bin/env node
/**
 * Phase 2 UI screenshot pass — headless Chromium, built app, fixed seed.
 * Asserts header/stats overlap clearance; captures required visual states.
 *
 * Phase 2b: stats-vs-crest overlap assertion, 1440px viewport height checks,
 * hand-size evidence screenshots (4 / 7 / 10).
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.UI_SCREENSHOT_OUT
  ? path.resolve(ROOT, process.env.UI_SCREENSHOT_OUT)
  : path.join(ROOT, "reports/ui/phase2");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SEED = 424242;
const WIDTHS = [1440, 1900, 2560];
const VIEWPORT_HEIGHT = Number(process.env.UI_SCREENSHOT_HEIGHT || 1440);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
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

function assertNoStatsCrestOverlap(page, sidePrefix) {
  return page.evaluate((prefix) => {
    const stats = document.getElementById(`${prefix}Stats`);
    const crests = document.getElementById(`${prefix}Crests`);
    if (!stats || !crests) {
      return {
        ok: false,
        reason: `missing ${prefix}Stats or ${prefix}Crests`,
      };
    }
    const s = stats.getBoundingClientRect();
    const c = crests.getBoundingClientRect();
    const overlapX = Math.min(s.right, c.right) - Math.max(s.left, c.left);
    const overlapY = Math.min(s.bottom, c.bottom) - Math.max(s.top, c.top);
    if (overlapX > 2 && overlapY > 2) {
      return {
        ok: false,
        reason: `${prefix}: stats/crest box overlap ${overlapX.toFixed(1)}×${overlapY.toFixed(1)}px`,
      };
    }
    const verticalGap = c.top >= s.bottom ? c.top - s.bottom : s.top - c.bottom;
    if (overlapY > 2) {
      return {
        ok: false,
        reason: `${prefix}: stats/crest vertical overlap ${overlapY.toFixed(1)}px`,
      };
    }
    return { ok: true, gap: Math.round(verticalGap) };
  }, sidePrefix);
}

function assertPlayAreaInView(page) {
  return page.evaluate(() => {
    const ids = [
      "redHand",
      "blueHand",
      "redBoard",
      "blueBoard",
      "redLeader",
      "blueLeader",
      "turnControls",
      "redStatsContainer",
      "blueStatsContainer",
    ];
    const vh = window.innerHeight;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (
        !el ||
        (el.offsetParent === null && getComputedStyle(el).display === "none")
      ) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.top < -2 || r.bottom > vh + 2) {
        return {
          ok: false,
          reason: `#${id} out of view: top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} vh=${vh}`,
        };
      }
    }
    return { ok: true };
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

/** Stage board using window globals (works in production build). */
async function stageMidGameBoard(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard)
      throw new Error("gameState or cardDatabase missing");

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
      const tmpl = getCard(id);
      if (!tmpl) throw new Error(`missing card ${id}`);
      return {
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
    };

    const evolved = mk("10001110", "first", {
      hasEvolved: true,
      evoType: "normal",
      attack: 3,
      defense: 4,
      base_attack: 1,
      base_defense: 2,
    });
    const ward = mk("10001110", "second", { hasWard: true });
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
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(400);
}

async function stageRedHandSize(page, handCount) {
  await page.evaluate((count) => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard)
      throw new Error("gameState or cardDatabase missing");

    const cardIds = [
      "10001110",
      "10001130",
      "10041310",
      "10001110",
      "10001130",
    ];
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.roundCount = 4;
    state.players.first.pp = 5;
    state.players.first.maxPP = 5;
    state.players.first.hand = [];
    state.players.second.hand = [];
    state.players.first.board = [];
    state.players.second.board = [];

    const mkHand = (owner, n) => {
      const hand = [];
      for (let i = 0; i < n; i++) {
        const id = cardIds[i % cardIds.length];
        const tmpl = getCard(id);
        if (!tmpl) throw new Error(`missing card ${id}`);
        hand.push({
          ...structuredClone(tmpl),
          uid: `hand_${owner}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          owner,
          buffs: { attack: 0, defense: 0 },
          zone: "hand",
        });
      }
      return hand;
    };

    state.players.second.hand = mkHand("second", count);
    state.players.first.hand = mkHand("first", 3);
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(500);
}

async function stageHiddenHand(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard)
      throw new Error("gameState or cardDatabase missing");

    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 5;
    state.players.first.maxPP = 5;
    state.players.second.pp = 5;
    state.players.second.maxPP = 5;

    const mk = (id, owner) => {
      const tmpl = getCard(id);
      return {
        ...structuredClone(tmpl),
        uid: `h_${id}_${Math.random().toString(36).slice(2, 6)}`,
        owner,
        buffs: { attack: 0, defense: 0 },
        zone: "hand",
      };
    };

    state.players.second.hand = [
      mk("10001110", "second"),
      mk("10001130", "second"),
      mk("10041310", "second"),
      mk("10001110", "second"),
      mk("10001130", "second"),
    ];
    window.__svwbTest?.render();
  });

  await page.selectOption("#scriptSideSelect", "second");
  await page.click("#scriptRecordBtn");
  await page.check("#scriptHiddenHandToggle");
  await page.waitForTimeout(400);
}

async function stageTargeting(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard)
      throw new Error("gameState or cardDatabase missing");

    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;

    const spellTpl = getCard("10041310");
    const enemyTpl = getCard("10001110");
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

    state.players.first.hand = [spell];
    state.players.second.board = [enemy];
    window.__svwbTest?.render();
  });

  const handCard = page.locator("#blueHand .card").first();
  await handCard.click({ button: "right" });
  await page.waitForSelector("body.select-mode", { timeout: 8000 });
  await page.waitForTimeout(400);
}

async function runOverlapAssertions(page, width) {
  const headerOverlap = await assertNoHeaderStatsOverlap(page);
  if (!headerOverlap.ok) {
    throw new Error(`Header overlap at ${width}px: ${headerOverlap.reason}`);
  }
  console.log(`✓ ${width}px header/stats gap=${headerOverlap.gap}px`);

  for (const side of ["red", "blue"]) {
    const crestOverlap = await assertNoStatsCrestOverlap(page, side);
    if (!crestOverlap.ok) {
      throw new Error(
        `Stats/crest overlap at ${width}px: ${crestOverlap.reason}`,
      );
    }
    console.log(`✓ ${width}px ${side} stats/crest gap=${crestOverlap.gap}px`);
  }

  const inView = await assertPlayAreaInView(page);
  if (!inView.ok) {
    throw new Error(`Play area out of view at ${width}px: ${inView.reason}`);
  }
  console.log(`✓ ${width}px play area in view`);
}

async function main() {
  ensureDir(OUT);

  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

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
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto(`${BASE}/?test=1`);
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => !!window.__svwbTest);

      await startGame(page);
      await stageMidGameBoard(page);
      await runOverlapAssertions(page, width);

      await screenshot(page, `baseline-${width}.png`);
    }

    await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageMidGameBoard(page);
    await screenshot(page, "state-midgame-board.png");

    for (const handSize of [4, 7, 10]) {
      await page.goto(`${BASE}/?test=1`);
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => !!window.__svwbTest);
      await startGame(page);
      await stageRedHandSize(page, handSize);
      await screenshot(page, `state-red-hand-${handSize}.png`);
    }

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageHiddenHand(page);
    await screenshot(page, "state-hidden-hand.png");

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await stageTargeting(page);
    await screenshot(page, "state-targeting-selection.png");

    const filteredErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("ort.min.js"),
    );
    if (filteredErrors.length) {
      throw new Error(`Console errors: ${filteredErrors.join("; ")}`);
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
