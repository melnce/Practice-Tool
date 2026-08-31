/**
 * Fuse vs pointer-drag: zone rule.
 *
 * Critical: do not rely only on page.mouse.move() with many steps — vary
 * step counts and also drive raw pointer events. Assert game state.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const SEPHIE_ID = "10934110";
const FILLER_ID = "10001110";

async function seedSephieHand(page: import("@playwright/test").Page) {
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 900 });

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

      const ids = [sephieId, fillerId, fillerId, fillerId];
      state.players.first.hand = ids.map((id, i) => {
        const tpl = getCardById(id);
        if (!tpl) throw new Error(`missing ${id}`);
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

  await page.waitForSelector("#blueHand .card");
}

async function readFusePending(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const gs = (window as any)._gameState;
    const pending = gs?.pendingTargetEffect;
    return {
      hasPending: !!pending,
      op: pending?.eff?.op ?? null,
      action: pending?.eff?.action ?? null,
      type: pending?.eff?.type ?? null,
      requiresConfirmation: !!pending?.requiresConfirmation,
    };
  });
}

async function pointerDrag(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

test.describe("Fuse vs pointer-drag zone rule at 1440×900", () => {
  test("plain left-click opens fuse picker", async ({ page }) => {
    await seedSephieHand(page);
    const card = page.locator("#blueHand .card").first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);

    const fuse = await readFusePending(page);
    expect(fuse.hasPending).toBe(true);
    expect(fuse.op).toBe("fuse");
    expect(fuse.type).toBe("cards");
  });

  test("pointer-drag release inside hand opens fuse (raw events, no move-before-down)", async ({
    page,
  }) => {
    await seedSephieHand(page);

    await page.evaluate(() => {
      const card = document.querySelector("#blueHand .card") as HTMLElement;
      const hand = document.getElementById("blueHand")!;
      const handRect = hand.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const releaseX = handRect.left + handRect.width / 2;
      const releaseY = handRect.top + handRect.height / 2;

      card.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          pointerId: 1,
          button: 0,
          buttons: 1,
        }),
      );
      // Cross threshold inside hand.
      card.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: cx + 20,
          clientY: cy + 10,
          pointerId: 1,
          buttons: 1,
        }),
      );
      card.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: releaseX,
          clientY: releaseY,
          pointerId: 1,
          button: 0,
          buttons: 0,
        }),
      );
    });
    await page.waitForTimeout(200);

    const fuse = await readFusePending(page);
    expect(fuse.hasPending).toBe(true);
    expect(fuse.op).toBe("fuse");
    expect(fuse.type).toBe("cards");
  });

  test("drag-to-board still plays a follower (steps=1)", async ({ page }) => {
    await seedSephieHand(page);
    const filler = page.locator("#blueHand .card").nth(1);
    const board = page.locator("#blueBoard");
    const s = await filler.boundingBox();
    const t = await board.boundingBox();
    expect(s && t).toBeTruthy();
    await pointerDrag(
      page,
      { x: s!.x + s!.width / 2, y: s!.y + s!.height / 2 },
      { x: t!.x + t!.width / 2, y: t!.y + t!.height / 2 },
      1,
    );
    await page.waitForTimeout(300);

    const counts = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return {
        hand: state.players.first.hand.length,
        board: state.players.first.board.length,
        pendingFuse: state.pendingTargetEffect?.eff?.op === "fuse",
      };
    });
    expect(counts.board).toBeGreaterThanOrEqual(1);
    expect(counts.hand).toBeLessThan(4);
    expect(counts.pendingFuse).toBe(false);
  });

  test("drag-to-board plays with steps=12", async ({ page }) => {
    await seedSephieHand(page);
    const filler = page.locator("#blueHand .card").nth(1);
    const board = page.locator("#blueBoard");
    const s = await filler.boundingBox();
    const t = await board.boundingBox();
    expect(s && t).toBeTruthy();
    await pointerDrag(
      page,
      { x: s!.x + s!.width / 2, y: s!.y + s!.height / 2 },
      { x: t!.x + t!.width / 2, y: t!.y + t!.height / 2 },
      12,
    );
    await page.waitForTimeout(300);

    const boardLen = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.players.first.board.length;
    });
    expect(boardLen).toBeGreaterThanOrEqual(1);
  });

  test("release outside hand / at 0,0 does not open fuse", async ({ page }) => {
    await seedSephieHand(page);

    await page.evaluate(() => {
      const card = document.querySelector("#blueHand .card") as HTMLElement;
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      card.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          pointerId: 1,
          button: 0,
          buttons: 1,
        }),
      );
      card.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: cx + 30,
          clientY: cy - 40,
          pointerId: 1,
          buttons: 1,
        }),
      );
      card.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 0,
          clientY: 0,
          pointerId: 1,
          button: 0,
          buttons: 0,
        }),
      );
    });
    await page.waitForTimeout(200);

    const fuse = await readFusePending(page);
    expect(fuse.hasPending).toBe(false);

    const handLen = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.players.first.hand.length;
    });
    expect(handLen).toBe(4);
  });

  test("after aborted drag + reconcile, click still opens fuse", async ({
    page,
  }) => {
    await seedSephieHand(page);

    await page.evaluate(async () => {
      const card = document.querySelector("#blueHand .card") as HTMLElement;
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      card.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          pointerId: 1,
          button: 0,
          buttons: 1,
        }),
      );
      card.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: cx + 25,
          clientY: cy,
          pointerId: 1,
          buttons: 1,
        }),
      );
      card.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          clientX: cx + 25,
          clientY: cy,
          pointerId: 1,
        }),
      );
      const { render } = await import("/src/ui/render.ts");
      render();
      render();
    });

    const card = page.locator("#blueHand .card").first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(200);

    const fuse = await readFusePending(page);
    expect(fuse.hasPending).toBe(true);
    expect(fuse.op).toBe("fuse");
  });

  test("hand cards use pointer-draggable, not HTML5 draggable", async ({
    page,
  }) => {
    await seedSephieHand(page);
    const attrs = await page.evaluate(() => {
      const card = document.querySelector("#blueHand .card") as HTMLElement;
      return {
        html5: card.getAttribute("draggable"),
        pointer: card.dataset.pointerDraggable,
      };
    });
    expect(attrs.html5).not.toBe("true");
    expect(attrs.pointer).toBe("true");
  });
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
