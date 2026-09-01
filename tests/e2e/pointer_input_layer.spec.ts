/**
 * Pointer-input layer — desktop mouse + tablet touch (CDP).
 * Asserts game state via window.__svwbTest / gameState, not CSS classes.
 *
 * Touch: hasTouch + isMobile + Input.dispatchTouchEvent.
 * Mouse: vary move step counts (1 / 3 / 12).
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const CHROME = "/opt/google/chrome/chrome";
const FILLER = "10001110";
const SEPHIE = "10934110";

async function seedPlayable(page: Page, opts?: { fuse?: boolean }) {
  await page.goto(`${BASE}/?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await page.evaluate(
    async ({ filler, sephie, fuse }) => {
      const t = window.__svwbTest!;
      await (await import("/src/data/cardDatabase.ts")).loadCardDatabase();
      t.seedRng(42);
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { applyKeywordsFromList } =
        await import("/src/logic/core/keywords.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(42);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.roundCount = 5;
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;
      state.players.first.evoCharges = 2;
      state.players.first.superEvoCharges = 1;
      state.players.first.evoUsedThisTurn = false;

      const mk = (id: string, uid: string, owner: "first" | "second") => {
        const tpl = getCardById(id)!;
        const c = {
          ...tpl,
          uid,
          owner,
          buffs: { attack: 0, defense: 0 },
        } as any;
        applyKeywordsFromList(c);
        return c;
      };

      if (fuse) {
        state.players.first.hand = [
          mk(sephie, "hand_sephie", "first"),
          mk(filler, "hand_f1", "first"),
          mk(filler, "hand_f2", "first"),
        ];
      } else {
        state.players.first.hand = [
          mk(filler, "hand_0", "first"),
          mk(filler, "hand_1", "first"),
          mk(filler, "hand_2", "first"),
          mk(filler, "hand_3", "first"),
        ];
      }

      // Attackable board presence for combat tests
      const ally = mk(filler, "ally_0", "first");
      ally.attack = 3;
      ally.defense = 3;
      ally.can_attack = true;
      ally.hasAttacked = false;
      ally.hasStorm = true;
      state.players.first.board = [ally];

      const enemy = mk(filler, "enemy_0", "second");
      enemy.attack = 2;
      enemy.defense = 5;
      state.players.second.board = [enemy];
      state.players.second.hp = 20;

      render();
    },
    { filler: FILLER, sephie: SEPHIE, fuse: !!opts?.fuse },
  );
  await page.waitForSelector("#blueHand .card");
}

async function getState(page: Page) {
  return page.evaluate(() => {
    const s = window.__svwbTest!.getState();
    return {
      hand: s.players.first.hand.length,
      board: s.players.first.board.length,
      pp: s.players.first.pp,
      enemyBoard: s.players.second.board.length,
      enemyHp: s.players.second.hp,
      allyEvolved: !!s.players.first.board[0]?.hasEvolved,
      pendingOp: s.pendingTargetEffect?.eff?.op ?? null,
      pendingType: s.pendingTargetEffect?.eff?.type ?? null,
      tooltipDisplay: (
        document.getElementById("cardTooltip") as HTMLElement | null
      )?.style.display,
      tooltipText: (
        document.getElementById("cardTooltip") as HTMLElement | null
      )?.textContent?.slice(0, 80),
      scrollY: window.scrollY,
      dragActive: !!document.querySelector(".pointer-drag-preview"),
      sourceDimmed: !!document.querySelector(".pointer-drag-source"),
    };
  });
}

async function mouseDrag(
  page: Page,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  steps: number,
) {
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps });
  await page.mouse.up();
}

async function cdpTouchDrag(
  page: Page,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: sx, y: sy }],
  });
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: midX, y: midY }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: tx, y: ty }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

function boxCenter(b: { x: number; y: number; width: number; height: number }) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe("Desktop pointer drag (mouse)", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
  });

  for (const steps of [1, 3, 12]) {
    test(`play hand card to board (steps=${steps})`, async ({ page }) => {
      await seedPlayable(page);
      const before = await getState(page);
      const card = page.locator("#blueHand .card").first();
      const board = page.locator("#blueBoard");
      const s = await card.boundingBox();
      const t = await board.boundingBox();
      expect(s && t).toBeTruthy();
      const sc = boxCenter(s!);
      const tc = boxCenter(t!);
      await mouseDrag(page, sc.x, sc.y, tc.x, tc.y, steps);
      await page.waitForTimeout(250);
      const after = await getState(page);
      expect(after.board).toBe(before.board + 1);
      expect(after.hand).toBe(before.hand - 1);
      expect(after.pp).toBeLessThan(before.pp);
    });
  }
});

test.describe("Desktop combat + evo + right-click + tooltip", () => {
  test.use({
    viewport: { width: 1280, height: 720 },
  });

  test("attack enemy follower via pointer drag", async ({ page }) => {
    await seedPlayable(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const a = s.players.first.board[0]!;
      a.can_attack = true;
      a.hasAttacked = false;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const before = await getState(page);
    const s = await page.locator("#blueBoard .card").first().boundingBox();
    const t = await page.locator("#redBoard .card").first().boundingBox();
    expect(s && t).toBeTruthy();
    await mouseDrag(
      page,
      s!.x + s!.width / 2,
      s!.y + s!.height / 2,
      t!.x + t!.width / 2,
      t!.y + t!.height / 2,
      8,
    );
    await page.waitForTimeout(300);
    const after = await getState(page);
    // Either defender died or took damage — enemy board shrunk or hp/def changed
    const def = await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      return {
        enemyBoard: s.players.second.board.length,
        enemyDef: s.players.second.board[0]?.defense ?? null,
      };
    });
    expect(
      def.enemyBoard < before.enemyBoard ||
        (def.enemyDef !== null && def.enemyDef < 5),
    ).toBe(true);
  });

  test("attack enemy leader (face)", async ({ page }) => {
    await seedPlayable(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.players.second.board = [];
      const a = s.players.first.board[0]!;
      a.can_attack = true;
      a.hasAttacked = false;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const before = await getState(page);
    const s = await page.locator("#blueBoard .card").first().boundingBox();
    const t = await page.locator("#redLeader").boundingBox();
    expect(s && t).toBeTruthy();
    await mouseDrag(
      page,
      s!.x + s!.width / 2,
      s!.y + s!.height / 2,
      t!.x + t!.width / 2,
      t!.y + t!.height / 2,
      8,
    );
    await page.waitForTimeout(300);
    const after = await getState(page);
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
  });

  test("evolve via pointer drag onto follower", async ({ page }) => {
    await seedPlayable(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.roundCount = 5;
      s.players.first.evoCharges = 2;
      s.players.first.evoUsedThisTurn = false;
      window.__svwbTest!.render();
    });
    const evo = await page.locator("#blueNormalEvo").boundingBox();
    const follower = await page
      .locator("#blueBoard .card")
      .first()
      .boundingBox();
    expect(evo && follower).toBeTruthy();
    await mouseDrag(
      page,
      evo!.x + evo!.width / 2,
      evo!.y + evo!.height / 2,
      follower!.x + follower!.width / 2,
      follower!.y + follower!.height / 2,
      8,
    );
    await page.waitForTimeout(300);
    const after = await getState(page);
    expect(after.allyEvolved).toBe(true);
  });

  test("right-click hand card still plays it", async ({ page }) => {
    await seedPlayable(page);
    const before = await getState(page);
    const card = page.locator("#blueHand .card").first();
    await card.click({ button: "right" });
    await page.waitForTimeout(250);
    const after = await getState(page);
    expect(after.board).toBe(before.board + 1);
    expect(after.hand).toBe(before.hand - 1);
  });

  test("hover tooltip still appears on desktop", async ({ page }) => {
    await seedPlayable(page);
    const card = page.locator("#blueHand .card").first();
    await card.hover();
    await page.waitForTimeout(100);
    const tip = await page.evaluate(() => {
      const el = document.getElementById("cardTooltip");
      return {
        display: el?.style.display,
        text:
          el?.textContent?.includes("Goblin") ||
          (el?.textContent?.length ?? 0) > 10,
      };
    });
    expect(tip.display).toBe("block");
    expect(tip.text).toBe(true);
  });

  test("pickup shows card text; release hides when not hovering", async ({
    page,
  }) => {
    await seedPlayable(page);
    const card = page.locator("#blueHand .card").first();
    const board = page.locator("#blueBoard");
    const s = await card.boundingBox();
    const t = await board.boundingBox();
    expect(s && t).toBeTruthy();
    await page.mouse.move(s!.x + s!.width / 2, s!.y + s!.height / 2);
    await page.mouse.down();
    await page.mouse.move(s!.x + s!.width / 2, s!.y + s!.height / 2 - 40, {
      steps: 5,
    });
    const during = await getState(page);
    expect(during.tooltipDisplay).toBe("block");
    expect((during.tooltipText?.length ?? 0) > 5).toBe(true);
    await page.mouse.up();
    await page.waitForTimeout(100);
    // Move away so hover does not keep it
    await page.mouse.move(10, 10);
    await page.waitForTimeout(50);
    const after = await getState(page);
    expect(after.tooltipDisplay === "none" || !after.tooltipDisplay).toBe(true);
  });
});

const TABLET_VIEWPORTS = [
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1180x820", width: 1180, height: 820 },
  { name: "1366x1024", width: 1366, height: 1024 },
];

for (const vp of TABLET_VIEWPORTS) {
  test.describe(`Tablet touch ${vp.name}`, () => {
    test.describe.configure({ mode: "serial" });

    let browser: Browser;

    test.beforeAll(async ({ playwright }) => {
      browser = await playwright.chromium.launch({
        executablePath: CHROME,
        headless: true,
      });
    });
    test.afterAll(async () => {
      await browser.close();
    });

    async function touchPage() {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      return { context, page };
    }

    test("finger-drag hand card to board plays it", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page);
      const before = await getState(page);
      const s = await page.locator("#blueHand .card").first().boundingBox();
      const t = await page.locator("#blueBoard").boundingBox();
      expect(s && t).toBeTruthy();
      await cdpTouchDrag(
        page,
        s!.x + s!.width / 2,
        s!.y + s!.height / 2,
        t!.x + t!.width / 2,
        t!.y + t!.height / 2,
      );
      await page.waitForTimeout(300);
      const after = await getState(page);
      expect(after.board).toBe(before.board + 1);
      expect(after.hand).toBe(before.hand - 1);
      expect(after.scrollY).toBe(0);
      await context.close();
    });

    test("finger-drag attack enemy follower", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page);
      await page.evaluate(() => {
        const s = window.__svwbTest!.getState();
        const a = s.players.first.board[0]!;
        a.can_attack = true;
        a.hasAttacked = false;
        a.hasStorm = true;
        window.__svwbTest!.render();
      });
      const beforeHp = await page.evaluate(() => {
        const e = window.__svwbTest!.getState().players.second.board[0];
        return e?.defense ?? null;
      });
      const s = await page.locator("#blueBoard .card").first().boundingBox();
      const t = await page.locator("#redBoard .card").first().boundingBox();
      expect(s && t).toBeTruthy();
      await cdpTouchDrag(
        page,
        s!.x + s!.width / 2,
        s!.y + s!.height / 2,
        t!.x + t!.width / 2,
        t!.y + t!.height / 2,
      );
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        const st = window.__svwbTest!.getState();
        return {
          enemyBoard: st.players.second.board.length,
          def: st.players.second.board[0]?.defense ?? null,
        };
      });
      expect(
        after.enemyBoard === 0 ||
          (after.def !== null && beforeHp !== null && after.def < beforeHp),
      ).toBe(true);
      await context.close();
    });

    test("finger-drag onto enemy leader deals face damage", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page);
      await page.evaluate(() => {
        const s = window.__svwbTest!.getState();
        s.players.second.board = [];
        const a = s.players.first.board[0]!;
        a.can_attack = true;
        a.hasAttacked = false;
        a.hasStorm = true;
        window.__svwbTest!.render();
      });
      const before = await getState(page);
      const s = await page.locator("#blueBoard .card").first().boundingBox();
      const t = await page.locator("#redLeader").boundingBox();
      expect(s && t).toBeTruthy();
      await cdpTouchDrag(
        page,
        s!.x + s!.width / 2,
        s!.y + s!.height / 2,
        t!.x + t!.width / 2,
        t!.y + t!.height / 2,
      );
      await page.waitForTimeout(300);
      const after = await getState(page);
      expect(after.enemyHp).toBeLessThan(before.enemyHp);
      await context.close();
    });

    test("finger-drag evo onto follower", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page);
      await page.evaluate(() => {
        const s = window.__svwbTest!.getState();
        s.roundCount = 5;
        s.players.first.evoCharges = 2;
        s.players.first.evoUsedThisTurn = false;
        window.__svwbTest!.render();
      });
      const evo = await page.locator("#blueNormalEvo").boundingBox();
      const follower = await page
        .locator("#blueBoard .card")
        .first()
        .boundingBox();
      expect(evo && follower).toBeTruthy();
      await cdpTouchDrag(
        page,
        evo!.x + evo!.width / 2,
        evo!.y + evo!.height / 2,
        follower!.x + follower!.width / 2,
        follower!.y + follower!.height / 2,
      );
      await page.waitForTimeout(300);
      expect((await getState(page)).allyEvolved).toBe(true);
      await context.close();
    });

    test("tap fuse card opens fuse; drag-release in hand fuses", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page, { fuse: true });
      const card = page.locator("#blueHand .card").first();
      const box = await card.boundingBox();
      expect(box).toBeTruthy();
      // Tap via touch
      const cdp = await context.newCDPSession(page);
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(250);
      let fuse = await getState(page);
      expect(fuse.pendingOp).toBe("fuse");

      // Reset and drag-release onto a hand *card* (not the container centre).
      // At 1024×768 a card centre can sit outside #blueHand's bounding rect.
      await seedPlayable(page, { fuse: true });
      const geo = await page.evaluate(() => {
        const hand = document.getElementById("blueHand")!;
        const cards = [...hand.querySelectorAll(".card")] as HTMLElement[];
        const handRect = hand.getBoundingClientRect();
        const points = cards.map((c) => {
          const r = c.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const insideRect =
            x >= handRect.left &&
            x <= handRect.right &&
            y >= handRect.top &&
            y <= handRect.bottom;
          return { x, y, insideRect };
        });
        // Prefer a card centre outside the container rect when one exists.
        const outside = points.find((p) => !p.insideRect);
        const target = outside ?? points[0]!;
        return {
          handRect: {
            left: handRect.left,
            right: handRect.right,
            top: handRect.top,
            bottom: handRect.bottom,
          },
          release: target,
          anyOutside: !!outside,
        };
      });

      // Geometry note at 1024×768: before the hand-row freefill, at least one
      // card centre sat outside #blueHand's rect (overflow fan). With the
      // full-width hand that overflow may no longer occur — fuse must still
      // resolve via isPointerOverHandZone either way. Prefer an outside
      // centre when one exists; otherwise release onto a card centre.
      if (vp.width === 1024 && vp.height === 768 && geo.anyOutside) {
        expect(geo.release.insideRect).toBe(false);
      }

      const c2 = await page.locator("#blueHand .card").first().boundingBox();
      expect(c2).toBeTruthy();
      await cdpTouchDrag(
        page,
        c2!.x + c2!.width / 2,
        c2!.y + c2!.height / 2,
        geo.release.x,
        geo.release.y,
      );
      await page.waitForTimeout(250);
      fuse = await getState(page);
      expect(fuse.pendingOp).toBe("fuse");
      expect(fuse.hand).toBe(3); // not played
      await context.close();
    });

    test("1024 geometry: release over overflowed hand card is inside hand", async () => {
      // Skip on non-1024 viewports — only 1024×768 pins the overflow geometry.
      if (vp.width !== 1024 || vp.height !== 768) return;

      const { context, page } = await touchPage();
      await seedPlayable(page, { fuse: true });
      const result = await page.evaluate(async () => {
        const { isPointerOverHandZone } =
          await import("/src/ui/pointerDragSession.ts");
        const hand = document.getElementById("blueHand")!;
        const handRect = hand.getBoundingClientRect();
        const cards = [...hand.querySelectorAll(".card")] as HTMLElement[];
        const samples = cards.map((c) => {
          const r = c.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const insideRect =
            x >= handRect.left &&
            x <= handRect.right &&
            y >= handRect.top &&
            y <= handRect.bottom;
          return {
            x,
            y,
            insideRect,
            overHand: isPointerOverHandZone("blueHand", x, y),
          };
        });
        const overflowed = samples.filter((s) => !s.insideRect);
        return {
          handRect: {
            left: handRect.left,
            right: handRect.right,
          },
          samples,
          overflowed,
        };
      });

      // Before the hand-row freefill, 1024×768 pinned overflowed card centres
      // (rect says outside, elementFromPoint walk says inside). With a
      // full-width hand that overflow may be gone — still require every card
      // centre to resolve as inside the hand via isPointerOverHandZone.
      expect(result.samples.length).toBeGreaterThan(0);
      for (const s of result.samples) {
        expect(s.overHand).toBe(true);
      }
      for (const s of result.overflowed) {
        expect(s.insideRect).toBe(false);
        expect(s.overHand).toBe(true);
      }
      await context.close();
    });

    test("pickup shows text; pointercancel clears drag state", async () => {
      const { context, page } = await touchPage();
      await seedPlayable(page);
      const s = await page.locator("#blueHand .card").first().boundingBox();
      expect(s).toBeTruthy();
      const cdp = await context.newCDPSession(page);
      const sx = s!.x + s!.width / 2;
      const sy = s!.y + s!.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: sx, y: sy }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: sx + 30, y: sy - 40 }],
      });
      await page.waitForTimeout(50);
      let mid = await getState(page);
      expect(mid.tooltipDisplay).toBe("block");
      expect(mid.dragActive).toBe(true);

      // Cancel with the live pointerId stamped on the source element.
      await page.evaluate(() => {
        const src = document.querySelector(
          ".pointer-drag-source",
        ) as HTMLElement | null;
        if (!src) throw new Error("no drag source");
        const id = Number(src.dataset.pointerDragId || "1");
        src.dispatchEvent(
          new PointerEvent("pointercancel", {
            bubbles: true,
            cancelable: true,
            pointerId: id,
          }),
        );
      });
      await page.waitForTimeout(50);
      mid = await getState(page);
      expect(mid.dragActive).toBe(false);
      expect(mid.sourceDimmed).toBe(false);
      expect(mid.hand).toBe(4);
      await context.close();
    });
  });
}
