/**
 * Fuse vs drag: zone rule.
 *
 * Critical ordering: browser may fire dragstart with no pointermove first.
 * Tests that only use page.mouse.move() pass on broken threshold code —
 * the no-pointermove case must be exercised explicitly via dispatched events.
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

test.describe("Fuse vs drag zone rule at 1440×900", () => {
  test("dragstart with no prior pointermove is NOT cancelled", async ({
    page,
  }) => {
    await seedSephieHand(page);

    const result = await page.evaluate(() => {
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
      // Intentionally no pointermove — the ordering that cancelled drags on hardware.
      const dragEv = new Event("dragstart", {
        bubbles: true,
        cancelable: true,
      });
      card.dispatchEvent(dragEv);
      return { defaultPrevented: dragEv.defaultPrevented };
    });

    expect(result.defaultPrevented).toBe(false);
  });

  test("dragend inside hand (no pointermove before dragstart) opens fuse", async ({
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
      // Release still inside the hand zone.
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
      // No pointermove before dragstart.
      card.dispatchEvent(
        new Event("dragstart", { bubbles: true, cancelable: true }),
      );
      card.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          clientX: releaseX,
          clientY: releaseY,
        }),
      );
    });
    await page.waitForTimeout(200);

    const fuse = await readFusePending(page);
    expect(fuse.hasPending).toBe(true);
    expect(fuse.op).toBe("fuse");
    expect(fuse.type).toBe("cards");
  });

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

  test("dragstart without dragend + node-reuse reconcile still allows fuse", async ({
    page,
  }) => {
    await seedSephieHand(page);

    const stuck = await page.evaluate(async () => {
      const card = document.querySelector("#blueHand .card") as HTMLElement;
      const sameBefore = card;
      card.dispatchEvent(
        new Event("dragstart", { bubbles: true, cancelable: true }),
      );
      // No dragend — latch stuck on the closure bound to this node.

      const { render } = await import("/src/ui/render.ts");
      // VM unchanged → reconciler reuses the same DOM node (handlers not re-bound).
      render();
      render();
      const sameAfter = document.querySelector(
        "#blueHand .card",
      ) as HTMLElement;
      return {
        sameNode: sameBefore === sameAfter,
      };
    });
    expect(stuck.sameNode).toBe(true);

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

  test("drag-to-board still plays a follower", async ({ page }) => {
    await seedSephieHand(page);
    // Play the filler (2nd card), not Sephie — drag-to-play path.
    const filler = page.locator("#blueHand .card").nth(1);
    const board = page.locator("#blueBoard");
    await filler.dragTo(board);
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

  test("dragend outside hand does not open fuse (card stays, no pending)", async ({
    page,
  }) => {
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
        new Event("dragstart", { bubbles: true, cancelable: true }),
      );
      // Far outside the hand / window — lost or aborted play gesture.
      card.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          clientX: 0,
          clientY: 0,
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
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
