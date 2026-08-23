#!/usr/bin/env node
/**
 * Leader HP pill hitbox verification — bounding-box measurements, interactivity,
 * perspective toggle, and before/after screenshots.
 */
import { chromium } from "@playwright/test";
import {
  closeSettingsDrawer,
  openSettingsDrawer,
} from "./settings-drawer-helpers.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reports/ui/leader-hitbox");
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const SEED = 424242;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1900, height: 1000 },
  { width: 2560, height: 1400 },
];

const LEADER_HITBOX_MIN_WIDTH_RATIO = 2.4;
const LEADER_HITBOX_HEIGHT_TOLERANCE = 3;
/** Square leader size before widening (matches --leader-bar-size at each breakpoint). */
const BASELINE_SQUARE = { 1440: 56, 1900: 58, 2560: 60 };

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

function measureLeaders(page) {
  return page.evaluate(
    ({ minWidthRatio, heightTolerance }) => {
      const root = getComputedStyle(document.documentElement);
      const barSize = parseFloat(root.getPropertyValue("--leader-bar-size"));
      const barWidth = parseFloat(root.getPropertyValue("--leader-bar-width"));
      const out = {};
      for (const id of ["blueLeader", "redLeader"]) {
        const el = document.getElementById(id);
        if (!el) return { ok: false, reason: `missing #${id}` };
        const cs = getComputedStyle(el);
        const width = parseFloat(cs.width);
        const height = parseFloat(cs.height);
        const hitbox = el.getBoundingClientRect();
        out[id] = {
          width,
          height,
          hitboxWidth: Math.round(hitbox.width * 10) / 10,
          hitboxHeight: Math.round(hitbox.height * 10) / 10,
          barSize,
          barWidth,
        };
        if (width < height * minWidthRatio) {
          return {
            ok: false,
            reason: `#${id} width ${width}px < ${minWidthRatio}× height ${height}px`,
            measurements: out,
          };
        }
        if (Math.abs(height - barSize) > heightTolerance) {
          return {
            ok: false,
            reason: `#${id} height ${height}px != --leader-bar-size ${barSize}px`,
            measurements: out,
          };
        }
        if (width <= height) {
          return {
            ok: false,
            reason: `#${id} not wider than tall: ${width}×${height}px`,
            measurements: out,
          };
        }
      }
      return { ok: true, measurements: out };
    },
    {
      minWidthRatio: LEADER_HITBOX_MIN_WIDTH_RATIO,
      heightTolerance: LEADER_HITBOX_HEIGHT_TOLERANCE,
    },
  );
}

async function startGame(page, seed = SEED) {
  await openSettingsDrawer(page);
  await page.fill("#seedInput", String(seed));
  await page.click("#startGameBtn");
  await page.waitForFunction(
    () => window.gameState?.gameStarted === true,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(400);
  await closeSettingsDrawer(page);
  await page.waitForTimeout(150);
}

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
    state.players.second.pp = 6;
    state.players.second.maxPP = 6;
    state.players.first.board = [];
    state.players.second.board = [];
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(300);
}

async function mouseDragToTarget(page, sourceSel, targetSel) {
  const source = page.locator(sourceSel);
  const target = page.locator(targetSel);
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  if (!s || !t)
    throw new Error(`drag targets not visible: ${sourceSel} → ${targetSel}`);
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function testAttackLeader(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard) throw new Error("gameState missing");
    const tmpl = getCard("10021110");
    if (!tmpl) throw new Error("missing attacker card");
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.board = [
      {
        ...structuredClone(tmpl),
        uid: "atk_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
        zone: "board",
        can_attack: true,
        hasAttacked: false,
        justPlayed: false,
      },
    ];
    state.players.second.board = [];
    state.players.second.hp = 20;
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(300);

  const hpBefore = await page.evaluate(
    () => window.gameState.players.second.hp,
  );
  await mouseDragToTarget(page, "#blueBoard .card", "#redLeader");
  await page.waitForTimeout(400);
  const hpAfter = await page.evaluate(() => window.gameState.players.second.hp);
  if (hpAfter >= hpBefore) {
    throw new Error(
      `Attack leader failed: HP ${hpBefore} → ${hpAfter} (expected damage)`,
    );
  }
  console.log(`✓ attack leader: HP ${hpBefore} → ${hpAfter}`);
}

