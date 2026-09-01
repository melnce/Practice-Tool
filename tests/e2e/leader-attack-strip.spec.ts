/**
 * Leader → right rail + board-edge attack strip.
 *
 * Acceptance: hand row spans full content width (no card shrink); attack and
 * spell targeting resolve via the strip; sabotage-prove the strip hit target.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { existsSync } from "fs";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const CHROME =
  process.env.CHROME_PATH ||
  (existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : undefined);
const FILLER = "10001110";
/** Rage of Serpents — deal 3 to enemy follower or leader (can_target_leader). */
const LEADER_TARGET_SPELL = "10153310";

async function mouseDrag(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 8,
) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.mouse.up();
}

async function cdpTouchDrag(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0 }],
  });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function seedAttackSetup(page: Page) {
  await page.goto(`${BASE}/?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await page.evaluate(
    async ({ filler }) => {
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
      state.players.second.hp = 20;
      state.players.second.board = [];

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

      const ally = mk(filler, "ally_0", "first");
      ally.attack = 3;
      ally.defense = 3;
      ally.can_attack = true;
      ally.hasAttacked = false;
      ally.hasStorm = true;
      state.players.first.board = [ally];
      state.players.first.hand = [mk(filler, "hand_0", "first")];

      render();
    },
    { filler: FILLER },
  );
  await page.waitForSelector("#blueBoard .card");
}

async function seedSpellLeaderTarget(page: Page) {
  await page.goto(`${BASE}/?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await page.evaluate(
    async ({ spellId }) => {
      await (await import("/src/data/cardDatabase.ts")).loadCardDatabase();
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { applyKeywordsFromList } =
        await import("/src/logic/core/keywords.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(42);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;
      state.players.second.hp = 20;
      state.players.second.board = [];

      const spellTpl = getCardById(spellId)!;
      const spell = {
        ...spellTpl,
        uid: "spell_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      } as any;
      applyKeywordsFromList(spell);
      state.players.first.hand = [spell];
      render();
    },
    { spellId: LEADER_TARGET_SPELL },
  );
  await page.waitForSelector("#blueHand .card");
}

async function measureHandStrip(page: Page, handSel: string, n: number) {
  return page.evaluate(
    ({ handSel, n }) => {
      const hand = document.querySelector(handSel) as HTMLElement | null;
      if (!hand) throw new Error(`missing ${handSel}`);
      const cards = [...hand.querySelectorAll(".card")] as HTMLElement[];
      if (cards.length < n) {
        throw new Error(`expected ≥${n} cards, got ${cards.length}`);
      }
      const handRect = hand.getBoundingClientRect();
      const scale = getComputedStyle(hand)
        .getPropertyValue("--hand-local-scale")
        .trim();
      const widths: number[] = [];
      for (let i = 0; i < Math.min(n - 1, cards.length - 1); i++) {
        const a = cards[i]!.getBoundingClientRect();
        const b = cards[i + 1]!.getBoundingClientRect();
        widths.push(b.left - a.left);
      }
      const minStrip = widths.length ? Math.min(...widths) : handRect.width;
      const cardW = cards[0]!.getBoundingClientRect().width;
      return {
        containerWidth: handRect.width,
        minStrip,
        cardWidth: cardW,
        scale,
        n: cards.length,
      };
    },
    { handSel, n },
  );
}

async function fillHand(page: Page, player: "first" | "second", n: number) {
  await page.evaluate(
    ({ player, n, filler }) => {
      const t = window.__svwbTest!;
      const s = t.getState();
      s.players[player].hand = [];
      for (let i = 0; i < n; i++) t.addToHand(player, filler);
      t.render();
    },
    { player, n, filler: FILLER },
  );
}

test.describe("leader attack strip + freed hand row", () => {
  test("hand container width / strip at tablet + desktop (7/8/9, both rows)", async ({
    page,
  }) => {
    const results: Record<string, unknown>[] = [];

    for (const vp of [
      { name: "tablet", width: 1180, height: 820 },
      { name: "desktop", width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/?test=1`);
      await page.waitForFunction(() => !!(window as any).__svwbTest);
      await page.evaluate(async () => {
        const t = window.__svwbTest!;
        await (await import("/src/data/cardDatabase.ts")).loadCardDatabase();
        t.seedRng(42);
        const { resetGameState, state } =
          await import("/src/core/gameState.ts");
        const { render } = await import("/src/ui/render.ts");
        resetGameState(42);
        state.gameStarted = true;
        state.phase = "main";
        state.activePlayer = "first";
        render();
      });

      for (const n of [7, 8, 9]) {
        // Active hand on bottom (blue / first)
        await page.evaluate(() => {
          document.body.classList.remove("active-on-bottom", "active-second");
          document.body.classList.add("active-first");
          const s = window.__svwbTest!.getState();
          s.activePlayer = "first";
          window.__svwbTest!.render();
        });
        await fillHand(page, "first", n);
        await fillHand(page, "second", n);
        const bottom = await measureHandStrip(page, "#blueHand", n);
        results.push({ vp: vp.name, row: "bottom", ...bottom });
        expect(
          bottom.minStrip,
          `${vp.name} bottom N=${n} strip`,
        ).toBeGreaterThanOrEqual(60);
        // Scale must match main tokens (no shrink)
        if (vp.name === "tablet") {
          expect(Number(bottom.scale)).toBeCloseTo(1, 2);
        }

        // Active hand on top via perspective flip (red / second on bottom →
        // blue hand moves to top when active-on-bottom + active-second)
        await page.evaluate(() => {
          document.body.classList.add("active-on-bottom", "active-second");
          document.body.classList.remove("active-first");
          document.body.classList.add("active-second");
          const s = window.__svwbTest!.getState();
          s.activePlayer = "second";
          window.__svwbTest!.render();
        });
        await fillHand(page, "second", n);
        await fillHand(page, "first", n);
        // With flip: blue is top, red is bottom. Top hand = blue.
        const top = await measureHandStrip(page, "#blueHand", n);
        results.push({ vp: vp.name, row: "top-flipped-blue", ...top });
        expect(
          top.minStrip,
          `${vp.name} top N=${n} strip`,
        ).toBeGreaterThanOrEqual(60);

        // Also measure red as top (default orientation)
        await page.evaluate(() => {
          document.body.classList.remove("active-on-bottom", "active-second");
          document.body.classList.add("active-second");
          const s = window.__svwbTest!.getState();
          s.activePlayer = "second";
          window.__svwbTest!.render();
        });
        await fillHand(page, "second", n);
        const topRed = await measureHandStrip(page, "#redHand", n);
        results.push({ vp: vp.name, row: "top-red", ...topRed });
        expect(
          topRed.minStrip,
          `${vp.name} top-red N=${n} strip`,
        ).toBeGreaterThanOrEqual(60);
      }
    }

    // Surface metrics for PR evidence (printed by list reporter)
    console.log("HAND_STRIP_METRICS", JSON.stringify(results, null, 2));
  });

  test("mouse drag attack onto strip drops enemy HP", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedAttackSetup(page);
    const before = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    const s = await page.locator("#blueBoard .card").first().boundingBox();
    const t = await page.locator("#redLeader").boundingBox();
    expect(s && t).toBeTruthy();
    expect(t!.height).toBeGreaterThanOrEqual(40);
    expect(t!.height).toBeLessThanOrEqual(48);
    await mouseDrag(
      page,
      s!.x + s!.width / 2,
      s!.y + s!.height / 2,
      t!.x + t!.width / 2,
      t!.y + t!.height / 2,
    );
    await page.waitForTimeout(300);
    const after = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    expect(after).toBeLessThan(before);
  });

  test("spell targeting leader via strip resolves", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedSpellLeaderTarget(page);
    const before = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    await page.locator("#blueHand .card").first().click({ button: "right" });
    await page.waitForSelector("#redLeader.selectable", { timeout: 5000 });
    await page.locator("#redLeader").click();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      return {
        hp: s.players.second.hp,
        pending: !!s.pendingTargetEffect,
      };
    });
    expect(after.pending).toBe(false);
    expect(after.hp).toBeLessThan(before);
  });

  test("evo buttons + HP readout live in right rail; barrier host on HP", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedAttackSetup(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.players.second.leaderBarrier = 1;
      s.players.second.evoCharges = 2;
      s.roundCount = 5;
      s.activePlayer = "second";
      window.__svwbTest!.render();
    });

    const layout = await page.evaluate(() => {
      const evo = document.getElementById("redNormalEvo")!;
      const hp = document.getElementById("redLeaderHp")!;
      const strip = document.getElementById("redLeader")!;
      const hand = document.getElementById("redHand")!;
      const app = document.getElementById("appRoot")!;
      const evoR = evo.getBoundingClientRect();
      const hpR = hp.getBoundingClientRect();
      const stripR = strip.getBoundingClientRect();
      const handR = hand.getBoundingClientRect();
      const appR = app.getBoundingClientRect();
      const cs = getComputedStyle(app);
      const padRight = parseFloat(cs.paddingRight) || 0;
      const contentRight = appR.right - padRight;
      return {
        evoInRail: evoR.left >= contentRight - 4,
        hpInRail: hpR.left >= contentRight - 4,
        stripInContent: stripR.right <= contentRight + 2,
        handFullWidth:
          handR.width >=
          (appR.width - padRight - (parseFloat(cs.paddingLeft) || 0)) * 0.95,
        handWidth: handR.width,
        contentWidth: appR.width - padRight - (parseFloat(cs.paddingLeft) || 0),
        hpText: document.getElementById("redHP")?.textContent,
        barrierOnHp: hp.classList.contains("has-leader-barrier"),
        barrierOnStrip: strip.classList.contains("has-leader-barrier"),
        stripHeight: stripR.height,
      };
    });

    expect(layout.evoInRail).toBe(true);
    expect(layout.hpInRail).toBe(true);
    expect(layout.stripInContent).toBe(true);
    expect(layout.handFullWidth).toBe(true);
    expect(layout.handWidth).toBeGreaterThan(700);
    expect(layout.hpText).toBe("20");
    expect(layout.barrierOnHp).toBe(true);
    expect(layout.barrierOnStrip).toBe(false);
    expect(layout.stripHeight).toBe(44);
  });

  test("sabotage-prove: breaking strip hit target fails attack; restore passes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedAttackSetup(page);

    // Sabotage: pointer-events none + zero size — elementFromPoint cannot hit
    await page.evaluate(() => {
      const strip = document.getElementById("redLeader")!;
      strip.style.pointerEvents = "none";
      strip.style.height = "0px";
      strip.style.minHeight = "0px";
      strip.style.flexBasis = "0px";
      strip.style.opacity = "0";
    });

    const beforeSab = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    const s1 = await page.locator("#blueBoard .card").first().boundingBox();
    // Aim at where the strip used to be (top of red board outer edge)
    const board = await page.locator("#redBoard").boundingBox();
    expect(s1 && board).toBeTruthy();
    await mouseDrag(
      page,
      s1!.x + s1!.width / 2,
      s1!.y + s1!.height / 2,
      board!.x + board!.width / 2,
      board!.y - 22,
    );
    await page.waitForTimeout(300);
    const afterSab = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    expect(afterSab, "sabotaged strip must NOT accept the attack").toBe(
      beforeSab,
    );
    console.log(
      `SABOTAGE_FAIL_PROOF: attack with pointer-events:none strip → HP unchanged (${beforeSab}→${afterSab})`,
    );

    // Restore
    await page.evaluate(() => {
      const strip = document.getElementById("redLeader")!;
      strip.style.pointerEvents = "";
      strip.style.height = "";
      strip.style.minHeight = "";
      strip.style.flexBasis = "";
      strip.style.opacity = "";
      window.__svwbTest!.render();
    });
    // Re-arm attacker (render may reset flags — force attackable)
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const a = s.players.first.board[0];
      if (a) {
        a.can_attack = true;
        a.hasAttacked = false;
        a.hasStorm = true;
      }
      window.__svwbTest!.render();
    });

    const beforeOk = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    const s2 = await page.locator("#blueBoard .card").first().boundingBox();
    const t2 = await page.locator("#redLeader").boundingBox();
    expect(s2 && t2).toBeTruthy();
    expect(t2!.height).toBeGreaterThanOrEqual(40);
    await mouseDrag(
      page,
      s2!.x + s2!.width / 2,
      s2!.y + s2!.height / 2,
      t2!.x + t2!.width / 2,
      t2!.y + t2!.height / 2,
    );
    await page.waitForTimeout(300);
    const afterOk = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    expect(afterOk, "restored strip must accept the attack").toBeLessThan(
      beforeOk,
    );
    console.log(
      `SABOTAGE_PASS_PROOF: attack with restored strip → HP dropped (${beforeOk}→${afterOk})`,
    );
  });
});

test.describe("leader strip touch + row orientations", () => {
  test.describe.configure({ mode: "serial" });
  let browser: Browser;

  test.beforeAll(async ({ playwright }) => {
    browser = await playwright.chromium.launch({
      ...(CHROME ? { executablePath: CHROME } : {}),
      headless: true,
    });
  });
  test.afterAll(async () => {
    await browser.close();
  });

  for (const flipped of [false, true]) {
    test(`touch attack strip (flipped=${flipped})`, async () => {
      const context = await browser.newContext({
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await seedAttackSetup(page);
      if (flipped) {
        await page.evaluate(() => {
          document.body.classList.add("active-on-bottom", "active-second");
          // Keep first player active for the attack; flip is visual only here
          window.__svwbTest!.render();
        });
      }
      const before = await page.evaluate(
        () => window.__svwbTest!.getState().players.second.hp,
      );
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
      const after = await page.evaluate(
        () => window.__svwbTest!.getState().players.second.hp,
      );
      expect(after).toBeLessThan(before);
      await context.close();
    });
  }
});
