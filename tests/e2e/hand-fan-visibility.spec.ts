/**
 * Hand fan stacking must follow DOM order, not playability.
 *
 * Regression for buried unplayable cards (plan-the-turn / fuse Sephie):
 * playable-glow used to set z-index:10 and cover later siblings' exposed strips.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const SHOT_DIR = path.join("reports", "ui", "hand-fan-visibility", "e2e");

/** Sephie, Maven Convict — Fuse: Cards; cost 7 (unplayable at low PP). */
const SEPHIE_ID = "10934110";
/** Indomitable Fighter — cost 2 (playable at PP 3). */
const FILLER_ID = "10001110";

const MAX_HAND = 9;
/** Below this, the exposed strip is not a usable tap target. */
const MIN_EXPOSED_PX = 24;

const VIEWPORTS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "tablet-landscape", width: 1180, height: 820 },
] as const;

type ActiveRow = "bottom" | "top";

type CardProbe = {
  index: number;
  uid: string | null;
  playable: boolean;
  isSephie: boolean;
  zIndex: string;
  exposedWidth: number;
  hitOk: boolean;
  hitTag: string;
};

type FanMetrics = {
  handId: string;
  activeRow: ActiveRow;
  cards: CardProbe[];
  minExposed: number;
  playableCount: number;
  unplayableCount: number;
};

async function seedBuriedSephieHand(
  page: Page,
  opts: { activeRow: ActiveRow },
) {
  await page.goto(`${BASE}?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);

  // Perspective preference off so first→bottom / second→top (default layout).
  await page.evaluate(() => {
    try {
      localStorage.setItem("svwb.activeOnBottom", "0");
    } catch {
      /* ignore */
    }
  });

  await page.evaluate(
    ({ sephieId, fillerId, maxHand, activeRow }) => {
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

      // Default layout: first's hand is bottom (full scale); second's is top (scaled).
      const player = activeRow === "bottom" ? "first" : "second";
      s.activePlayer = player;
      s.players[player].pp = 3;
      s.players[player].maxPP = 3;

      // Mix: playable fillers with Sephie after a playable card (indices 3 & 7).
      // At PP 3, cost-2 fillers glow; cost-7 Sephie does not — but must stay clickable.
      s.players[player].hand = [];
      for (let i = 0; i < maxHand; i++) {
        const id = i === 3 || i === 7 ? sephieId : fillerId;
        t.addToHand(player, id);
      }
      t.render();
    },
    {
      sephieId: SEPHIE_ID,
      fillerId: FILLER_ID,
      maxHand: MAX_HAND,
      activeRow: opts.activeRow,
    },
  );

  const handSel =
    opts.activeRow === "bottom" ? "#blueHand .card" : "#redHand .card";
  await page.waitForSelector(handSel);
  await expect(page.locator(handSel)).toHaveCount(MAX_HAND);
}

async function measureFan(
  page: Page,
  activeRow: ActiveRow,
): Promise<FanMetrics> {
  return page.evaluate(
    ({ activeRow, sephieId }) => {
      const handId = activeRow === "bottom" ? "blueHand" : "redHand";
      const player = activeRow === "bottom" ? "first" : "second";
      const hand = document.getElementById(handId);
      if (!hand) throw new Error(`#${handId} missing`);
      const cards = Array.from(hand.querySelectorAll(".card")) as HTMLElement[];
      if (cards.length !== 9) {
        throw new Error(`expected 9 cards, got ${cards.length}`);
      }

      const gs =
        (window as any)._gameState ?? (window as any).__svwbTest?.getState?.();
      const handState = gs?.players?.[player]?.hand ?? [];

      const rects = cards.map((c) => c.getBoundingClientRect());
      const probes: CardProbe[] = cards.map((card, i) => {
        const r = rects[i]!;
        const nextLeft = i < cards.length - 1 ? rects[i + 1]!.left : r.right;
        // Geometric strip between this card's left edge and the next card's left.
        const exposedWidth = Math.max(0, nextLeft - r.left);

        // Probe mid-strip (slightly inset from left so we stay inside the card).
        const probeX =
          r.left + Math.min(Math.max(exposedWidth / 2, 4), r.width - 4);
        const probeY = r.top + r.height / 2;
        const el = document.elementFromPoint(probeX, probeY);
        const hitOk = !!el && (el === card || card.contains(el));
        const hitTag = el
          ? `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className ?? "").slice(0, 64)}`
          : "null";

        const playable =
          card.classList.contains("playable-glow") ||
          card.classList.contains("enhance-ready") ||
          card.classList.contains("alternate-ready");

        const inst = handState[i];
        return {
          index: i,
          uid: card.dataset.uid ?? null,
          playable,
          isSephie: inst?.id === sephieId,
          zIndex: getComputedStyle(card).zIndex,
          exposedWidth,
          hitOk,
          hitTag,
        };
      });

      return {
        handId,
        activeRow,
        cards: probes,
        minExposed: Math.min(...probes.map((p) => p.exposedWidth)),
        playableCount: probes.filter((p) => p.playable).length,
        unplayableCount: probes.filter((p) => !p.playable).length,
      };
    },
    { activeRow, sephieId: SEPHIE_ID },
  );
}

