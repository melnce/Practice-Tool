/**
 * Floating combat text E2E — leader damage, heal, and simultaneous heal+damage.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join("reports", "ui", "floating-text");
const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
}

async function setupLeaderScenario(page: Page) {
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
    s.gameStarted = true;
    s.phase = "main";
    s.activePlayer = "first";
    s.players.first.hp = 10;
    s.players.second.hp = 20;
    t.render();
  });
}

async function emitLeaderEvents(
  page: Page,
  events: Array<{ type: "heal" | "damage"; amount: number }>,
) {
  await page.evaluate((events) => {
    window.__svwbTest?.emitLeaderCombatLogs(events);
  }, events);
}

test.describe("floating combat text", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("leader damage, heal, and simultaneous heal+damage", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(`${BASE}/?test=1`);
    await page.waitForLoadState("networkidle");
    await setupLeaderScenario(page);

    await emitLeaderEvents(page, [{ type: "damage", amount: 3 }]);
    await page.waitForTimeout(200);
    await shot(page, "leader-damage");

    const damageText = await page
      .locator("#blueLeader .floating-combat-text")
      .first()
      .textContent();
    expect(damageText).toBe("-3");

    await page.waitForTimeout(1500);
    await emitLeaderEvents(page, [{ type: "heal", amount: 2 }]);
    await page.waitForTimeout(200);
    await shot(page, "leader-heal");

    const healText = await page
      .locator("#blueLeader .floating-combat-text")
      .first()
      .textContent();
    expect(healText).toBe("+2");

    await page.waitForTimeout(1500);
    await emitLeaderEvents(page, [
      { type: "heal", amount: 1 },
      { type: "damage", amount: 1 },
    ]);
    await page.waitForTimeout(250);
    await shot(page, "leader-heal-then-damage");

    const floaters = page.locator("#blueLeader .floating-combat-text");
    await expect(floaters).toHaveCount(2);
    await expect(floaters.nth(0)).toHaveText("+1");
    await expect(floaters.nth(1)).toHaveText("-1");

    expect(errors).toEqual([]);
  });
});
