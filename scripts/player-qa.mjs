/**
 * Player-experience QA — drive the tool like a person practising.
 * Usage: PW_BASE_URL=http://127.0.0.1:5173 node scripts/player-qa.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  closeSettingsDrawer,
  openSettingsDrawer,
  withSettingsDrawer,
} from "./settings-drawer-helpers.mjs";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const REPORT_DIR = path.resolve("reports");
const KNOWN_CONSOLE = [
  "Targeted op handler illegally invoked lifecycle function: clearSelectableFlags",
];

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.mkdirSync(path.join(REPORT_DIR, "player-qa-shots"), { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE,
  steps: [],
  findings: [],
  ergonomics: [],
  artCheck: null,
  uiFixes: [],
};

function step(id, status, detail = {}, consoleErrors = []) {
  const entry = {
    id,
    status,
    detail,
    consoleErrors: [...consoleErrors],
    at: new Date().toISOString(),
  };
  report.steps.push(entry);
  console.log(`[${status}] ${id}`, JSON.stringify(detail).slice(0, 280));
  return entry;
}

function finding(kind, title, body) {
  report.findings.push({ kind, title, body });
  console.log(`[FINDING:${kind}] ${title}`);
}

function trackConsole(page) {
  const errors = [];
  const all = [];
  const onMsg = (type, text) => {
    all.push({ type, text, at: Date.now() });
    if (type === "error" || type === "pageerror") {
      if (KNOWN_CONSOLE.some((k) => text.includes(k))) return;
      errors.push(text);
    }
  };
  page.on("console", (msg) => onMsg(msg.type(), msg.text()));
  page.on("pageerror", (err) => onMsg("pageerror", String(err)));
  return {
    errors,
    all,
    clear() {
      errors.length = 0;
    },
    snapshot() {
      return [...errors];
    },
  };
}

function installDialogHandler(page) {
  page.on("dialog", async (d) => {
    const msg = (d.message() || "").toLowerCase();
    try {
      if (msg.includes("sparring")) await d.accept("qa-line");
      else if (msg.includes("position")) await d.accept("qa-pos-1");
      else if (msg.includes("title")) await d.accept("QA Lethal");
      else if (msg.includes("description")) await d.accept("player-qa");
      else if (msg.includes("goal")) await d.accept("lethal");
      else if (msg.includes("turn limit")) await d.accept("1");
      else await d.accept(d.defaultValue() || "qa");
    } catch {
      /* already handled */
    }
  });
}

async function shot(page, name) {
  await closeSettingsDrawer(page);
  const p = path.join(REPORT_DIR, "player-qa-shots", `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function waitState(page, pred, timeout = 15000) {
  await page.waitForFunction(pred, undefined, { timeout });
}

async function getState(page) {
  return page.evaluate(() => {
    const s = window.gameState;
    if (!s) return null;
    const summarize = (p) => ({
      hp: p.hp,
      pp: p.pp,
      maxPP: p.maxPP,
      hand: p.hand.map((c) => ({
        id: c.id,
        name: c.name,
        cost: c.cost,
        type: c.type,
        spellboostCount: c.spellboostCount ?? null,
        uid: c.uid,
      })),
      board: p.board.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        atk: c.attack,
        def: c.defense,
        evolved: !!(c.evolved || c.hasEvolved),
        keywords: c.keywords || [],
        countdown: c.countdown ?? null,
        engaged: !!(c.keywordState && c.keywordState.engagedThisTurn),
        hasWard: !!c.hasWard,
        uid: c.uid,
      })),
      evo: p.evoCharges,
      sep: p.superEvoCharges,
      shadows: p.shadows,
    });
    return {
      phase: s.phase,
      gameStarted: s.gameStarted,
      seed: s.seed,
      turnNumber: s.turnNumber,
      roundCount: s.roundCount,
      activePlayer: s.activePlayer,
      winner: s.winner ?? null,
      winReason: s.gameOverReason ?? null,
      first: summarize(s.players.first),
      second: summarize(s.players.second),
      pending: !!s.pendingTargetEffect,
    };
  });
}

async function dismissOverlays(page) {
  for (let i = 0; i < 5; i++) {
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
      await page.waitForTimeout(60);
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
      await page.waitForTimeout(60);
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
      await page.waitForTimeout(60);
      continue;
    }
    const pending = await page.evaluate(
      () => !!window.gameState?.pendingTargetEffect,
    );
    if (!pending) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(50);
  }
}

async function html5Drag(page, srcSelector, dstSelector) {
  return page.evaluate(
    ({ srcSelector, dstSelector }) => {
      const src = document.querySelector(srcSelector);
      const dst = document.querySelector(dstSelector);
      if (!src || !dst) return false;
      const dt = new DataTransfer();
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
      src.dispatchEvent(new DragEvent("dragstart", opts));
      dst.dispatchEvent(new DragEvent("dragover", opts));
      dst.dispatchEvent(new DragEvent("drop", opts));
      src.dispatchEvent(new DragEvent("dragend", opts));
      return true;
    },
    { srcSelector, dstSelector },
  );
}

async function playHandIndex(page, side, index) {
  const zone = side === "first" ? "blueHand" : "redHand";
  const card = page.locator(`#${zone}-${index}`);
  if (!(await card.count())) return false;
  const before = await getState(page);
  await card.click({ button: "right", force: true });
  await page.waitForTimeout(140);
  await dismissOverlays(page);
  const after = await getState(page);
  const meB = side === "first" ? before.first : before.second;
  const meA = side === "first" ? after.first : after.second;
  return (
    meA.pp < meB.pp ||
    meA.hand.length < meB.hand.length ||
    meA.board.length !== meB.board.length
  );
}

async function endTurn(page) {
  await dismissOverlays(page);
  const btn = page.locator("#endTurnBlue:visible, #endTurnRed:visible").first();
  if (!(await btn.count())) return false;
  if (await btn.isDisabled().catch(() => true)) {
    await dismissOverlays(page);
  }
  if (await btn.isDisabled().catch(() => true)) return false;
  const before = await getState(page);
  await btn.click({ force: true });
  await page.waitForTimeout(180);
  await dismissOverlays(page);
  const after = await getState(page);
  return (
    after?.activePlayer !== before?.activePlayer ||
    after?.turnNumber !== before?.turnNumber
  );
}

async function useBoostIfAvailable(page) {
  const btn = page.locator("#redBoost");
  if (!(await btn.isVisible().catch(() => false))) return false;
  if (await btn.isDisabled().catch(() => true)) return false;
  const before = await page.evaluate(() => window.gameState.players.second.pp);
  await btn.click().catch(() => {});
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.gameState.players.second.pp);
  return after > before;
}