async function testLeaderEffectTarget(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard) throw new Error("gameState missing");
    const spellTpl = getCard("10041310");
    const enemyTpl = getCard("10001110");
    if (!spellTpl || !enemyTpl) throw new Error("missing test cards");
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
    state.players.second.hp = 20;
    state.players.first.hand = [
      {
        ...structuredClone(spellTpl),
        uid: "spell_uid2",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
        zone: "hand",
      },
    ];
    state.players.second.board = [
      {
        ...structuredClone(enemyTpl),
        uid: "enemy_uid2",
        owner: "second",
        buffs: { attack: 0, defense: 0 },
        zone: "board",
        peak_defense: Number(enemyTpl.defense),
      },
    ];
    state.pendingTargetEffect = null;
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(300);

  await page.locator("#blueHand .card").first().click({ button: "right" });
  await page.waitForSelector("body.select-mode", { timeout: 8000 });
  await page.evaluate(() => {
    const state = window.gameState;
    state.pendingTargetEffect = {
      ...state.pendingTargetEffect,
      canTargetLeader: true,
    };
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(200);

  const selectable = await page.locator("#redLeader.selectable").count();
  if (selectable < 1) {
    throw new Error("Leader not selectable when canTargetLeader is true");
  }
  await page.locator("#redLeader").click();
  await page.waitForTimeout(400);
  const pendingAfter = await page.evaluate(
    () => window.gameState.pendingTargetEffect,
  );
  if (pendingAfter) {
    throw new Error("Leader click did not resolve pending target selection");
  }
  console.log(
    "✓ leader effect target: selectable and click resolved selection",
  );
}

async function testGodModeLeaderHP(page) {
  const setOk = await page.evaluate(() => {
    const t = window.__svwbTest;
    if (!t?.setLeaderHP) return false;
    t.setLeaderHP("second", 7);
    t.render();
    return window.gameState.players.second.hp === 7;
  });
  if (!setOk) {
    throw new Error("God mode setLeaderHP failed");
  }
  const displayed = await page.locator("#redHP").textContent();
  if (displayed?.trim() !== "7") {
    throw new Error(`God mode HP display mismatch: got "${displayed}"`);
  }
  console.log("✓ god mode setLeaderHP → display 7");
}

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  saved ${path.relative(ROOT, file)}`);
}

async function main() {
  ensureDir(OUT);

  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  const consoleErrors = [];
  const allMeasurements = [];

  try {
    await waitForServer(BASE);

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageMidGameBoard(page);

    await testAttackLeader(page);
    await testLeaderEffectTarget(page);
    await testGodModeLeaderHP(page);

    for (const { width, height } of VIEWPORTS) {
      const label = `${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);

      const hitbox = await measureLeaders(page);
      if (!hitbox.ok) {
        throw new Error(`Leader hitbox at ${label}: ${hitbox.reason}`);
      }

      const m = hitbox.measurements;
      const baseline = BASELINE_SQUARE[width] ?? m.blueLeader.barSize;
      const row = {
        viewport: label,
        baselineSquare: baseline,
        blue: m.blueLeader,
        red: m.redLeader,
      };
      allMeasurements.push(row);
      console.log(
        `✓ ${label} blue ${m.blueLeader.width}×${m.blueLeader.height}px red ${m.redLeader.width}×${m.redLeader.height}px (was ~${baseline}×${baseline})`,
      );

      await screenshot(page, `leader-pill-${width}.png`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageMidGameBoard(page);
    await screenshot(page, "leader-pill-before-toggle-1440.png");

    await openSettingsDrawer(page);
    await page.check("#activeOnBottomToggle");
    await closeSettingsDrawer(page);
    await page.waitForTimeout(400);

    const flipped = await measureLeaders(page);
    if (!flipped.ok) {
      throw new Error(
        `Leader hitbox after perspective toggle: ${flipped.reason}`,
      );
    }
    console.log(
      `✓ perspective toggle blue ${flipped.measurements.blueLeader.width}×${flipped.measurements.blueLeader.height}px`,
    );
    await screenshot(page, "leader-pill-active-on-bottom-1440.png");

    const filteredErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("ort.min.js"),
    );
    if (filteredErrors.length) {
      throw new Error(`Console errors: ${filteredErrors.join("; ")}`);
    }
    console.log("✓ Console clean");

    fs.writeFileSync(
      path.join(OUT, "measurements.json"),
      JSON.stringify(allMeasurements, null, 2),
    );
    console.log(`\nMeasurements written to ${path.relative(ROOT, OUT)}/`);

    await browser.close();
  } finally {
    preview.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
