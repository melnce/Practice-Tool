#!/usr/bin/env node
/**
 * Phase 3 UI screenshot pass — fixed viewport, hamburger settings drawer, grid layout.
 * Extends phase 2c assertions with full region pairwise intersection checks.
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
const OUT = process.env.UI_SCREENSHOT_OUT
  ? path.resolve(ROOT, process.env.UI_SCREENSHOT_OUT)
  : path.join(ROOT, "reports/ui/phase3b");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SEED = 424242;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1900, height: 1000 },
  { width: 2560, height: 1400 },
];

const HAND_SIZES = [4, 7, 10];

/** Region ids checked for zero overlap (phase 3 layout). */
const REGION_IDS = [
  "settingsToggle",
  "historyToggle",
  "redHand",
  "redLeader",
  "redStatsContainer",
  "redBoard",
  "blueBoard",
  "blueLeader",
  "blueStatsContainer",
  "blueHand",
  "turnControls",
];

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

function assertNoBoxIntersection(page, idA, idB, label) {
  return page.evaluate(
    ({ idA, idB, label }) => {
      const a = document.getElementById(idA);
      const b = document.getElementById(idB);
      if (!a || !b) {
        return { ok: false, reason: `missing #${idA} or #${idB} for ${label}` };
      }
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (
        (ra.width === 0 && ra.height === 0) ||
        (rb.width === 0 && rb.height === 0)
      ) {
        return { ok: true, skipped: true };
      }
      const overlapX =
        Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY =
        Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX > 2 && overlapY > 2) {
        return {
          ok: false,
          reason: `${label}: #${idA} × #${idB} overlap ${overlapX.toFixed(1)}×${overlapY.toFixed(1)}px`,
        };
      }
      return { ok: true };
    },
    { idA, idB, label },
  );
}

async function runRegionPairwiseAssertions(page, viewportLabel, context = "") {
  const suffix = context ? ` ${context}` : "";
  for (let i = 0; i < REGION_IDS.length; i++) {
    for (let j = i + 1; j < REGION_IDS.length; j++) {
      const idA = REGION_IDS[i];
      const idB = REGION_IDS[j];
      const label = `${idA}×${idB}`;
      const result = await assertNoBoxIntersection(page, idA, idB, label);
      if (!result.ok) {
        throw new Error(
          `Region intersection at ${viewportLabel}${suffix}: ${result.reason}`,
        );
      }
      if (!result.skipped) {
        console.log(`✓ ${viewportLabel}${suffix} ${label}`);
      }
    }
  }
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
    return { ok: true };
  }, sidePrefix);
}

const FURNITURE_CARD_PAIRS = [
  ["redCrests", "redHand", "red crests×hand"],
  ["redCrests", "redBoard", "red crests×board"],
  ["redStats", "redHand", "red stats×hand"],
  ["redStats", "redBoard", "red stats×board"],
  ["blueCrests", "blueHand", "blue crests×hand"],
  ["blueCrests", "blueBoard", "blue crests×board"],
  ["blueStats", "blueHand", "blue stats×hand"],
  ["blueStats", "blueBoard", "blue stats×board"],
];

async function runFurnitureIntersectionAssertions(page, label, context = "") {
  const suffix = context ? ` ${context}` : "";
  for (const [idA, idB, pairLabel] of FURNITURE_CARD_PAIRS) {
    const result = await assertNoBoxIntersection(page, idA, idB, pairLabel);
    if (!result.ok) {
      throw new Error(
        `Furniture intersection at ${label}${suffix}: ${result.reason}`,
      );
    }
    console.log(`✓ ${label}${suffix} ${pairLabel}`);
  }
}

function assertNoPageScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollH = Math.max(doc.scrollHeight, body.scrollHeight);
    const clientH = window.innerHeight;
    if (scrollH > clientH + 2) {
      return {
        ok: false,
        reason: `page scroll: scrollHeight=${scrollH} innerHeight=${clientH}`,
      };
    }
    return { ok: true, scrollH, clientH };
  });
}

function assertPlayAreaInView(page) {
  const regionIds = REGION_IDS.filter((id) => id !== "settingsToggle");
  return page.evaluate((ids) => {
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
  }, regionIds);
}

