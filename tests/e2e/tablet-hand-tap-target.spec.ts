/**
 * Tablet hand tap targets: shrink high-count hands so each card exposes ≥24px.
 *
 * Complements hand-fan-visibility.spec.ts (DOM-order stacking). That file still
 * soft-reports tablet geometry; this file hard-asserts the owner's shrink fix.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const SHOT_DIR = path.join("reports", "ui", "tablet-hand-tap", "e2e");

const SEPHIE_ID = "10934110";
const FILLER_ID = "10001110";
const MIN_EXPOSED_PX = 24;

type ActiveRow = "bottom" | "top";

async function seedHand(
  page: Page,
  opts: { activeRow: ActiveRow; count: number },
) {
  await page.goto(`${BASE}?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);

  await page.evaluate(() => {
    try {
      localStorage.setItem("svwb.activeOnBottom", "0");
    } catch {
      /* ignore */
    }
  });

  await page.evaluate(
    ({ sephieId, fillerId, count, activeRow }) => {
      const t = (window as any).__svwbTest;
      if (!t) throw new Error("missing test bridge");
      t.seedRng(42);
      t.loadDecks(
        { name: "blue", cards: [] },
        { name: "red", cards: [] },
        { drawOpening: false },
      );

      const s = t.getState();
      s.gameStarted = true;
      s.phase = "main";

      const player = activeRow === "bottom" ? "first" : "second";
      s.activePlayer = player;
      s.players[player].pp = 3;
      s.players[player].maxPP = 3;
      s.players[player].hand = [];
      for (let i = 0; i < count; i++) {
        const id = i === 3 || i === 7 ? sephieId : fillerId;
        t.addToHand(player, id);
      }
      t.render();
    },
    {
      sephieId: SEPHIE_ID,
      fillerId: FILLER_ID,
      count: opts.count,
      activeRow: opts.activeRow,
    },
  );

  const handSel =
    opts.activeRow === "bottom" ? "#blueHand .card" : "#redHand .card";
  await page.waitForSelector(handSel);
  await expect(page.locator(handSel)).toHaveCount(opts.count);
}

async function measureMinExposed(
  page: Page,
  activeRow: ActiveRow,
  count: number,
): Promise<{
  minExposed: number;
  exposedWidths: number[];
  allHitOk: boolean;
  cardWidth: number;
  handLocalScale: string;
  cqw: number;
}> {
  return page.evaluate(
    ({ activeRow, count }) => {
      const handId = activeRow === "bottom" ? "blueHand" : "redHand";
      const hand = document.getElementById(handId);
      if (!hand) throw new Error(`#${handId} missing`);
      const cards = Array.from(hand.querySelectorAll(".card")) as HTMLElement[];
      if (cards.length !== count) {
        throw new Error(`expected ${count} cards, got ${cards.length}`);
      }

      const rects = cards.map((c) => c.getBoundingClientRect());
      const exposedWidths: number[] = [];
      let allHitOk = true;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]!;
        const r = rects[i]!;
        const nextLeft = i < cards.length - 1 ? rects[i + 1]!.left : r.right;
        const exposedWidth = Math.max(0, nextLeft - r.left);
        exposedWidths.push(exposedWidth);

        const probeX =
          r.left + Math.min(Math.max(exposedWidth / 2, 4), r.width - 4);
        const probeY = r.top + r.height / 2;
        const el = document.elementFromPoint(probeX, probeY);
        if (!(el && (el === card || card.contains(el)))) allHitOk = false;
      }

      const cs = getComputedStyle(hand);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const handRect = hand.getBoundingClientRect();
      const card0 = cards[0]!;
      return {
        minExposed: Math.min(...exposedWidths),
        exposedWidths,
        allHitOk,
        cardWidth: card0.getBoundingClientRect().width,
        handLocalScale: cs.getPropertyValue("--hand-local-scale").trim(),
        cqw: handRect.width - padL - padR,
      };
    },
    { activeRow, count },
  );
}

test.describe("tablet hand tap target (shrink at high counts)", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  for (const activeRow of ["bottom", "top"] as const) {
    for (const count of [7, 8, 9] as const) {
      test(`tablet 1180×820 active=${activeRow} N=${count}: min exposed ≥${MIN_EXPOSED_PX}px and hit-testable`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1180, height: 820 });
        await seedHand(page, { activeRow, count });
        const m = await measureMinExposed(page, activeRow, count);

        fs.writeFileSync(
          path.join(SHOT_DIR, `metrics-tablet-${activeRow}-n${count}.json`),
          JSON.stringify(
            {
              viewport: { width: 1180, height: 820 },
              activeRow,
              count,
              ...m,
              exposedWidths: m.exposedWidths.map((w) => Number(w.toFixed(2))),
            },
            null,
            2,
          ),
        );

        if (count === 9) {
          await page.screenshot({
            path: path.join(SHOT_DIR, `fan-tablet-${activeRow}-n9.png`),
            fullPage: false,
          });
        }

        expect(m.allHitOk, "every mid-strip probe must hit its card").toBe(
          true,
        );
        expect(
          m.minExposed,
          `minExposed=${m.minExposed.toFixed(2)}px scale=${m.handLocalScale} cardW=${m.cardWidth.toFixed(1)} cqw=${m.cqw.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(MIN_EXPOSED_PX);
      });
    }
  }

  test("desktop 1920×1080 N=9 unchanged: min exposed still ≈60px+ (no tablet leak)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await seedHand(page, { activeRow: "bottom", count: 9 });
    const bottom = await measureMinExposed(page, "bottom", 9);
    await seedHand(page, { activeRow: "top", count: 9 });
    const top = await measureMinExposed(page, "top", 9);

    fs.writeFileSync(
      path.join(SHOT_DIR, "metrics-desktop-n9.json"),
      JSON.stringify(
        {
          bottom: {
            minExposed: bottom.minExposed,
            cardWidth: bottom.cardWidth,
            scale: bottom.handLocalScale,
          },
          top: {
            minExposed: top.minExposed,
            cardWidth: top.cardWidth,
            scale: top.handLocalScale,
          },
        },
        null,
        2,
      ),
    );

    // Pre-fix desktop floor was ≈60 bottom / ≈63 top — require comfortable 60+.
    expect(bottom.minExposed).toBeGreaterThanOrEqual(60);
    expect(top.minExposed).toBeGreaterThanOrEqual(60);
    // Full-size bottom card at 1900px token (118px), not tablet-shrunk (~49px).
    expect(bottom.cardWidth).toBeGreaterThanOrEqual(110);
  });
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
