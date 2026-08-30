/**
 * Hand-card hit-testing across short and tall viewports.
 *
 * Below 800px the short-viewport CSS fallback used to release #gameShell to
 * height:auto while body.phase3-fixed-viewport stayed overflow:hidden (higher
 * specificity). The flex sides collapsed to 0, cards painted outside the
 * overflow:hidden clip of #appRoot, and elementFromPoint returned <body>.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 780 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** Sephie, Maven Convict — Fuse: Cards; left-click opens fuse partner picker. */
const SEPHIE_ID = "10934110";
const FILLER_ID = "10001110";

async function seedFourCardHand(page: import("@playwright/test").Page) {
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");

  await page.evaluate(
    async ({ sephieId, fillerId }) => {
      const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
      await loadCardDatabase();

      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(42);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;
      state.players.first.deckFile = "0_testing_target.json";

      const ids = [sephieId, fillerId, fillerId, fillerId];
      state.players.first.hand = ids.map((id, i) => {
        const tpl = getCardById(id);
        if (!tpl) throw new Error(`card DB missing ${id}`);
        return {
          ...tpl,
          uid: `hand_${i}_${id}`,
          owner: "first",
          buffs: { attack: 0, defense: 0 },
        } as any;
      });
      render();
    },
    { sephieId: SEPHIE_ID, fillerId: FILLER_ID },
  );

  // window._gameState only exists after src/logic/index.ts — wait on DOM.
  await page.waitForSelector("#blueHand .card");
}

test.describe("Hand click hit-testing across viewports", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.width}×${vp.height}: hand centres hit-test and Sephie fuse click`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await seedFourCardHand(page);

      const layout = await page.evaluate(() => {
        const hand = document.getElementById("blueHand");
        if (!hand) throw new Error("#blueHand missing");
        const cards = Array.from(
          hand.querySelectorAll(".card"),
        ) as HTMLElement[];
        const handRect = hand.getBoundingClientRect();

        const cardProbes = cards.map((card) => {
          const r = card.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const el = document.elementFromPoint(cx, cy);
          const hitsCard = !!el && (el === card || card.contains(el));
          return {
            hitsCard,
            centreTag: el
              ? `${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString?.().slice(0, 48) ?? ""}`
              : "null",
            top: r.top,
            bottom: r.bottom,
          };
        });

        const bodyOverflow = getComputedStyle(document.body).overflow;
        const scrollHeight =
          document.scrollingElement?.scrollHeight ?? document.body.scrollHeight;
        const scrollOk =
          bodyOverflow !== "hidden" || scrollHeight <= window.innerHeight;

        return {
          cardProbes,
          handInViewport:
            handRect.top >= 0 && handRect.bottom <= window.innerHeight,
          handTop: handRect.top,
          handBottom: handRect.bottom,
          bodyOverflow,
          scrollHeight,
          innerHeight: window.innerHeight,
          scrollOk,
        };
      });

      for (const probe of layout.cardProbes) {
        expect(
          probe.hitsCard,
          `elementFromPoint at card centre returned ${probe.centreTag} (card top=${probe.top})`,
        ).toBe(true);
      }

      expect(
        layout.handInViewport,
        `hand row outside viewport: top=${layout.handTop} bottom=${layout.handBottom} innerHeight=${layout.innerHeight}`,
      ).toBe(true);

      expect(
        layout.scrollOk,
        `document taller than viewport but body overflow is ${layout.bodyOverflow} (scrollHeight=${layout.scrollHeight})`,
      ).toBe(true);

      // Real mouse click on first hand card (Sephie) — must open fuse picker.
      const first = page.locator("#blueHand .card").first();
      const box = await first.boundingBox();
      expect(box, "first hand card bounding box").toBeTruthy();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(200);

      const fuse = await page.evaluate(() => {
        const gs = (window as any)._gameState;
        const pending = gs?.pendingTargetEffect;
        const eff = pending?.eff;
        return {
          hasPending: !!pending,
          op: eff?.op ?? null,
          action: eff?.action ?? null,
          type: eff?.type ?? null,
          requiresConfirmation: !!pending?.requiresConfirmation,
          selectCount: pending?.selectCount ?? null,
        };
      });

      expect(fuse.hasPending, "pendingTargetEffect after Sephie click").toBe(
        true,
      );
      expect(fuse.op).toBe("fuse");
      expect(fuse.action).toBe("finalize");
      expect(fuse.type).toBe("cards");
      expect(fuse.requiresConfirmation).toBe(true);
      expect(fuse.selectCount).toBeGreaterThanOrEqual(1);
    });
  }
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