function assertNoMulliganHandOverlap(page, sidePrefix) {
  return page.evaluate((prefix) => {
    const btn = document.getElementById(`${prefix}MulliganConfirm`);
    const hand = document.getElementById(`${prefix}Hand`);
    if (!btn || !hand) {
      return {
        ok: false,
        reason: `missing ${prefix}MulliganConfirm or ${prefix}Hand`,
      };
    }
    const style = getComputedStyle(btn);
    if (style.display === "none" || btn.hidden) {
      return { ok: false, reason: `${prefix} mulligan button not visible` };
    }
    const br = btn.getBoundingClientRect();
    if (br.width === 0 || br.height === 0) {
      return { ok: false, reason: `${prefix} mulligan button has zero size` };
    }
    const cards = [...hand.querySelectorAll(".card")];
    for (const card of cards) {
      const cr = card.getBoundingClientRect();
      const overlapX =
        Math.min(br.right, cr.right) - Math.max(br.left, cr.left);
      const overlapY =
        Math.min(br.bottom, cr.bottom) - Math.max(br.top, cr.top);
      if (overlapX > 2 && overlapY > 2) {
        return {
          ok: false,
          reason: `${prefix} mulligan×hand overlap ${overlapX.toFixed(1)}×${overlapY.toFixed(1)}px`,
        };
      }
    }
    return { ok: true };
  }, sidePrefix);
}

function assertBoardZonesSymmetric(page) {
  return page.evaluate(() => {
    const red = document.getElementById("redBoard");
    const blue = document.getElementById("blueBoard");
    if (!red || !blue) {
      return { ok: false, reason: "missing redBoard or blueBoard" };
    }
    const rr = red.getBoundingClientRect();
    const br = blue.getBoundingClientRect();
    const dw = Math.abs(rr.width - br.width);
    const dl = Math.abs(rr.left - br.left);
    const dr = Math.abs(rr.right - br.right);
    if (dw > 2 || dl > 2 || dr > 2) {
      return {
        ok: false,
        reason: `board zones asymmetric: red ${rr.width.toFixed(1)}px @${rr.left.toFixed(1)}-${rr.right.toFixed(1)} blue ${br.width.toFixed(1)}px @${br.left.toFixed(1)}-${br.right.toFixed(1)}`,
      };
    }
    return { ok: true, width: Math.round(rr.width) };
  });
}