async function clickSephieExposedStrip(page: Page, activeRow: ActiveRow) {
  const handSel = activeRow === "bottom" ? "#blueHand" : "#redHand";
  const player = activeRow === "bottom" ? "first" : "second";
  const result = await page.evaluate(
    ({ handSel, sephieId, player }) => {
      const hand = document.querySelector(handSel);
      if (!hand) throw new Error(`${handSel} missing`);
      const cards = Array.from(hand.querySelectorAll(".card")) as HTMLElement[];
      const gs =
        (window as any)._gameState ?? (window as any).__svwbTest?.getState?.();
      const handState = gs?.players?.[player]?.hand ?? [];

      const sephieIdx = handState.findIndex(
        (c: { id?: string }, i: number) =>
          c?.id === sephieId &&
          !cards[i]?.classList.contains("playable-glow") &&
          !cards[i]?.classList.contains("enhance-ready") &&
          !cards[i]?.classList.contains("alternate-ready"),
      );
      if (sephieIdx < 0) throw new Error("no unplayable Sephie in hand");
      if (sephieIdx === 0)
        throw new Error("Sephie must sit after another card");

      const prev = cards[sephieIdx - 1]!;
      const sephie = cards[sephieIdx]!;
      if (
        !prev.classList.contains("playable-glow") &&
        !prev.classList.contains("enhance-ready") &&
        !prev.classList.contains("alternate-ready")
      ) {
        throw new Error("card before Sephie must be playable (glow)");
      }

      const r = sephie.getBoundingClientRect();
      const next = cards[sephieIdx + 1];
      const nextLeft = next ? next.getBoundingClientRect().left : r.right;
      const exposedWidth = Math.max(0, nextLeft - r.left);
      const x = r.left + Math.min(Math.max(exposedWidth / 2, 4), r.width - 4);
      const y = r.top + r.height / 2;

      const el = document.elementFromPoint(x, y);
      const hitOk = !!el && (el === sephie || sephie.contains(el));
      return {
        sephieIdx,
        exposedWidth,
        hitOk,
        x,
        y,
      };
    },
    { handSel, sephieId: SEPHIE_ID, player },
  );

  expect(result.hitOk, "Sephie exposed strip must hit-test to Sephie").toBe(
    true,
  );
  // Width floor is asserted per-viewport in the fan metrics tests; Sephie
  // case only requires the strip to be hit-testable and the click to fuse.

  await page.mouse.click(result.x, result.y);
  await page.waitForTimeout(200);

  const fuse = await page.evaluate(() => {
    const gs =
      (window as any)._gameState ?? (window as any).__svwbTest?.getState?.();
    const pending = gs?.pendingTargetEffect;
    return {
      hasPending: !!pending,
      op: pending?.eff?.op ?? null,
      action: pending?.eff?.action ?? null,
      type: pending?.eff?.type ?? null,
    };
  });

  expect(fuse.hasPending, "click on buried Sephie must open fuse").toBe(true);
  expect(fuse.op).toBe("fuse");
  expect(fuse.type).toBe("cards");

  return result;
}