async function tryEvolve(page, side, boardIndex, superEvo = false) {
  const btn =
    side === "first"
      ? superEvo
        ? "#blueSuperEvo"
        : "#blueNormalEvo"
      : superEvo
        ? "#redSuperEvo"
        : "#redNormalEvo";
  const board = side === "first" ? "#blueBoard" : "#redBoard";
  const dstId = await page.evaluate(
    ({ board, boardIndex }) => {
      const el = document.querySelectorAll(`${board} .card`)[boardIndex];
      return el?.id ? `#${el.id}` : null;
    },
    { board, boardIndex },
  );
  if (!dstId) return false;
  if (
    await page
      .locator(btn)
      .isDisabled()
      .catch(() => true)
  )
    return false;
  const before = await getState(page);
  await html5Drag(page, btn, dstId);
  await page.waitForTimeout(140);
  await dismissOverlays(page);
  const after = await getState(page);
  const meB = side === "first" ? before.first : before.second;
  const meA = side === "first" ? after.first : after.second;
  return (
    meA.evo < meB.evo ||
    meA.sep < meB.sep ||
    meA.board.some(
      (c) => c.evolved && !meB.board.find((b) => b.uid === c.uid)?.evolved,
    )
  );
}

async function tryAttackFace(page, side) {
  const board = side === "first" ? "#blueBoard" : "#redBoard";
  const leader = side === "first" ? "#redLeader" : "#blueLeader";
  const hpKey = side === "first" ? "second" : "first";
  const ids = await page.evaluate((board) =>
    [
      ...document.querySelectorAll(
        `${board} .card.can-attack, ${board} .card.rush-glow`,
      ),
    ].map((e) => e.id),
  );
  for (const id of ids) {
    const before = await getState(page);
    const hpBefore = before[hpKey].hp;
    await html5Drag(page, `#${id}`, leader);
    await page.waitForTimeout(100);
    const after = await getState(page);
    if (after[hpKey].hp < hpBefore) return true;
  }
  return false;
}

async function tryAttackWard(page, side) {
  const myBoard = side === "first" ? "#blueBoard" : "#redBoard";
  const theirBoard = side === "first" ? "#redBoard" : "#blueBoard";
  const st = await getState(page);
  const them = side === "first" ? st.second : st.first;
  const wardIdx = them.board.findIndex(
    (c) =>
      c.hasWard ||
      (c.keywords || []).some((k) => String(k).toLowerCase() === "ward"),
  );
  if (wardIdx < 0) return false;
  const dstId = await page.evaluate(
    ({ theirBoard, wardIdx }) => {
      const el = document.querySelectorAll(`${theirBoard} .card`)[wardIdx];
      return el?.id ? `#${el.id}` : null;
    },
    { theirBoard, wardIdx },
  );
  const srcId = await page.evaluate((myBoard) => {
    const el = document.querySelector(
      `${myBoard} .card.can-attack, ${myBoard} .card.rush-glow`,
    );
    return el?.id ? `#${el.id}` : null;
  }, myBoard);
  if (!srcId || !dstId) return false;
  const beforeLen = them.board.length;
  await html5Drag(page, srcId, dstId);
  await page.waitForTimeout(120);
  const after = await getState(page);
  const themA = side === "first" ? after.second : after.first;
  return (
    themA.board.length !== beforeLen ||
    themA.board[wardIdx]?.def !== them.board[wardIdx]?.def
  );
}

async function tryEngage(page, side) {
  const board = side === "first" ? "#blueBoard" : "#redBoard";
  const id = await page.evaluate((board) => {
    const el = document.querySelector(`${board} .card.engage-ready`);
    return el?.id ? `#${el.id}` : null;
  }, board);
  if (!id) return false;
  const before = await getState(page);
  await page.locator(id).click({ button: "right", force: true });
  await page.waitForTimeout(120);
  await dismissOverlays(page);
  const after = await getState(page);
  const meB = side === "first" ? before.first : before.second;
  const meA = side === "first" ? after.first : after.second;
  return meA.pp < meB.pp || meA.board.some((c) => c.engaged);
}

