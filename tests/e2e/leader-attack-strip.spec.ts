/**
 * Outer-edge leader bar [Evo|HP|Super] — also the attack / spell-target surface.
 *
 * Acceptance: hand row spans full content width (no card shrink); attack and
 * spell targeting resolve via the bar; sabotage-prove the bar hit target.
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
    // Aim at the expanded hit pad (bar is 32px; ::before adds pad+outset).
    const hit = await page.evaluate(() => {
      const strip = document.getElementById("redLeader")!;
      const root = getComputedStyle(document.documentElement);
      const pad =
        parseFloat(root.getPropertyValue("--leader-attack-hit-pad")) || 0;
      const gap =
        parseFloat(root.getPropertyValue("--leader-attack-gap-outset")) || 0;
      const r = strip.getBoundingClientRect();
      // Red default: ::before extends upward from strip bottom through pad+gap.
      const hitTop = r.bottom - (r.height + pad + gap);
      const hitBottom = r.bottom;
      return {
        x: r.x + r.width / 2,
        y: (hitTop + hitBottom) / 2,
        layoutH: r.height,
        hitH: r.height + pad + gap,
      };
    });
    expect(s).toBeTruthy();
    expect(hit.layoutH).toBe(32);
    expect(hit.hitH).toBe(47);
    await mouseDrag(
      page,
      s!.x + s!.width / 2,
      s!.y + s!.height / 2,
      hit.x,
      hit.y,
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

  test("evo+HP on outer-edge leader bar; barrier host on HP; hit clears zones", async ({
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
      const board = document.getElementById("redBoard")!;
      const app = document.getElementById("appRoot")!;
      const evoR = evo.getBoundingClientRect();
      const hpR = hp.getBoundingClientRect();
      const stripR = strip.getBoundingClientRect();
      const handR = hand.getBoundingClientRect();
      const boardR = board.getBoundingClientRect();
      const appR = app.getBoundingClientRect();
      const cs = getComputedStyle(app);
      const root = getComputedStyle(document.documentElement);
      const pad = parseFloat(root.getPropertyValue("--leader-attack-hit-pad"));
      const gapOut = parseFloat(
        root.getPropertyValue("--leader-attack-gap-outset"),
      );
      const padRight = parseFloat(cs.paddingRight) || 0;
      const contentRight = appR.right - padRight;
      // Red default: hit extends upward from strip.bottom
      const hitTop = stripR.bottom - (stripR.height + pad + gapOut);
      const hitBottom = stripR.bottom;
      const hitOverlapsBoard = hitBottom > boardR.top + 0.5;
      const hitOverlapsHand = hitTop < handR.bottom - 0.5;
      return {
        evoInBar: strip.contains(evo),
        hpInBar: strip.contains(hp),
        evoInContent: evoR.right <= contentRight + 2,
        hpInContent: hpR.right <= contentRight + 2,
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
        hitHeight: stripR.height + pad + gapOut,
        hitOverlapsBoard,
        hitOverlapsHand,
        hpW: hpR.width,
        hpH: hpR.height,
      };
    });

    expect(layout.evoInBar).toBe(true);
    expect(layout.hpInBar).toBe(true);
    expect(layout.evoInContent).toBe(true);
    expect(layout.hpInContent).toBe(true);
    expect(layout.stripInContent).toBe(true);
    expect(layout.handFullWidth).toBe(true);
    expect(layout.handWidth).toBeGreaterThan(700);
    expect(layout.hpText).toBe("20");
    expect(layout.barrierOnHp).toBe(true);
    expect(layout.stripHeight).toBe(32);
    expect(layout.hitHeight).toBe(47);
    expect(layout.hitOverlapsBoard).toBe(false);
    expect(layout.hitOverlapsHand).toBe(false);
  });

  test("sabotage-prove: breaking strip hit target fails attack; restore passes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await seedAttackSetup(page);

    // Sabotage: disable the ::before hit pad (pointer-events:none on pseudo)
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "sabotage-strip-hit";
      style.textContent = `
        .leader-attack-strip::before { pointer-events: none !important; }
      `;
      document.head.appendChild(style);
    });

    const beforeSab = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    const s1 = await page.locator("#blueBoard .card").first().boundingBox();
    const aim = await page.evaluate(() => {
      const strip = document.getElementById("redLeader")!;
      const root = getComputedStyle(document.documentElement);
      const pad = parseFloat(root.getPropertyValue("--leader-attack-hit-pad"));
      const gapOut = parseFloat(
        root.getPropertyValue("--leader-attack-gap-outset"),
      );
      const r = strip.getBoundingClientRect();
      const hitTop = r.bottom - (r.height + pad + gapOut);
      // Aim at the empty left of the bar (controls are centred) so the
      // sabotage isolates ::before — not the Evo/HP/Super hit targets.
      return { x: r.x + 24, y: (hitTop + r.bottom) / 2 };
    });
    expect(s1).toBeTruthy();
    await mouseDrag(
      page,
      s1!.x + s1!.width / 2,
      s1!.y + s1!.height / 2,
      aim.x,
      aim.y,
    );
    await page.waitForTimeout(300);
    const afterSab = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    expect(afterSab, "sabotaged strip must NOT accept the attack").toBe(
      beforeSab,
    );
    console.log(
      `SABOTAGE_FAIL_PROOF: attack with ::before pointer-events:none → HP unchanged (${beforeSab}→${afterSab})`,
    );

    // Restore
    await page.evaluate(() => {
      document.getElementById("sabotage-strip-hit")?.remove();
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
    const aim2 = await page.evaluate(() => {
      const strip = document.getElementById("redLeader")!;
      const root = getComputedStyle(document.documentElement);
      const pad = parseFloat(root.getPropertyValue("--leader-attack-hit-pad"));
      const gapOut = parseFloat(
        root.getPropertyValue("--leader-attack-gap-outset"),
      );
      const r = strip.getBoundingClientRect();
      const hitTop = r.bottom - (r.height + pad + gapOut);
      return {
        x: r.x + 24,
        y: (hitTop + r.bottom) / 2,
        hitH: r.height + pad + gapOut,
      };
    });
    expect(s2).toBeTruthy();
    expect(aim2.hitH).toBe(47);
    await mouseDrag(
      page,
      s2!.x + s2!.width / 2,
      s2!.y + s2!.height / 2,
      aim2.x,
      aim2.y,
    );
    await page.waitForTimeout(300);
    const afterOk = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.hp,
    );
    expect(afterOk, "restored strip must accept the attack").toBeLessThan(
      beforeOk,
    );
    console.log(
      `SABOTAGE_PASS_PROOF: attack with restored ::before hit → HP dropped (${beforeOk}→${afterOk})`,
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
          localStorage.setItem("svwb.activeOnBottom", "1");
          window.__svwbTest!.render();
          // Layout swap selector is active-on-bottom.active-second; keep
          // state.activePlayer=first so the attack stays legal.
          document.body.classList.add("active-on-bottom", "active-second");
          document.body.classList.remove("active-first");
        });
      } else {
        await page.evaluate(() => {
          localStorage.setItem("svwb.activeOnBottom", "0");
          window.__svwbTest!.render();
        });
      }
      const before = await page.evaluate(
        () => window.__svwbTest!.getState().players.second.hp,
      );
      const s = await page.locator("#blueBoard .card").first().boundingBox();
      const aim = await page.evaluate((flipped) => {
        const strip = document.getElementById("redLeader")!;
        const root = getComputedStyle(document.documentElement);
        const pad = parseFloat(
          root.getPropertyValue("--leader-attack-hit-pad"),
        );
        const gapOut = parseFloat(
          root.getPropertyValue("--leader-attack-gap-outset"),
        );
        const r = strip.getBoundingClientRect();
        // Default red: hit above strip bottom. Flipped red (bottom): hit below strip top.
        if (flipped) {
          const hitBottom = r.top + r.height + pad + gapOut;
          return { x: r.x + r.width / 2, y: (r.top + hitBottom) / 2 };
        }
        const hitTop = r.bottom - (r.height + pad + gapOut);
        return { x: r.x + r.width / 2, y: (hitTop + r.bottom) / 2 };
      }, flipped);
      expect(s).toBeTruthy();
      await cdpTouchDrag(
        page,
        s!.x + s!.width / 2,
        s!.y + s!.height / 2,
        aim.x,
        aim.y,
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