async function showMulliganButtons(page) {
  await page.evaluate(() => {
    for (const id of ["redMulliganConfirm", "blueMulliganConfirm"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "inline-flex";
    }
  });
}

async function hideMulliganButtons(page) {
  await page.evaluate(() => {
    for (const id of ["redMulliganConfirm", "blueMulliganConfirm"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
  });
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

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  saved ${path.relative(ROOT, file)}`);
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

async function stageBothHandSizes(page, redCount, blueCount) {
  await page.evaluate(
    ({ redCount, blueCount }) => {
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

      state.players.second.hand = mkHand("second", redCount);
      state.players.first.hand = mkHand("first", blueCount);
      window.__svwbTest?.render();
    },
    { redCount, blueCount },
  );
  await page.waitForTimeout(500);
}

async function stagePlayableUnplayableHand(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    const getCard = (id) => window.cardDatabase?.getCardById?.(id);
    if (!state || !getCard)
      throw new Error("gameState or cardDatabase missing");

    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.roundCount = 3;
    state.players.first.pp = 1;
    state.players.first.maxPP = 6;
    state.players.second.pp = 6;
    state.players.second.maxPP = 6;
    state.players.first.board = [];
    state.players.second.board = [];

    const mk = (id, owner, patch = {}) => {
      const tmpl = getCard(id);
      if (!tmpl) throw new Error(`missing card ${id}`);
      return {
        ...structuredClone(tmpl),
        uid: `mix_${id}_${Math.random().toString(36).slice(2, 6)}`,
        owner,
        buffs: { attack: 0, defense: 0 },
        zone: "hand",
        ...patch,
      };
    };

    state.players.first.hand = [
      mk("10041310", "first"),
      mk("10001110", "first"),
      mk("10001130", "first"),
    ];
    state.players.second.hand = [];
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(500);

  const glowCheck = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#blueHand .card")];
    if (cards.length < 2) {
      return { ok: false, reason: "need at least two hand cards" };
    }
    cards.forEach((card) => {
      card.classList.remove(
        "playable-glow",
        "enhance-ready",
        "alternate-ready",
      );
    });
    cards[0].classList.add("playable-glow");

    const playable = cards.filter((c) => c.classList.contains("playable-glow"));
    const unplayable = cards.filter(
      (c) =>
        !c.classList.contains("playable-glow") &&
        !c.classList.contains("enhance-ready") &&
        !c.classList.contains("alternate-ready") &&
        !c.classList.contains("card-back"),
    );
    const unplayableOpacity = unplayable.map(
      (c) => getComputedStyle(c).opacity,
    );
    const unplayableFilter = unplayable.map((c) => getComputedStyle(c).filter);
    return {
      ok: playable.length >= 1 && unplayable.length >= 1,
      playable: playable.length,
      unplayable: unplayable.length,
      unplayableOpacity,
      unplayableFilter,
    };
  });
  if (!glowCheck.ok) {
    throw new Error(
      `Playable/unplayable staging failed: playable=${glowCheck.playable} unplayable=${glowCheck.unplayable}`,
    );
  }
  if (
    glowCheck.unplayableOpacity.some((o) => Number(o) < 0.98) ||
    glowCheck.unplayableFilter.some((f) => f !== "none")
  ) {
    throw new Error(
      `Unplayable card still dimmed: opacity=${glowCheck.unplayableOpacity.join(",")} filter=${glowCheck.unplayableFilter.join(",")}`,
    );
  }
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

  await openSettingsDrawer(page);
  await page.selectOption("#scriptSideSelect", "second");
  await page.click("#scriptRecordBtn");
  await page.check("#scriptHiddenHandToggle");
  await closeSettingsDrawer(page);
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

async function runOverlapAssertions(page, viewportLabel, context = "") {
  const suffix = context ? ` ${context}` : "";

  const noScroll = await assertNoPageScroll(page);
  if (!noScroll.ok) {
    throw new Error(
      `Page scroll at ${viewportLabel}${suffix}: ${noScroll.reason}`,
    );
  }
  console.log(
    `✓ ${viewportLabel}${suffix} no page scroll (${noScroll.scrollH}/${noScroll.clientH})`,
  );

  await showMulliganButtons(page);

  for (const side of ["red", "blue"]) {
    const crestOverlap = await assertNoStatsCrestOverlap(page, side);
    if (!crestOverlap.ok) {
      throw new Error(
        `Stats/crest overlap at ${viewportLabel}${suffix}: ${crestOverlap.reason}`,
      );
    }
    console.log(`✓ ${viewportLabel}${suffix} ${side} stats/crest`);
  }

  await runFurnitureIntersectionAssertions(page, viewportLabel, context);
  await runRegionPairwiseAssertions(page, viewportLabel, context);

  for (const side of ["red", "blue"]) {
    const mulliganOverlap = await assertNoMulliganHandOverlap(page, side);
    if (!mulliganOverlap.ok) {
      throw new Error(
        `Mulligan/hand overlap at ${viewportLabel}${suffix}: ${mulliganOverlap.reason}`,
      );
    }
    console.log(`✓ ${viewportLabel}${suffix} ${side} mulligan×hand`);
  }

  const boardSymmetry = await assertBoardZonesSymmetric(page);
  if (!boardSymmetry.ok) {
    throw new Error(
      `Board symmetry at ${viewportLabel}${suffix}: ${boardSymmetry.reason}`,
    );
  }
  console.log(
    `✓ ${viewportLabel}${suffix} board zones symmetric (${boardSymmetry.width}px)`,
  );

  const inView = await assertPlayAreaInView(page);
  if (!inView.ok) {
    throw new Error(
      `Play area out of view at ${viewportLabel}${suffix}: ${inView.reason}`,
    );
  }
  console.log(`✓ ${viewportLabel}${suffix} play area in view`);
}

async function stageCrestPyramid(page) {
  await page.evaluate(() => {
    const state = window.gameState;
    if (!state) throw new Error("gameState missing");
    const names = [
      "Crest Slot 1",
      "Crest Slot 2",
      "Crest Slot 3",
      "Crest Slot 4",
      "Crest Slot 5",
    ];
    state.players.first.crests = names.map((name, i) => ({
      name,
      image: `/images/crests/pyramid_${i + 1}.png`,
      description: name,
      counters: {},
      triggers: [],
    }));
    window.__svwbTest?.render();
  });
  await page.waitForTimeout(400);
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

    for (const { width, height } of VIEWPORTS) {
      const label = `${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE}/?test=1`);
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => !!window.__svwbTest);

      await startGame(page);
      await stageMidGameBoard(page);
      await runOverlapAssertions(page, label);
      await hideMulliganButtons(page);

      await screenshot(page, `baseline-drawer-closed-${width}.png`);
      await page.click("#settingsToggle");
      await page.waitForTimeout(250);
      await screenshot(page, `baseline-drawer-open-${width}.png`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }

    for (const { width, height } of VIEWPORTS) {
      const label = `${width}x${height}`;
      for (const handSize of HAND_SIZES) {
        await page.setViewportSize({ width, height });
        await page.goto(`${BASE}/?test=1`);
        await page.waitForLoadState("networkidle");
        await page.waitForFunction(() => !!window.__svwbTest);
        await startGame(page);
        await stageBothHandSizes(page, handSize, handSize);
        await runOverlapAssertions(page, label, `hands-${handSize}`);
        await hideMulliganButtons(page);
        await screenshot(page, `state-hands-${handSize}-${width}.png`);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageMidGameBoard(page);
    await screenshot(page, "state-midgame-board.png");

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stageCrestPyramid(page);
    await runOverlapAssertions(page, "1440x900", "crest-pyramid");
    await screenshot(page, "state-crest-pyramid-filled.png");

    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page);
    await stagePlayableUnplayableHand(page);
    await screenshot(page, "state-playable-unplayable-hand.png");

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