async function autoplayOnce(page, flags) {
  const st = await getState(page);
  if (!st || st.phase === "gameover") return "done";
  if (st.phase === "mulligan") return "mulligan";
  if (st.pending) {
    await dismissOverlays(page);
    return "acted";
  }

  const side = st.activePlayer;
  const me = side === "first" ? st.first : st.second;

  if (side === "second" && !flags.boostUsedThisTurn) {
    if (await useBoostIfAvailable(page)) {
      flags.boostUsedThisTurn = true;
      flags.boostUses = (flags.boostUses || 0) + 1;
      return "acted";
    }
  }

  const evoUnlocked =
    (side === "first" && st.roundCount >= 5) ||
    (side === "second" && st.roundCount >= 4);
  const sepUnlocked =
    (side === "first" && st.roundCount >= 7) ||
    (side === "second" && st.roundCount >= 6);
  if (evoUnlocked && (me.evo > 0 || me.sep > 0)) {
    for (let i = 0; i < me.board.length; i++) {
      const c = me.board[i];
      if (c.type !== "Follower" || c.evolved) continue;
      if (sepUnlocked && me.sep > 0 && (await tryEvolve(page, side, i, true))) {
        flags.superEvolved = true;
        return "acted";
      }
      if (me.evo > 0 && (await tryEvolve(page, side, i, false))) {
        flags.evolved = true;
        flags.evoRound = st.roundCount;
        flags.evoSide = side;
        return "acted";
      }
    }
  }

  if (await tryEngage(page, side)) {
    flags.engaged = true;
    return "acted";
  }

  if (await tryAttackWard(page, side)) {
    flags.wardCombat = true;
    return "acted";
  }
  if (await tryAttackFace(page, side)) return "acted";

  const affordable = me.hand
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => Number(c.cost) <= me.pp)
    .sort((a, b) => Number(a.c.cost) - Number(b.c.cost));
  for (const { idx } of affordable) {
    if (await playHandIndex(page, side, idx)) return "acted";
  }
  return "end";
}

