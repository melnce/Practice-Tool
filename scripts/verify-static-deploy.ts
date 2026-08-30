/**
 * Verify production `build/` via a dumb static server (NOT vite preview).
 * Usage: APP_URL=http://127.0.0.1:8877/ npx tsx scripts/verify-static-deploy.ts
 */
import { chromium, type Page } from "@playwright/test";
import {
  closeSettingsDrawer,
  openSettingsDrawer,
} from "./settings-drawer-helpers.mjs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = (process.env.APP_URL || "http://127.0.0.1:8877/").replace(
  /\/?$/,
  "/",
);
const OUT = path.join(ROOT, "reports", "static-deploy-browser.md");
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : fs.existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : "/usr/local/bin/google-chrome");

const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  console.log(s);
};

async function confirmMulligans(page: Page) {
  for (const id of ["#blueMulliganConfirm", "#redMulliganConfirm"]) {
    const btn = page.locator(id);
    try {
      await btn.waitFor({ state: "visible", timeout: 4000 });
      await btn.click({ force: true });
      await page.waitForTimeout(250);
    } catch {
      /* skipped */
    }
  }
}

async function endTurn(page: Page) {
  const active = await page.evaluate(
    () => (window as any).gameState?.activePlayer as string | undefined,
  );
  const btn = active === "first" ? "#endTurnBlue" : "#endTurnRed";
  await page
    .locator(btn)
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function playOneCheap(page: Page) {
  const pick = await page.evaluate(() => {
    const s = (window as any).gameState;
    if (!s || s.phase !== "main") return null;
    const owner = s.activePlayer;
    const p = s.players[owner];
    let best = -1;
    let bestCost = 999;
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      const cost = typeof c.cost === "number" ? c.cost : 99;
      if (cost <= p.pp && cost < bestCost) {
        best = i;
        bestCost = cost;
      }
    }
    if (best < 0) return null;
    return { zone: owner === "first" ? "blueHand" : "redHand", index: best };
  });
  if (!pick) return false;
  const card = page.locator(`#${pick.zone}-${pick.index}`);
  const target =
    (await card.count()) > 0
      ? card
      : page.locator(`#${pick.zone} .card`).nth(pick.index);
  await target.click({ button: "right", force: true });
  await page.waitForTimeout(200);
  // Dismiss targeting / choice if any
  const choice = page.locator(".choice-modal .choice-option").first();
  if (await choice.isVisible().catch(() => false)) {
    await choice.click().catch(() => {});
  }
  const confirm = page.locator("#targetingConfirmation button").first();
  if (await confirm.isVisible().catch(() => false)) {
    await page
      .locator("#redLeader")
      .click()
      .catch(() => {});
    await confirm.click().catch(() => {});
  }
  return true;
}

async function main() {
  log(`# Static deploy browser verification`);
  log(`- URL: ${BASE}`);
  log(`- Chromium: ${CHROME}`);
  log(`- Time: ${new Date().toISOString()}`);
  log(`- Server: plain python http.server on build/ (not vite preview)`);

  const failed404: string[] = [];
  const consoleErrors: string[] = [];

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();

  page.on("response", (res) => {
    if (res.status() === 404) failed404.push(res.url());
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForSelector("#blueDeckSelect", { timeout: 20_000 });
  await page.waitForSelector(
    '#blueDeckSelect option[value="runecraft_sephie_test_subject"]',
    {
      state: "attached",
      timeout: 15_000,
    },
  );

  log(`\n## Deck selects populated`);
  const options = await page.locator("#blueDeckSelect option").count();
  log(`- blueDeckSelect options: ${options}`);

  await openSettingsDrawer(page);
  await page.selectOption("#blueDeckSelect", "runecraft_sephie_test_subject");
  await page.selectOption("#redDeckSelect", "portalcraft_artifact_rotation");
  await page.fill("#seedInput", "424242");
  await page.click("#startGameBtn");
  await closeSettingsDrawer(page);

  await page.waitForFunction(
    () => {
      const s = (window as any).gameState;
      return s && (s.phase === "mulligan" || s.gameStarted === true);
    },
    { timeout: 20_000 },
  );
  await confirmMulligans(page);
  await page.waitForFunction(
    () => (window as any).gameState?.phase === "main",
    { timeout: 20_000 },
  );

  log(
    `\n## Game started (runecraft_sephie_test_subject vs portalcraft_artifact_rotation)`,
  );
  const started = await page.evaluate(() => {
    const s = (window as any).gameState;
    return {
      phase: s.phase,
      round: s.roundCount,
      blueDeck: s.players.first.deckFile,
      redDeck: s.players.second.deckFile,
      blueHand: s.players.first.hand.length,
      redHand: s.players.second.hand.length,
    };
  });
  log(`- state: ${JSON.stringify(started)}`);

  for (let t = 0; t < 2; t++) {
    await playOneCheap(page);
    await endTurn(page);
    await playOneCheap(page);
    await endTurn(page);
  }

  const after = await page.evaluate(() => {
    const s = (window as any).gameState;
    return {
      phase: s.phase,
      round: s.roundCount,
      blueHp: s.players.first.hp,
      redHp: s.players.second.hp,
    };
  });
  log(`\n## After ~2 turns each`);
  log(`- state: ${JSON.stringify(after)}`);

  // Filter known external noise (card art CDN) from hard failures
  const local404 = failed404.filter((u) => u.startsWith(BASE));
  log(`\n## Network / console`);
  log(`- local 404s: ${local404.length ? local404.join(", ") : "(none)"}`);
  log(
    `- console errors: ${consoleErrors.length ? consoleErrors.join(" | ") : "(none)"}`,
  );

  const ok =
    after.round >= 1 &&
    local404.length === 0 &&
    consoleErrors.filter(
      (e) => !/static\.dotgg\.gg|Failed to load resource/i.test(e),
    ).length === 0;

  // Treat CDN image failures as acceptable; fail on other console errors / local 404s
  const hardErrors = consoleErrors.filter(
    (e) =>
      !/static\.dotgg\.gg/i.test(e) &&
      !/net::ERR_/i.test(e) &&
      !/Failed to load resource/i.test(e),
  );
  const pass =
    local404.length === 0 && hardErrors.length === 0 && after.round >= 1;

  log(`\n## Result: ${pass ? "PASS" : "FAIL"}`);
  if (!pass) {
    log(`- hardErrors: ${JSON.stringify(hardErrors)}`);
    log(`- ok flag: ${ok}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
