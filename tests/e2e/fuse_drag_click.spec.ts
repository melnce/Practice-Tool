/**
 * Fuse left-click must win against HTML5 drag jitter, and the drag-click
 * suppressor must not latch across reconciles when dragend never fires.
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

test.describe("Fuse click vs drag at 1440×900", () => {
  test("under-threshold press-move-release opens fuse picker", async ({
    page,
  }) => {
    await seedSephieHand(page);
    const card = page.locator("#blueHand .card").first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // 5px jitter — historically started HTML5 drag and ate the click.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5, cy, { steps: 3 });
    await page.mouse.up();
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
      const { state } = await import("/src/core/gameState.ts");
      // VM unchanged → reconciler reuses the same DOM node (handlers not re-bound).
      render();
      render();
      const sameAfter = document.querySelector(
        "#blueHand .card",
      ) as HTMLElement;
      return {
        sameNode: sameBefore === sameAfter,
        uid: state.players.first.hand[0]?.uid,
      };
    });
    expect(stuck.sameNode).toBe(true);

    // Without pointerdown clearing the latch, a bare click would be eaten.
    // A real user gesture always starts with pointerdown — that is the recovery.
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
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