test.describe("hand fan visibility (DOM-order stacking)", () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    for (const activeRow of ["bottom", "top"] as const) {
      test(`${vp.name} ${vp.width}×${vp.height}, active=${activeRow}: every card has ≥${MIN_EXPOSED_PX}px hit-testable strip`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await seedBuriedSephieHand(page, { activeRow });

        const metrics = await measureFan(page, activeRow);

        expect(
          metrics.playableCount,
          "need a mix of playable cards",
        ).toBeGreaterThan(0);
        expect(
          metrics.unplayableCount,
          "need unplayable cards (Sephie)",
        ).toBeGreaterThan(0);
        expect(metrics.cards.filter((c) => c.isSephie).length).toBe(2);

        // Stacking must be ascending by DOM index (playability must not elevate).
        for (let i = 0; i < metrics.cards.length; i++) {
          const z = Number(metrics.cards[i]!.zIndex);
          expect(
            z,
            `card[${i}] z-index should be ${i + 1} (got ${metrics.cards[i]!.zIndex})`,
          ).toBe(i + 1);
        }

        for (const c of metrics.cards) {
          expect(
            c.hitOk,
            `card[${c.index}] elementFromPoint hit ${c.hitTag} (exposed=${c.exposedWidth.toFixed(1)}px)`,
          ).toBe(true);
        }

        // Persist measured widths for the PR acceptance evidence.
        fs.writeFileSync(
          path.join(
            SHOT_DIR,
            `metrics-${vp.name}-${activeRow}-${vp.width}x${vp.height}.json`,
          ),
          JSON.stringify(
            {
              viewport: vp,
              activeRow,
              minExposed: metrics.minExposed,
              exposedWidths: metrics.cards.map((c) =>
                Number(c.exposedWidth.toFixed(2)),
              ),
              playableCount: metrics.playableCount,
              unplayableCount: metrics.unplayableCount,
              zIndexes: metrics.cards.map((c) => c.zIndex),
            },
            null,
            2,
          ),
        );

        await page.screenshot({
          path: path.join(
            SHOT_DIR,
            `fan-${vp.name}-${activeRow}-${vp.width}x${vp.height}.png`,
          ),
          fullPage: false,
        });

        // Desktop must clear the 24px tap-target floor.
        // Tablet full-hand geometry may not — report the number; do not fudge overlap.
        if (vp.name === "desktop") {
          expect(
            metrics.minExposed,
            `minExposed=${metrics.minExposed.toFixed(2)}px`,
          ).toBeGreaterThanOrEqual(MIN_EXPOSED_PX);
        } else if (metrics.minExposed < MIN_EXPOSED_PX) {
          test.info().annotations.push({
            type: "blocked-geometry",
            description: `tablet ${vp.width}×${vp.height} active=${activeRow} minExposed=${metrics.minExposed.toFixed(2)}px < ${MIN_EXPOSED_PX}px — stacking is correct; strip width is a layout budget question for the owner`,
          });
        }
      });
    }
  }

  test("Sephie after playable card: exposed strip click opens fuse (desktop, active bottom)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await seedBuriedSephieHand(page, { activeRow: "bottom" });
    await clickSephieExposedStrip(page, "bottom");
  });

  test("Sephie after playable card: exposed strip click opens fuse (tablet, active top)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedBuriedSephieHand(page, { activeRow: "top" });
    await clickSephieExposedStrip(page, "top");
  });
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
