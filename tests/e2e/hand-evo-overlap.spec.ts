/**
 * Regression: hand cards must not cover the red Evo button (layout + click).
 * Evo lives in the right rail (`.side-rail-cluster--red`) after the
 * leader-to-right-rail layout — selector updated to match; assertion intent
 * unchanged (no card/evo intersection, evo clickable, hand fits).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { SEL } from "./qa/pageObject.js";

const SHOT_DIR = path.join("reports", "ui", "hand-evo-overlap", "e2e");
const CARD_ID = "10001110";
const MAX_HAND = 9;

async function setupFullRedHand(page: Page) {
  await page.evaluate(
    ({ cardId, maxHand }) => {
      const t = window.__svwbTest;
      if (!t) throw new Error("missing test bridge");
      t.seedRng(42);
      t.loadDecks(
        { name: "blue", cards: [] },
        { name: "red", cards: [] },
        { drawOpening: false },
      );
      const s = window.gameState;
      s.gameStarted = true;
      s.phase = "main";
      s.activePlayer = "second";
      s.players.second.evoCharges = 2;
      s.players.second.superEvoCharges = 2;
      for (let i = 0; i < maxHand; i++) {
        t.addToHand("second", cardId);
      }
      const hand = document.querySelector("#redHand");
      hand?.querySelectorAll(".card").forEach((el, i) => {
        if (i >= 5) el.classList.add("playable-glow");
      });
      t.render();
    },
    { cardId: CARD_ID, maxHand: MAX_HAND },
  );
}

async function assertEvoUnobstructed(page: Page) {
  const result = await page.evaluate(() => {
    const evo = document.querySelector("#redNormalEvo") as HTMLElement | null;
    const hand = document.querySelector("#redHand");
    const leader = document.querySelector(
      ".side-rail-cluster--red .leader-container",
    );
    if (!evo || !hand || !leader) {
      throw new Error("missing evo, hand, or leader container");
    }

    const evoRect = evo.getBoundingClientRect();
    const leaderRect = leader.getBoundingClientRect();
    const cards = [...hand.querySelectorAll(".card")];

    const evoBox = {
      left: evoRect.left,
      right: evoRect.right,
      top: evoRect.top,
      bottom: evoRect.bottom,
    };

    const intersecting = cards.filter((card) => {
      const r = card.getBoundingClientRect();
      return !(
        r.right <= evoBox.left ||
        r.left >= evoBox.right ||
        r.bottom <= evoBox.top ||
        r.top >= evoBox.bottom
      );
    });

    const cx = evoRect.left + evoRect.width / 2;
    const cy = evoRect.top + evoRect.height / 2;
    const topEl = document.elementFromPoint(cx, cy);

    const handRect = hand.getBoundingClientRect();
    const lastCard = cards[cards.length - 1]?.getBoundingClientRect();

    return {
      evoIntersectsCards: intersecting.length,
      evoClickTarget:
        topEl === evo || (topEl != null && evo.contains(topEl))
          ? "evo"
          : (topEl?.className ?? topEl?.tagName ?? "null"),
      leaderZIndex: getComputedStyle(leader).zIndex,
      handFitsColumn:
        lastCard != null ? lastCard.right <= handRect.right + 0.5 : true,
      layoutVsVisualMismatch: cards.some((card) => {
        const el = card as HTMLElement;
        const r = el.getBoundingClientRect();
        return Math.abs(el.offsetWidth - r.width) > 2;
      }),
    };
  });

  expect(result.evoIntersectsCards).toBe(0);
  expect(result.evoClickTarget).toBe("evo");
  expect(result.handFitsColumn).toBe(true);
  expect(result.layoutVsVisualMismatch).toBe(false);
  expect(Number(result.leaderZIndex)).toBeGreaterThanOrEqual(50);

  return result;
}

test.describe("hand vs evo overlap", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`red Evo stays visible and clickable at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?test=1");
      await page.waitForFunction(() => !!window.__svwbTest);
      await setupFullRedHand(page);

      const metrics = await assertEvoUnobstructed(page);

      await page.screenshot({
        path: path.join(
          SHOT_DIR,
          `after-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: false,
      });

      expect(metrics.evoIntersectsCards).toBe(0);
      await expect(page.locator(SEL.redNormalEvo)).toBeVisible();
    });
  }
});
