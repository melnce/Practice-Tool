/**
 * Headless tooltip verification — screenshots under reports/ui/tooltips/.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { SvwbPage } from "./qa/pageObject.js";
import blueFund from "./qa/decks/fundamentals-blue.json" with { type: "json" };
import redFund from "./qa/decks/fundamentals-red.json" with { type: "json" };

const SHOT_DIR = path.join("reports", "ui", "tooltips");

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
});

async function hoverHandCard(page: import("@playwright/test").Page) {
  const card = page.locator("#blueHand .card").first();
  await card.dispatchEvent("mouseenter");
  await page.mouse.move(400, 300);
  await page.waitForTimeout(100);
  return card;
}

test("tooltip counters, crest fallback, and keyword formatting", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const po = new SvwbPage(page);
  await page.goto("http://localhost:5173/?test=1");
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await po.loadDb();
  await po.seedRng(99001);
  await po.loadDecks(blueFund as any, redFund as any);

  await page.evaluate(() => {
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    s.phase = "main";
    s.gameStarted = true;
    s.players.first.hand = [];
    s.players.first.followerEnterHistory = [];
    t.addToHand("first", "10844110", 1);
    t.advanceToTurn(5, "first");
    t.render();
  });

  await hoverHandCard(page);
  const tip = page.locator("#cardTooltip");
  await expect(tip).toBeVisible();
  await expect(tip.locator(".dynamic-counter-value")).toHaveText("0/2");
  await expect(tip.locator(".tooltip-keyword").first()).toContainText(
    "Fanfare",
  );
  await expect(tip.locator(".tooltip-crest-panel")).toBeVisible();
  await page.screenshot({
    path: path.join(SHOT_DIR, "drache_counter_0_of_2.png"),
    fullPage: false,
  });

  await page.evaluate(() => {
    const s = (window as any).gameState;
    s.players.first.followerEnterHistory.push({
      name: "Drache & Aluzard, Burning Blood",
      tribes: [],
      cardId: "10844110",
    });
    (window as any).__svwbTest.render();
  });

  await page.locator("#blueHand .card").first().dispatchEvent("mouseenter");
  await expect(tip.locator(".dynamic-counter-value")).toHaveText("1/2");
  await page.screenshot({
    path: path.join(SHOT_DIR, "drache_counter_1_of_2.png"),
    fullPage: false,
  });

  await page.evaluate(() => {
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    s.players.first.hand = [];
    s.players.first.crests = [
      {
        name: "Drache & Aluzard, Burning Blood",
        owner: "first",
        image: "https://static.dotgg.gg/shadowverse/cards/10844110_token.webp",
        description:
          "Countdown (2)\nLast Words: Add a Drache & Aluzard, Burning Blood to your hand and set its cost to 2.",
        countdown: 2,
      },
    ];
    t.render();
  });

  const crestSlot = page.locator("#blueCrests .crest-slot").first();
  await crestSlot.dispatchEvent("mouseenter");
  await page.waitForTimeout(300);
  const crestImg = page.locator("#blueCrests .crest-image").first();
  await expect(crestImg).toBeVisible();
  const crestSrc = await crestImg.getAttribute("src");
  expect(crestSrc).toContain("10844110.webp");
  expect(crestSrc).not.toContain("_token");
  await page.screenshot({
    path: path.join(SHOT_DIR, "crest_fallback_art.png"),
    fullPage: false,
  });

  await page.evaluate(() => {
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    s.players.first.hand = [];
    t.addToHand("first", "10113140", 1);
    s.players.first.playsThisTurn = 4;
    t.render();
  });

  await hoverHandCard(page);
  await expect(tip.locator(".tooltip-keyword").first()).toContainText(
    "Fanfare",
  );
  await expect(tip.locator(".dynamic-counter-value").first()).toHaveText("4");
  await page.screenshot({
    path: path.join(SHOT_DIR, "keyword_and_combo_counter.png"),
    fullPage: false,
  });

  expect(errors).toEqual([]);
});
