#!/usr/bin/env node
/**
 * Phase 2 UI screenshot pass — headless Chromium, built app, fixed seed.
 * Asserts header/stats overlap clearance; captures required visual states.
 *
 * Phase 2c: furniture-vs-cards intersection assertions (crests/stats × hand/board),
 * hand-size evidence at 4 / 7 / 10, playable-vs-unplayable hand screenshot.
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
  : path.join(ROOT, "reports/ui/phase2c");
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SEED = 424242;
const WIDTHS = [1440, 1900, 2560];
const HAND_SIZES = [4, 7, 10];
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

async function runFurnitureIntersectionAssertions(page, width, context = "") {
  const suffix = context ? ` ${context}` : "";
  for (const [idA, idB, label] of FURNITURE_CARD_PAIRS) {
    const result = await assertNoBoxIntersection(page, idA, idB, label);
    if (!result.ok) {
      throw new Error(
        `Furniture intersection at ${width}px${suffix}: ${result.reason}`,
      );
    }
    console.log(`✓ ${width}px${suffix} ${label}`);
  }
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

/** Blue hand with one playable (green) and one unplayable (normal) card. */
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

async function runOverlapAssertions(page, width, context = "") {
  const suffix = context ? ` ${context}` : "";

  const headerOverlap = await assertNoHeaderStatsOverlap(page);
  if (!headerOverlap.ok) {
    throw new Error(
      `Header overlap at ${width}px${suffix}: ${headerOverlap.reason}`,
    );
  }
  console.log(`✓ ${width}px${suffix} header/stats gap=${headerOverlap.gap}px`);

  for (const side of ["red", "blue"]) {
    const crestOverlap = await assertNoStatsCrestOverlap(page, side);
    if (!crestOverlap.ok) {
      throw new Error(
        `Stats/crest overlap at ${width}px${suffix}: ${crestOverlap.reason}`,
      );
    }
    console.log(
      `✓ ${width}px${suffix} ${side} stats/crest gap=${crestOverlap.gap}px`,
    );
  }

  await runFurnitureIntersectionAssertions(page, width, context);

  const inView = await assertPlayAreaInView(page);
  if (!inView.ok) {
    throw new Error(
      `Play area out of view at ${width}px${suffix}: ${inView.reason}`,
    );
  }
  console.log(`✓ ${width}px${suffix} play area in view`);
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

    for (const width of WIDTHS) {
      for (const handSize of HAND_SIZES) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        await page.goto(`${BASE}/?test=1`);
        await page.waitForLoadState("networkidle");
        await page.waitForFunction(() => !!window.__svwbTest);
        await startGame(page);
        await stageRedHandSize(page, handSize);
        await runOverlapAssertions(page, width, `hand-${handSize}`);
        await screenshot(page, `state-red-hand-${handSize}-${width}.png`);
      }
    }

    await page.setViewportSize({ width: 1440, height: VIEWPORT_HEIGHT });

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