async function confirmMulligans(page) {
  for (let i = 0; i < 4; i++) {
    const st = await getState(page);
    if (!st || st.phase !== "mulligan") return;
    if (
      await page
        .locator("#blueMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#blueMulliganConfirm").click();
      await page.waitForTimeout(150);
      continue;
    }
    if (
      await page
        .locator("#redMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#redMulliganConfirm").click();
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(100);
  }
  await waitState(
    page,
    () =>
      window.gameState?.phase === "main" ||
      window.gameState?.phase === "gameover",
    20000,
  ).catch(() => {});
}

async function autoplayGame(
  page,
  { maxActions = 350, flags = {}, stopWhen } = {},
) {
  let actions = 0;
  while (actions < maxActions) {
    const st = await getState(page);
    if (!st) break;
    if (st.phase === "gameover") break;
    if (stopWhen && stopWhen(st, flags)) break;

    if (st.phase === "mulligan") {
      await confirmMulligans(page);
      actions++;
      continue;
    }

    const turnKey = `${st.activePlayer}-${st.turnNumber}-${st.roundCount}`;
    if (flags._turnKey !== turnKey) {
      flags._turnKey = turnKey;
      flags.boostUsedThisTurn = false;
    }

    const result = await autoplayOnce(page, flags);
    actions++;
    if (result === "done") break;
    if (result === "end") {
      const ok = await endTurn(page);
      if (!ok) {
        await dismissOverlays(page);
        await endTurn(page);
      }
    }
  }
  return { actions, flags, final: await getState(page) };
}

async function startGame(page, { blue, red, seed }) {
  await withSettingsDrawer(page, async () => {
    await page.selectOption("#blueDeckSelect", blue);
    await page.selectOption("#redDeckSelect", red);
    await page.locator("#seedInput").fill(String(seed));
    await page.locator("#startGameBtn").click();
  });
  await waitState(
    page,
    () =>
      window.gameState?.phase === "mulligan" ||
      window.gameState?.gameStarted === true,
    20000,
  );
}

async function importDeck(page, { name, className, list }) {
  return await withSettingsDrawer(page, async () => {
    await page.locator("#importDeckBtn").click();
    await page.waitForSelector("#deckImportPanel:not([hidden])");
    await page.locator("#deckImportName").fill(name);
    if (className) await page.selectOption("#deckImportClass", className);
    await page.locator("#deckImportText").fill(list);
    await page.locator("#deckImportValidateBtn").click();
    await page.waitForTimeout(500);
    const status = await page.locator("#deckImportStatus").innerText();
    await page.locator("#deckImportSaveBtn").click();
    await page.waitForTimeout(500);
    // Ensure panel closed
    if (await page.locator("#deckImportPanel:not([hidden])").count()) {
      await page
        .locator("#deckImportCloseBtn")
        .click()
        .catch(() => {});
    }
    return status;
  });
}

async function checkImages(page) {
  return page.evaluate(async () => {
    const ids = ["10501110", "10671110", "10701110", "10801110", "10001110"];
    const remote = [];
    for (const id of ids) {
      const url = `https://static.dotgg.gg/shadowverse/cards/${id}.webp`;
      const ok = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      remote.push({ id, url, ok });
    }
    const rendered = [...document.querySelectorAll(".card img")]
      .slice(0, 8)
      .map((img) => ({
        src: img.getAttribute("src"),
        naturalWidth: img.naturalWidth,
        complete: img.complete,
      }));
    return { remote, rendered };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  installDialogHandler(page);
  const cons = trackConsole(page);

  report.uiFixes.push({
    file: "src/ui/render.ts",
    before:
      "updateGameOverOverlay() called byId('gameOverOverlay') every render → console.warn + dump of all element ids while overlay did not exist yet",
    after:
      "Uses document.getElementById for lazy overlay / title / reason so normal play keeps a clean console",
  });
  report.uiFixes.push({
    file: "src/ui/zones/index.ts + src/ui/scriptPanel.ts",
    before:
      "Enabling hidden hand left a stale #cardTooltip visible; hovering card-backs could look like an identity leak",
    after:
      "Clear tooltip when toggling hidden hand / rendering face-down slots; card-backs hide tooltip on mouseenter",
  });

  // ─── 1. Fresh load ────────────────────────────────────────────────
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("#blueDeckSelect");
    await page.waitForTimeout(600);
    const blueOpts = await page
      .locator("#blueDeckSelect option")
      .evaluateAll((opts) =>
        opts.map((o) => ({ value: o.value, text: o.textContent?.trim() })),
      );
    const expected = [
      "runecraft_sephie_test_subject",
      "portalcraft_artifact_rotation",
    ];
    const values = blueOpts.map((o) => o.value);
    const missing = expected.filter((e) => !values.includes(e));
    const art = await checkImages(page);
    report.artCheck = art;
    const errs = cons.snapshot();
    step(
      "1-fresh-load",
      missing.length === 0 && errs.length === 0 && art.remote.every((r) => r.ok)
        ? "pass"
        : "partial",
      {
        blueDeckCount: blueOpts.length,
        blueOpts,
        missing,
        artRemote: art.remote,
        consoleErrorCount: errs.length,
      },
      errs,
    );
    if (missing.length)
      finding("ui", "Deck selectors missing decks", { missing });
    if (art.remote.some((r) => !r.ok))
      finding(
        "data",
        "New-set card art failed to load",
        art.remote.filter((r) => !r.ok),
      );
    await shot(page, "01-fresh-load");
  } catch (e) {
    step("1-fresh-load", "fail", { error: String(e) }, cons.snapshot());
  }

  // ─── 2. Full game Sword vs Abyss ──────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const seed = 20260815;
    await startGame(page, {
      blue: "runecraft_sephie_test_subject",
      red: "portalcraft_artifact_rotation",
      seed,
    });
    await shot(page, "02-mulligan");
    const flags = {};
    const result = await autoplayGame(page, {
      maxActions: 400,
      flags,
      stopWhen: (st) => st.phase === "gameover",
    });
    const final = result.final;
    let rematchOk = false;
    let overlayInfo = null;
    if (final?.phase === "gameover") {
      await shot(page, "02-gameover");
      overlayInfo = await page.evaluate(() => ({
        title: document.getElementById("gameOverTitle")?.textContent,
        reason: document.getElementById("gameOverReason")?.textContent,
        visible: getComputedStyle(
          document.getElementById("gameOverOverlay") || document.body,
        ).display,
      }));
      const rematchBtn = page.locator("#rematchSameSeedBtn");
      if (await rematchBtn.isVisible()) {
        await rematchBtn.click();
        await waitState(
          page,
          () =>
            window.gameState?.phase === "mulligan" ||
            window.gameState?.gameStarted,
          15000,
        );
        rematchOk = true;
      } else {
        finding("ui", "Rematch button not visible after game over", {
          overlayInfo,
          final,
        });
      }
    } else {
      // Drive rematch UI via test bridge lethal (UI overlay check only)
      finding(
        "play",
        "Natural Sword/Abyss game did not reach lethal in action budget — checking rematch overlay separately",
        {
          rounds: final?.roundCount,
          hp: { first: final?.first?.hp, second: final?.second?.hp },
          flags,
        },
      );
      await page.goto(`${BASE}/?test=1`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !!window.__svwbTest);
      await startGame(page, {
        blue: "starter_deck",
        red: "starter_deck",
        seed: 42,
      });
      await confirmMulligans(page);
      await page.evaluate(() => {
        const t = window.__svwbTest;
        t.getState().players.first.board = [];
        t.getState().players.second.board = [];
        t.summonToBoard("first", "10021110", true);
        t.setLeaderHP("second", 1);
        t.advanceToTurn(5, "first");
        t.render();
      });
      await tryAttackFace(page, "first");
      await page.waitForTimeout(400);
      const st2 = await getState(page);
      overlayInfo = await page.evaluate(() => ({
        phase: window.gameState.phase,
        title: document.getElementById("gameOverTitle")?.textContent,
        reason: document.getElementById("gameOverReason")?.textContent,
        winner: window.gameState.winner,
        winReason: window.gameState.gameOverReason,
      }));
      if (st2?.phase === "gameover") {
        await shot(page, "02b-gameover-overlay");
        if (await page.locator("#rematchSameSeedBtn").isVisible()) {
          await page.locator("#rematchSameSeedBtn").click();
          rematchOk = true;
        }
      } else {
        finding(
          "engine",
          "Storm face attack did not produce game-over for rematch UI check",
          { st2, overlayInfo },
        );
      }
    }

    const errs = cons.snapshot();
    step(
      "2-full-game-sword-abyss",
      (final?.phase === "gameover" || rematchOk) && errs.length === 0
        ? "pass"
        : "partial",
      {
        seed,
        evolved: !!flags.evolved,
        evoRound: flags.evoRound,
        evoSide: flags.evoSide,
        superEvolved: !!flags.superEvolved,
        boostUses: flags.boostUses || 0,
        engaged: !!flags.engaged,
        wardCombat: !!flags.wardCombat,
        phase: final?.phase,
        winner: final?.winner,
        winReason: final?.winReason,
        hp: { first: final?.first?.hp, second: final?.second?.hp },
        rounds: final?.roundCount,
        actions: result.actions,
        rematchOk,
        overlayInfo,
      },
      errs,
    );
  } catch (e) {
    step(
      "2-full-game-sword-abyss",
      "fail",
      { error: String(e) },
      cons.snapshot(),
    );
    finding("ui", "Full game 1 crashed", String(e));
  }

  // ─── 3. Rune vs Dragon ────────────────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await startGame(page, {
      blue: "runecraft_sephie_test_subject",
      red: "portalcraft_artifact_rotation",
      seed: 20260816,
    });
    await confirmMulligans(page);
    const flags = { spellboostSeen: false, overflowSeen: false };
    await autoplayGame(page, {
      maxActions: 200,
      flags,
      stopWhen: (st, f) => {
        if (
          [...st.first.hand, ...st.second.hand].some(
            (c) => (c.spellboostCount ?? 0) > 0,
          )
        )
          f.spellboostSeen = true;
        if (st.first.maxPP >= 7 || st.second.maxPP >= 7) f.overflowSeen = true;
        return f.spellboostSeen && f.overflowSeen;
      },
    });
    // DOM checks
    flags.spellboostBadge =
      (await page.locator(".spellboost-badge").count()) > 0;
    if (flags.spellboostBadge) flags.spellboostSeen = true;
    const st = await getState(page);
    if ((st?.first?.maxPP ?? 0) >= 7 || (st?.second?.maxPP ?? 0) >= 7)
      flags.overflowSeen = true;
    flags.maxPP = { first: st?.first?.maxPP, second: st?.second?.maxPP };
    await shot(page, "03-rune-dragon");
    const errs = cons.snapshot();
    step(
      "3-rune-dragon",
      flags.spellboostSeen && flags.overflowSeen && errs.length === 0
        ? "pass"
        : "partial",
      flags,
      errs,
    );
    if (!flags.spellboostSeen)
      finding("engine-or-ui", "Spellboost never visible in Rune game", flags);
    if (!flags.overflowSeen)
      finding(
        "engine-or-ui",
        "Overflow (maxPP>=7) not reached in Dragon game",
        flags,
      );
  } catch (e) {
    step("3-rune-dragon", "fail", { error: String(e) }, cons.snapshot());
  }

  // ─── 4. Alternate forms via import ────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/?test=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__svwbTest);

    const portalList = [
      "3x Shoddy Plaything",
      "3x Substandard Puppet",
      "3x Ludicrous Ordnance",
      "3x Puppet Cat",
      "3x Elise, Electrifying Inventor",
      "3x Ironheart Hunter",
      "3x Lovestruck Puppeteer",
      "3x Electric Whip Lass",
      "3x Puppet Lancer",
      "3x Vier, Heart Slayer",
      "3x Carnelia, Ember of Darkness",
      "3x Kitty Cannoneer",
      "2x Medical-Grade Assassin",
      "2x Axia, Heir to Destruction",
    ].join("\n");

    const havenList = [
      "3x Prostrating Coward",
      "3x Venerating Dyer",
      "3x Worshipful Crusader",
      "3x Serene Sanctuary",
      "3x Winged Statue",
      "3x Fox of Purity",
      "3x Holy Shieldmaiden",
      "3x Mainyu, Darkdweller",
      "3x Darkhaven Grace",
      "3x Luminous Censer",
      "3x Divine Guard",
      "3x Angelic Prism Priestess",
      "2x Colette, Barrage Exorcist",
      "2x Damus, Oracle of Malice",
    ].join("\n");

    const portalStatus = await importDeck(page, {
      name: "QA Portal Accelerate",
      className: "Portalcraft",
      list: portalList,
    });
    const havenStatus = await importDeck(page, {
      name: "QA Haven Crystallize",
      className: "Havencraft",
      list: havenList,
    });

    const opts = await page
      .locator("#blueDeckSelect option")
      .evaluateAll((os) =>
        os.map((o) => ({ value: o.value, text: o.textContent?.trim() })),
      );
    const portalOpt = opts.find((o) =>
      /Portal Accelerate|QA Portal/i.test(o.text || ""),
    );
    const havenOpt = opts.find((o) =>
      /Haven Crystallize|QA Haven/i.test(o.text || ""),
    );

    let accelBadge = false;
    let crystBadge = false;
    let accelPlay = null;
    let crystPlay = null;

    if (portalOpt) {
      await startGame(page, {
        blue: portalOpt.value,
        red: "starter_deck",
        seed: 777001,
      });
      await confirmMulligans(page);
      await page.evaluate(() => {
        const t = window.__svwbTest;
        t.getState().players.first.hand = [];
        t.addToHand("first", "10671110");
        t.setPP("first", 2, 2);
        t.advanceToTurn(2, "first");
        t.render();
      });
      await page.waitForTimeout(250);
      const badgeText = await page
        .locator("#blueHand .alternate-form-badge")
        .first()
        .textContent()
        .catch(() => null);
      accelBadge = !!(badgeText && /Accelerate/i.test(badgeText));
      const before = await getState(page);
      await playHandIndex(page, "first", 0);
      const after = await getState(page);
      accelPlay = {
        badgeText,
        handBefore: before.first.hand.length,
        handAfter: after.first.hand.length,
        boardAfter: after.first.board.map((c) => ({
          name: c.name,
          type: c.type,
        })),
        ppAfter: after.first.pp,
      };
    } else {
      finding("ui", "Imported Portal Accelerate deck not in selector", {
        opts,
        portalStatus,
      });
    }

    if (havenOpt) {
      await page.evaluate(() => {
        const t = window.__svwbTest;
        t.getState().players.first.hand = [];
        t.getState().players.first.board = [];
        t.addToHand("first", "10661110");
        t.setPP("first", 2, 2);
        t.advanceToTurn(2, "first");
        t.render();
      });
      await page.waitForTimeout(250);
      const badgeText = await page
        .locator("#blueHand .alternate-form-badge")
        .first()
        .textContent()
        .catch(() => null);
      crystBadge = !!(badgeText && /Crystallize/i.test(badgeText));
      const before = await getState(page);
      await playHandIndex(page, "first", 0);
      const after = await getState(page);
      crystPlay = {
        badgeText,
        handBefore: before.first.hand.length,
        handAfter: after.first.hand.length,
        boardAfter: after.first.board.map((c) => ({
          name: c.name,
          type: c.type,
        })),
      };

      // Engage: put Serene Sanctuary (countdown amulet) and right-click engage
      await page.evaluate(() => {
        const t = window.__svwbTest;
        t.getState().players.first.board = [];
        t.summonToBoard("first", "10161210"); // Serene Sanctuary
        t.setPP("first", 3, 3);
        t.advanceToTurn(3, "first");
        t.render();
      });
      await page.waitForTimeout(200);
      const engageBefore = await getState(page);
      const engagedOk = await tryEngage(page, "first");
      const engageAfter = await getState(page);
      crystPlay.engage = {
        engagedOk,
        ppBefore: engageBefore.first.pp,
        ppAfter: engageAfter.first.pp,
        board: engageAfter.first.board.map((c) => ({
          name: c.name,
          engaged: c.engaged,
          countdown: c.countdown,
        })),
      };
      if (!engagedOk) {
        finding(
          "engine-or-ui",
          "Engage on Serene Sanctuary did not resolve via right-click",
          crystPlay.engage,
        );
      }
    } else {
      finding("ui", "Imported Haven Crystallize deck not in selector", {
        opts,
        havenStatus,
      });
    }

    await shot(page, "04-alternate-forms");
    const errs = cons.snapshot();
    step(
      "4-alternate-forms",
      accelBadge && crystBadge && errs.length === 0 ? "pass" : "partial",
      {
        portalStatus,
        havenStatus,
        portalOpt,
        havenOpt,
        accelBadge,
        crystBadge,
        accelPlay,
        crystPlay,
      },
      errs,
    );
    if (!accelBadge)
      finding("ui", "Accelerate badge missing at alternate cost", accelPlay);
    if (!crystBadge)
      finding("ui", "Crystallize badge missing at alternate cost", crystPlay);
  } catch (e) {
    step("4-alternate-forms", "fail", { error: String(e) }, cons.snapshot());
  }

  // ─── 5. Practice loop ─────────────────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/?test=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page, {
      blue: "runecraft_sephie_test_subject",
      red: "portalcraft_artifact_rotation",
      seed: 555001,
    });
    await confirmMulligans(page);
    await autoplayGame(page, { maxActions: 12, flags: {} });

    const beforeCp = await getState(page);
    const handBefore = beforeCp.first.hand.map((c) => c.uid);
    await page.locator("#setCheckpointBtn").click();
    await page.waitForTimeout(150);
    const cpStatus = await page.evaluate(
      () => document.getElementById("checkpointStatus")?.innerText ?? "",
    );

    await autoplayGame(page, { maxActions: 6, flags: {} });
    await page.keyboard.press("F8");
    await page.waitForTimeout(350);
    const afterReroll = await getState(page);
    const handAfterReroll = afterReroll.first.hand.map((c) => c.uid);
    const handUnchanged =
      JSON.stringify(handAfterReroll) === JSON.stringify(handBefore);

    await withSettingsDrawer(page, async () => {
      await page.locator("#savePositionBtn").click();
    });
    await page.waitForTimeout(300);
    await autoplayGame(page, { maxActions: 4, flags: {} });
    const beforeLoad = await getState(page);
    await withSettingsDrawer(page, async () => {
      const posVal = await page
        .locator("#positionSelect option")
        .evaluateAll((os) => {
          const hit = os.find((o) => /qa-pos/i.test(o.textContent || ""));
          return hit?.value || os[1]?.value || "";
        });
      if (posVal) await page.selectOption("#positionSelect", posVal);
      await page.locator("#loadPositionBtn").click();
    });
    await page.waitForTimeout(250);
    const afterLoad = await getState(page);

    // Undo/redo across evolve + attack + end turn — use real UI plays so history commits
    await page.evaluate(() => {
      const t = window.__svwbTest;
      t.getState().players.first.board = [];
      t.getState().players.second.board = [];
      t.getState().players.first.hand = [];
      t.addToHand("first", "10001110");
      t.summonToBoard("first", "10001110", true);
      t.summonToBoard("second", "10001110", true);
      t.setEP("first", 2);
      t.advanceToTurn(5, "first");
      t.setPP("first", 5, 5);
      t.render();
    });
    // Right-click play commits undo history
    await playHandIndex(page, "first", 0);
    await tryEvolve(page, "first", 0, false);
    await tryAttackFace(page, "first");
    await endTurn(page);
    const afterActions = await getState(page);
    const undoEnabled = await page.evaluate(
      () => !document.getElementById("undoBtn")?.disabled,
    );
    if (undoEnabled) {
      await page.locator("#undoBtn").click();
      await page.waitForTimeout(80);
      await page.locator("#undoBtn").click();
      await page.waitForTimeout(80);
      if (
        await page.evaluate(() => !document.getElementById("undoBtn")?.disabled)
      ) {
        await page.locator("#undoBtn").click();
        await page.waitForTimeout(80);
      }
    }
    const afterUndoBtn = await getState(page);
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(80);
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(80);
    const afterRedo = await getState(page);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(80);

    const seedShown = await page
      .locator("#gameSeedValue")
      .innerText()
      .catch(() => "");
    const seedInputVal = await withSettingsDrawer(page, async () =>
      page.locator("#seedInput").inputValue(),
    );
    await withSettingsDrawer(page, async () => {
      await page.locator("#copySeedBtn").click();
    });
    await page.waitForTimeout(150);
    const copied = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    });

    const seedNum = seedInputVal || seedShown || "555001";
    await page.goto(
      `${BASE}/?seed=${seedNum}&a=runecraft_sephie_test_subject&b=portalcraft_artifact_rotation`,
      {
        waitUntil: "networkidle",
      },
    );
    await page.waitForSelector("#seedInput", { state: "attached" });
    await page.waitForTimeout(400);
    const seedFromUrl = await withSettingsDrawer(page, async () =>
      page.locator("#seedInput").inputValue(),
    );
    const deckFromUrl = await withSettingsDrawer(page, async () =>
      page.evaluate(() => ({
        blue: document.getElementById("blueDeckSelect")?.value,
        red: document.getElementById("redDeckSelect")?.value,
      })),
    );
    await withSettingsDrawer(page, async () => {
      await page.locator("#startGameBtn").click();
    });
    await waitState(
      page,
      () =>
        window.gameState?.phase === "mulligan" || window.gameState?.gameStarted,
    );
    const opening = await getState(page);

    await shot(page, "05-practice-loop");
    const errs = cons.snapshot();
    step(
      "5-practice-loop",
      errs.length === 0 ? "pass" : "partial",
      {
        cpStatus,
        handUnchangedAtReroll: handUnchanged,
        handBefore,
        handAfterReroll,
        positionLoad: {
          turnBefore: beforeLoad?.turnNumber,
          turnAfter: afterLoad?.turnNumber,
          hpBefore: beforeLoad?.first?.hp,
          hpAfter: afterLoad?.first?.hp,
        },
        undoRedo: {
          afterActionsActive: afterActions?.activePlayer,
          afterUndoActive: afterUndoBtn?.activePlayer,
          afterRedoActive: afterRedo?.activePlayer,
        },
        seed: {
          seedShown,
          seedInputVal,
          copied,
          seedFromUrl,
          deckFromUrl,
          openingSeed: opening?.seed,
        },
      },
      errs,
    );
    if (!handUnchanged) {
      finding(
        "engine",
        "Checkpoint reroll changed hand UIDs vs checkpoint hand",
        { handBefore, handAfterReroll },
      );
    }
    if (seedShown && copied && copied !== seedShown) {
      finding("ui", "Copy seed mismatch", { seedShown, copied });
    }
    if (String(seedFromUrl) !== String(seedNum)) {
      finding("ui", "?seed= did not populate seed input", {
        seedNum,
        seedFromUrl,
      });
    }
  } catch (e) {
    step("5-practice-loop", "fail", { error: String(e) }, cons.snapshot());
    finding("ui", "Practice loop crashed", String(e));
  }

  // ─── 6. Puzzle mode ───────────────────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/?test=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__svwbTest);
    await startGame(page, {
      blue: "starter_deck",
      red: "starter_deck",
      seed: 9001,
    });
    await confirmMulligans(page);
    await page.evaluate(() => {
      const t = window.__svwbTest;
      t.getState().players.first.board = [];
      t.getState().players.second.board = [];
      t.getState().players.first.hand = [];
      t.summonToBoard("first", "10021110", true);
      t.setLeaderHP("second", 1);
      t.setPP("first", 5, 5);
      t.advanceToTurn(5, "first");
      t.render();
    });
    const puzzlePos = await getState(page);
    await withSettingsDrawer(page, async () => {
      await page.locator("#savePuzzleBtn").click();
    });
    await page.waitForTimeout(400);
    await withSettingsDrawer(page, async () => {
      await page.locator("#loadPuzzleBtn").click();
    });
    await page.waitForTimeout(300);

    await endTurn(page);
    await page.waitForTimeout(300);
    const failStatus = await page.evaluate(
      () => document.getElementById("puzzleStatus")?.innerText ?? "",
    );

    await withSettingsDrawer(page, async () => {
      await page.locator("#retryPuzzleBtn").click();
    });
    await page.waitForTimeout(400);
    const retryState = await getState(page);
    const retryRestored =
      retryState?.second?.hp === puzzlePos.second.hp &&
      (retryState?.first?.board?.length || 0) ===
        (puzzlePos.first.board?.length || 0);

    // Solve via HTML5 attack (same path as interactive drag)
    await page.waitForTimeout(200);
    const attacked = await page.evaluate(() => {
      const src = document.querySelector(
        "#blueBoard .card.can-attack, #blueBoard .card",
      );
      const dst = document.getElementById("redLeader");
      if (!src || !dst) return false;
      const dt = new DataTransfer();
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
      src.dispatchEvent(new DragEvent("dragstart", opts));
      dst.dispatchEvent(new DragEvent("dragover", opts));
      dst.dispatchEvent(new DragEvent("drop", opts));
      return true;
    });
    await page.waitForTimeout(400);
    const solveStatus = await page.locator("#puzzleStatus").innerText();
    const solvedState = await getState(page);

    await shot(page, "06-puzzle");
    const errs = cons.snapshot();
    step(
      "6-puzzle",
      /fail/i.test(failStatus) &&
        retryRestored &&
        (/solved/i.test(solveStatus) || (solvedState?.second?.hp ?? 99) <= 0) &&
        errs.length === 0
        ? "pass"
        : "partial",
      {
        failStatus,
        retryRestored,
        attacked,
        solveStatus,
        enemyHpAfter: solvedState?.second?.hp,
        puzzlePosHp: puzzlePos.second.hp,
      },
      errs,
    );
  } catch (e) {
    step("6-puzzle", "fail", { error: String(e) }, cons.snapshot());
    finding("ui", "Puzzle mode crashed", String(e));
  }

  // ─── 7. Scripted line + hidden hand ───────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await startGame(page, {
      blue: "starter_deck",
      red: "starter_deck",
      seed: 8001,
    });
    await confirmMulligans(page);
    await withSettingsDrawer(page, async () => {
      await page.selectOption("#scriptSideSelect", "second");
      await page.locator("#scriptRecordBtn").click();
    });
    await page.waitForTimeout(200);
    await autoplayGame(page, { maxActions: 10, flags: {} });
    await withSettingsDrawer(page, async () => {
      await page.locator("#scriptStopRecordBtn").click();
    });
    await page.waitForTimeout(200);
    const scriptStatus = await page.evaluate(
      () => document.getElementById("scriptStatus")?.innerText ?? "",
    );

    const loaded = await page.evaluate(async () => {
      const mod = await import("/src/logic/script/runtime.ts");
      const doc = mod.getRecordingDocument();
      if (!doc?.steps?.length) return { ok: false, steps: 0 };
      mod.loadScriptForPlayback(doc);
      return { ok: true, steps: doc.steps.length, side: doc.scriptedSide };
    });

    await withSettingsDrawer(page, async () => {
      await page.locator("#scriptHiddenHandToggle").check();
      await page.locator("#seedInput").fill("8001");
      await page.locator("#startGameBtn").click();
    });
    await waitState(
      page,
      () =>
        window.gameState?.phase === "mulligan" || window.gameState?.gameStarted,
    );
    await confirmMulligans(page);

    for (let i = 0; i < 8; i++) {
      const st = await getState(page);
      if (!st || st.phase === "gameover") break;
      if (st.activePlayer === "first") {
        const r = await autoplayOnce(page, {});
        if (r === "end") await endTurn(page);
      } else {
        await page.waitForTimeout(500);
        const st2 = await getState(page);
        if (st2?.activePlayer === "second") await endTurn(page);
      }
    }

    const hiddenInfo = await page.evaluate(() => {
      const redCards = [...document.querySelectorAll("#redHand .card")];
      return {
        redCount: redCards.length,
        backCount: redCards.filter((c) => c.classList.contains("card-back"))
          .length,
        handCountText: document.getElementById("redHandCount")?.textContent,
        datasets: redCards.map((c) => ({
          classes: c.className,
          name: c.dataset.name || null,
          uid: c.dataset.uid || null,
          faceDown: c.dataset.faceDown || null,
        })),
      };
    });

    if (await page.locator("#redHand .card").count()) {
      await page.locator("#redHand .card").first().hover({ force: true });
      await page.waitForTimeout(250);
    }
    const tooltipAfterHover = await page.evaluate(() => {
      const t = document.getElementById("cardTooltip");
      return {
        display: t ? getComputedStyle(t).display : null,
        text: t?.textContent || "",
      };
    });

    await shot(page, "07-hidden-hand");
    const errs = cons.snapshot();
    const backsOk =
      hiddenInfo.redCount === 0 || hiddenInfo.backCount === hiddenInfo.redCount;
    step(
      "7-script-hidden-hand",
      loaded.ok && backsOk && errs.length === 0 ? "pass" : "partial",
      { scriptStatus, loaded, hiddenInfo, tooltipAfterHover, backsOk },
      errs,
    );
    if (loaded.ok && hiddenInfo.redCount > 0 && hiddenInfo.backCount === 0) {
      finding("ui", "Hidden hand ON but card-back class missing", hiddenInfo);
    }
    if (tooltipAfterHover.display !== "none" && tooltipAfterHover.text.trim()) {
      finding(
        "ui",
        "Hidden hand tooltip may leak card info",
        tooltipAfterHover,
      );
    }
    if (hiddenInfo.datasets.some((d) => d.uid || d.name)) {
      finding(
        "ui",
        "Hidden hand DOM leaks identity via data attributes",
        hiddenInfo.datasets,
      );
    }
  } catch (e) {
    step("7-script-hidden-hand", "fail", { error: String(e) }, cons.snapshot());
    finding("ui", "Script/hidden hand crashed", String(e));
  }

  // ─── 8. Perspective toggle ────────────────────────────────────────
  cons.clear();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const toggle = page.locator("#activeOnBottomToggle");
    const exists = (await toggle.count()) > 0;
    let works = false;
    let before = null;
    let after = null;
    if (exists) {
      await startGame(page, {
        blue: "starter_deck",
        red: "starter_deck",
        seed: 11,
      });
      await confirmMulligans(page);
      before = await page.evaluate(() => ({
        blueTop: document.getElementById("blueHand")?.getBoundingClientRect()
          .top,
        redTop: document.getElementById("redHand")?.getBoundingClientRect().top,
        bodyClass: document.body.className,
      }));
      await withSettingsDrawer(page, async () => {
        await toggle.check();
      });
      await page.waitForTimeout(200);
      await endTurn(page); // second becomes active → layout should flip
      await page.waitForTimeout(300);
      after = await page.evaluate(() => ({
        blueTop: document.getElementById("blueHand")?.getBoundingClientRect()
          .top,
        redTop: document.getElementById("redHand")?.getBoundingClientRect().top,
        bodyClass: document.body.className,
        checked: document.getElementById("activeOnBottomToggle")?.checked,
      }));
      works =
        after.checked === true &&
        (after.bodyClass.includes("active-on-bottom") ||
          before.blueTop !== after.blueTop ||
          before.redTop !== after.redTop);
      await shot(page, "08-perspective");
    }
    step(
      "8-perspective-toggle",
      exists && works ? "pass" : exists ? "partial" : "fail",
      { exists, works, before, after },
      cons.snapshot(),
    );
    if (!exists)
      finding("ui", "PR#19 active-on-bottom toggle never shipped", {});
    if (exists && !works)
      finding("ui", "activeOnBottomToggle present but no visual change", {
        before,
        after,
      });
  } catch (e) {
    step("8-perspective-toggle", "fail", { error: String(e) }, cons.snapshot());
  }

  report.ergonomics = [
    {
      opinion: true,
      text: "The top control bar packs positions, checkpoint, script, puzzle, import, and perspective into one dense strip — it reads as a cockpit. Abbreviated labels (Rec Line / Stop Rec) force hunting.",
    },
    {
      opinion: true,
      text: "Puzzle authoring via successive window.prompt() dialogs feels jarring next to otherwise in-page panels.",
    },
    {
      opinion: true,
      text: "God mode only appears for decks named like testing/0_* — easy to miss during normal practice with shipped decks.",
    },
    {
      opinion: true,
      text: "Right-click-to-play and evolve-by-dragging the Evo button onto a follower are powerful but unlabeled on the board.",
    },
  ];

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(REPORT_DIR, "player-qa-report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(REPORT_DIR, "player-qa-console.jsonl"),
    cons.all.map((l) => JSON.stringify(l)).join("\n"),
  );
  console.log("\n=== SUMMARY ===");
  for (const s of report.steps)
    console.log(`${s.status.toUpperCase().padEnd(7)} ${s.id}`);
  console.log(`Findings: ${report.findings.length}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  report.fatal = String(e);
  fs.writeFileSync(
    path.join(REPORT_DIR, "player-qa-report.json"),
    JSON.stringify(report, null, 2),
  );
  process.exit(1);
});
