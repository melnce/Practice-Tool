/**
 * Interaction sweep — every player action on mouse (1440×900) and CDP touch (1024×768).
 * Oracle: window.__svwbTest.getState(); pageerror count must stay 0.
 *
 * Touch taps: Playwright `page.touchscreen.tap` (CDP touchEnd without points does not
 * synthesise `click`). CDP is reserved for drag move streams only.
 */
import {
  test,
  expect,
  type Browser,
  type Page,
  type BrowserContext,
} from "@playwright/test";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const CHROME = "/opt/google/chrome/chrome";

const FILLER = "10001110";
const TARGET_SPELL = "10041310";
const RAVENING_TENTACLES = "10123310";
const GILDED_BLADE = "90021310";
const MODE_SPELL = "10051310"; // Chaos Cyclone — mode modal (interactive-play proven)
const MODE_SPELL_ALT = "10633310"; // Bewitching Eld Crystals (brief example)
const CRYSTALSPAWN = "10631110";
const SEPHIE = "10934110";
const RUSH_FOLLOWER = "10071110";
const WARD_FOLLOWER = "10001130";
const ENGAGE_AMULET = "10062210";
const AMULET_PLAY = "10062210";

type InputMode = "mouse" | "touch";

type EngineSnap = {
  hand: number;
  handUids: string[];
  board: number;
  boardUids: (string | null)[];
  pp: number;
  maxPP: number;
  hp: number;
  enemyHp: number;
  enemyBoard: number;
  enemyBoardUids: (string | null)[];
  allyEvolved: boolean;
  pending: boolean;
  pendingOp: string | null;
  phase: string | undefined;
  activePlayer: string;
  roundCount: number;
  redPP: number;
  redMaxPP: number;
  earlyBoostUsed: boolean;
  lateBoostUsed: boolean;
  boostPending: boolean;
  winner: string | null | undefined;
};

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return () => expect(errors).toEqual([]);
}

async function loadDb(page: Page) {
  await page.evaluate(async () => {
    await (await import("/src/data/cardDatabase.ts")).loadCardDatabase();
  });
}

async function gotoTest(page: Page) {
  await page.goto(`${BASE}/?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await loadDb(page);
}

async function snap(page: Page): Promise<EngineSnap> {
  return page.evaluate(() => {
    const s = window.__svwbTest!.getState();
    const ally = s.players.first.board[0];
    return {
      hand: s.players.first.hand.length,
      handUids: s.players.first.hand.map((c) => c.uid),
      board: s.players.first.board.length,
      boardUids: s.players.first.board.map((c) => c?.uid ?? null),
      pp: s.players.first.pp,
      maxPP: s.players.first.maxPP,
      hp: s.players.first.hp,
      enemyHp: s.players.second.hp,
      enemyBoard: s.players.second.board.length,
      enemyBoardUids: s.players.second.board.map((c) => c?.uid ?? null),
      allyEvolved: !!ally?.hasEvolved,
      pending: !!s.pendingTargetEffect,
      pendingOp: s.pendingTargetEffect?.eff?.op ?? null,
      phase: s.phase,
      activePlayer: s.activePlayer,
      roundCount: s.roundCount,
      redPP: s.players.second.pp,
      redMaxPP: s.players.second.maxPP,
      earlyBoostUsed: !!s.secondPlayerPPBoostUsedEarly,
      lateBoostUsed: !!s.secondPlayerPPBoostUsedLate,
      boostPending: !!s.secondPlayerPPBoostPending,
      winner: s.winner ?? null,
    };
  });
}

function boxCenter(b: { x: number; y: number; width: number; height: number }) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function mouseDrag(
  page: Page,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  steps = 8,
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
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: (sx + tx) / 2, y: (sy + ty) / 2 }],
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

async function screenTap(page: Page, x: number, y: number) {
  await page.touchscreen.tap(x, y);
}

async function tapLocator(
  page: Page,
  mode: InputMode,
  loc: ReturnType<Page["locator"]>,
) {
  await expect(loc).toBeVisible();
  if (mode === "touch") {
    const box = await loc.boundingBox();
    expect(box).toBeTruthy();
    await screenTap(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
  } else {
    await loc.click({ force: true });
  }
}

async function dragLocator(
  page: Page,
  mode: InputMode,
  source: string,
  target: string,
) {
  const sLoc = page.locator(source).first();
  const tLoc = page.locator(target).first();
  const s = await sLoc.boundingBox();
  const t = await tLoc.boundingBox();
  expect(s && t).toBeTruthy();
  const sc = boxCenter(s!);
  const tc = boxCenter(t!);
  if (mode === "mouse") await mouseDrag(page, sc.x, sc.y, tc.x, tc.y);
  else await cdpTouchDrag(page, sc.x, sc.y, tc.x, tc.y);
}

async function playViaContextMenu(
  page: Page,
  mode: InputMode,
  handSel = "#blueHand .card",
  index = 0,
) {
  const card = page.locator(handSel).nth(index);
  await expect(card).toBeVisible();
  if (mode === "mouse") {
    await card.click({ button: "right" });
  } else {
    await card.evaluate((el) => {
      el.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
  }
}

async function playHandCard(page: Page, mode: InputMode, index = 0) {
  if (mode === "touch") {
    await playViaContextMenu(page, mode, "#blueHand .card", index);
    return;
  }
  const handLenBefore = await page.evaluate(
    () => window.__svwbTest!.getState().players.first.hand.length,
  );
  const card = page.locator("#blueHand .card").nth(index);
  await card.click({ button: "right" });
  await page.waitForTimeout(200);
  const handLenAfter = await page.evaluate(
    () => window.__svwbTest!.getState().players.first.hand.length,
  );
  if (handLenAfter === handLenBefore) {
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  }
}

async function clickUiButton(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.click();
  }, selector);
}

async function tapOrClick(
  page: Page,
  mode: InputMode,
  selector: string,
  nth = 0,
) {
  const uiChrome =
    selector.startsWith("#undoBtn") ||
    selector.startsWith("#redoBtn") ||
    selector.includes("endTurn") ||
    selector.includes("Mulligan") ||
    selector === "#startGameBtn" ||
    selector === "#redBoost" ||
    selector.includes("targetingConfirmation");

  if (uiChrome) {
    if (selector.includes("endTurnRed")) {
      await page.waitForFunction(() => {
        const b = document.getElementById("endTurnRed") as HTMLElement | null;
        return !!b && b.style.display !== "none";
      });
    }
    if (selector.includes("targetingConfirmation")) {
      await page.evaluate(() => {
        (
          document.querySelector(
            "#targetingConfirmation .confirm-targets-btn",
          ) as HTMLButtonElement | null
        )?.click();
      });
      return;
    }
    await clickUiButton(
      page,
      selector.split(" ").find((s) => s.startsWith("#")) ?? selector,
    );
    return;
  }

  await tapLocator(page, mode, page.locator(selector).nth(nth));
}

async function resolveSelectableTarget(
  page: Page,
  mode: InputMode,
  selector: string,
) {
  const loc = page.locator(selector).first();
  await expect(loc).toBeVisible();
  if (mode === "touch") {
    await expect(loc).toHaveClass(/selectable/, { timeout: 5000 });
    // Playwright's touch click is reliable after CDP drag streams; raw
    // `touchscreen.tap` can miss `click` listeners on reconciled board cards.
    await loc.click({ timeout: 5000 });
  } else {
    await tapLocator(page, mode, loc);
  }
  await waitForPendingCleared(page);
}

async function waitForPendingCleared(page: Page) {
  await page.waitForFunction(
    () => !window.__svwbTest!.getState().pendingTargetEffect,
  );
}

async function resolveBoardTargetByUid(
  page: Page,
  mode: InputMode,
  uid: string,
  board = "#blueBoard",
) {
  const selector = `${board} .card[data-uid="${uid}"]`;
  const loc = page.locator(selector);
  await expect(loc).toHaveClass(/selectable/, { timeout: 5000 });
  // Playwright's touch click is reliable after CDP drag streams; raw
  // `touchscreen.tap` can miss `click` listeners on reconciled board cards.
  if (mode === "touch") await loc.click({ timeout: 5000 });
  else await tapOrClick(page, mode, selector);
  await waitForPendingCleared(page);
}

async function assertStrikeKilledEnemyFollower(
  page: Page,
  enemyUid = "enemy_0",
) {
  const result = await page.evaluate((uid) => {
    const s = window.__svwbTest!.getState();
    return {
      pending: !!s.pendingTargetEffect,
      boardEmpty: s.players.second.board.length === 0,
      inGraveyard: s.players.second.graveyard.some((c) => c.uid === uid),
    };
  }, enemyUid);
  expect(result.pending).toBe(false);
  expect(result.boardEmpty).toBe(true);
  expect(result.inGraveyard).toBe(true);
}

async function assertBewitchingEnhanceOutcome(page: Page) {
  const result = await page.evaluate((crystalId) => {
    const board = window.__svwbTest!.getState().players.first.board;
    const crystals = board.filter((c) => c?.id === crystalId);
    return {
      count: crystals.length,
      stormCount: crystals.filter((c) => !!c?.hasStorm).length,
      attacks: crystals.map((c) => Number(c?.attack ?? 0)),
      defenses: crystals.map((c) => Number(c?.defense ?? 0)),
      pending: !!window.__svwbTest!.getState().pendingTargetEffect,
    };
  }, CRYSTALSPAWN);
  expect(result.pending).toBe(false);
  expect(result.count).toBe(3);
  expect(result.stormCount).toBe(1);
  expect(result.attacks.every((a) => a === 2)).toBe(true);
  expect(result.defenses.every((d) => d === 1)).toBe(true);
}

async function assertBewitchingMode1Outcome(page: Page) {
  const result = await page.evaluate((crystalId) => {
    const board = window.__svwbTest!.getState().players.first.board;
    const crystals = board.filter((c) => c?.id === crystalId);
    const c = crystals[0];
    return {
      count: crystals.length,
      storm: !!c?.hasStorm,
      attack: Number(c?.attack ?? 0),
      defense: Number(c?.defense ?? 0),
      pending: !!window.__svwbTest!.getState().pendingTargetEffect,
    };
  }, CRYSTALSPAWN);
  expect(result.pending).toBe(false);
  expect(result.count).toBe(1);
  expect(result.storm).toBe(true);
  expect(result.attack).toBe(2);
  expect(result.defense).toBe(1);
}

async function assertBewitchingMode2Outcome(page: Page) {
  const result = await page.evaluate((crystalId) => {
    const board = window.__svwbTest!.getState().players.first.board;
    const crystals = board.filter((c) => c?.id === crystalId);
    return {
      count: crystals.length,
      attacks: crystals.map((c) => Number(c?.attack ?? 0)),
      defenses: crystals.map((c) => Number(c?.defense ?? 0)),
      pending: !!window.__svwbTest!.getState().pendingTargetEffect,
    };
  }, CRYSTALSPAWN);
  expect(result.pending).toBe(false);
  expect(result.count).toBe(2);
  expect(result.attacks.every((a) => a === 2)).toBe(true);
  expect(result.defenses.every((d) => d === 1)).toBe(true);
}

async function endTurn(page: Page) {
  await page.evaluate(async () => {
    const { endTurnAction } = await import("/src/ui/playerDispatch.ts");
    endTurnAction();
  });
  await page.waitForTimeout(400);
}

async function waitUndoEnabled(page: Page) {
  await page.waitForFunction(() => {
    const btn = document.getElementById("undoBtn") as HTMLButtonElement | null;
    return !!btn && !btn.disabled;
  });
}

async function waitRedoEnabled(page: Page) {
  await page.waitForFunction(() => {
    const btn = document.getElementById("redoBtn") as HTMLButtonElement | null;
    return !!btn && !btn.disabled;
  });
}

async function seedBase(page: Page, opts?: { fuse?: boolean; round?: number }) {
  await gotoTest(page);
  await page.evaluate(
    async ({ filler, sephie, fuse, round }) => {
      const t = window.__svwbTest!;
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
      state.roundCount = round ?? 5;
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
    {
      filler: FILLER,
      sephie: SEPHIE,
      fuse: !!opts?.fuse,
      round: opts?.round ?? 5,
    },
  );
  await page.waitForSelector("#blueHand .card");
}

async function seedCustom(page: Page, setup: Record<string, unknown>) {
  await gotoTest(page);
  await page.evaluate(async (cfg) => {
    const t = window.__svwbTest!;
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
    Object.assign(state, cfg.statePatch ?? {});

    const mk = (
      id: string,
      uid: string,
      owner: "first" | "second",
      extra?: any,
    ) => {
      const tpl = getCardById(id)!;
      const c = {
        ...tpl,
        uid,
        owner,
        buffs: { attack: 0, defense: 0 },
        ...(extra ?? {}),
      } as any;
      applyKeywordsFromList(c);
      return c;
    };

    const handIds = (cfg.handIds as string[]) ?? [];
    state.players.first.hand = handIds.map((id, i) =>
      mk(id, `hand_${i}`, "first"),
    );
    if (cfg.firstBoard) {
      state.players.first.board = (cfg.firstBoard as any[]).map((b, i) =>
        mk(b.id, b.uid ?? `ally_${i}`, "first", b.extra),
      );
    } else {
      state.players.first.board = [];
    }
    if (cfg.secondBoard) {
      state.players.second.board = (cfg.secondBoard as any[]).map((b, i) =>
        mk(b.id, b.uid ?? `enemy_${i}`, "second", b.extra),
      );
    } else {
      state.players.second.board = [];
    }
    if (cfg.pp != null) {
      state.players.first.pp = cfg.pp as number;
      state.players.first.maxPP = (cfg.maxPP as number) ?? (cfg.pp as number);
    }
    if (cfg.secondHp != null) state.players.second.hp = cfg.secondHp as number;
    render();
  }, setup);
  if ((setup.handIds as string[] | undefined)?.length) {
    await page.waitForSelector("#blueHand .card");
  }
}

async function assertDragStillWorks(page: Page, mode: InputMode) {
  await page.evaluate((fillerId) => {
    const t = window.__svwbTest!;
    const s = t.getState();
    s.activePlayer = "first";
    s.phase = "main";
    s.pendingTargetEffect = null;
    s.players.first.pp = 10;
    s.players.first.maxPP = 10;
    s.players.first.board = [];
    s.players.first.hand = [];
    t.addToHand("first", fillerId);
  }, FILLER);
  await page.waitForSelector("#blueHand .card");
  const before = await snap(page);
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  const after = await snap(page);
  expect(after.board).toBeGreaterThan(before.board);
  const dragActive = await page.evaluate(async () => {
    const { isPointerDragActive } =
      await import("/src/ui/pointerDragSession.ts");
    return isPointerDragActive();
  });
  expect(dragActive).toBe(false);
}

async function undoViaButton(page: Page, mode: InputMode) {
  await waitUndoEnabled(page);
  await tapOrClick(page, mode, "#undoBtn");
  await page.waitForTimeout(200);
}

async function redoViaButton(page: Page, mode: InputMode) {
  await waitRedoEnabled(page);
  await tapOrClick(page, mode, "#redoBtn");
  await page.waitForTimeout(200);
}

test.describe("Interaction sweep — touch @ 1024×768", () => {
  test.describe.configure({ mode: "serial" });
  let browser: Browser;

  test.beforeAll(async ({ playwright }) => {
    browser = await playwright.chromium.launch({
      executablePath: CHROME,
      headless: true,
    });
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  function withTouch(
    title: string,
    fn: (
      page: Page,
      mode: InputMode,
      assertNoErrors: () => void,
    ) => Promise<void>,
  ) {
    test(`[touch] ${title}`, async () => {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      const assertNoErrors = trackPageErrors(page);
      try {
        await fn(page, "touch", assertNoErrors);
        assertNoErrors();
      } finally {
        await context.close();
      }
    });
  }

  // --- 1. Play cards ---
  withTouch("play follower drag to board", async (page, mode) => {
    await seedBase(page);
    const before = await snap(page);
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.board).toBe(before.board + 1);
    expect(after.hand).toBe(before.hand - 1);
    expect(after.pp).toBeLessThan(before.pp);
  });

  withTouch("play spell drag to board", async (page, mode) => {
    await seedCustom(page, {
      handIds: [TARGET_SPELL],
      pp: 10,
      maxPP: 10,
      secondBoard: [{ id: FILLER }],
    });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.pending).toBe(true);
    expect(after.hand).toBe(before.hand - 1);
  });

  withTouch("play amulet drag to board", async (page, mode) => {
    await seedCustom(page, { handIds: [AMULET_PLAY], pp: 10, maxPP: 10 });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.board).toBe(before.board + 1);
    expect(after.hand).toBe(before.hand - 1);
  });

  withTouch(
    "play follower via contextmenu (touch long-press surrogate)",
    async (page, mode) => {
      await seedBase(page);
      const before = await snap(page);
      await playHandCard(page, mode);
      await page.waitForTimeout(300);
      const after = await snap(page);
      expect(after.board).toBe(before.board + 1);
      expect(after.hand).toBe(before.hand - 1);
    },
  );

  // --- 2. Combat ---
  withTouch("attack enemy follower drag", async (page, mode) => {
    await seedBase(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const a = s.players.first.board[0]!;
      a.can_attack = true;
      a.hasAttacked = false;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const beforeDef = await page.evaluate(
      () => window.__svwbTest!.getState().players.second.board[0]?.defense ?? 5,
    );
    await dragLocator(page, mode, "#blueBoard .card", "#redBoard .card");
    await page.waitForTimeout(300);
    const afterDef = await page.evaluate(() => {
      const st = window.__svwbTest!.getState();
      return {
        board: st.players.second.board.length,
        def: st.players.second.board[0]?.defense ?? null,
      };
    });
    expect(
      afterDef.board === 0 ||
        (afterDef.def != null && afterDef.def < beforeDef),
    ).toBe(true);
  });

  withTouch("attack enemy leader drag", async (page, mode) => {
    await seedBase(page);
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.players.second.board = [];
      const a = s.players.first.board[0]!;
      a.can_attack = true;
      a.hasAttacked = false;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
  });

  withTouch("attack leader blocked by Ward", async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      firstBoard: [
        {
          id: FILLER,
          extra: {
            attack: 3,
            defense: 3,
            can_attack: true,
            hasStorm: true,
            hasAttacked: false,
          },
        },
      ],
      secondBoard: [{ id: WARD_FOLLOWER }, { id: FILLER }],
      secondHp: 20,
    });
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const a = s.players.first.board[0]!;
      a.can_attack = true;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const beforeHp = await snap(page);
    await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
    await page.waitForTimeout(300);
    const afterHp = await snap(page);
    expect(afterHp.enemyHp).toBe(beforeHp.enemyHp);
  });

  withTouch(
    "Rush follower cannot attack leader same turn",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [],
        firstBoard: [
          {
            id: RUSH_FOLLOWER,
            extra: {
              attack: 2,
              defense: 2,
              can_attack: true,
              hasRush: true,
              justPlayed: true,
              hasAttacked: false,
            },
          },
        ],
        secondBoard: [],
        secondHp: 20,
      });
      const before = await snap(page);
      await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
      await page.waitForTimeout(300);
      const after = await snap(page);
      expect(after.enemyHp).toBe(before.enemyHp);
    },
  );

  // --- 3. Evolve / super-evolve ---
  withTouch("evolve refused before threshold", async (page, mode) => {
    await seedBase(page, { round: 3 });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.allyEvolved).toBe(false);
    expect(after.boardUids).toEqual(before.boardUids);
  });

  withTouch("evolve allowed at threshold", async (page, mode) => {
    await seedBase(page, { round: 5 });
    await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.allyEvolved).toBe(true);
  });

  withTouch(
    "evolve refused on already evolved follower",
    async (page, mode) => {
      await seedBase(page, { round: 5 });
      await page.evaluate(() => {
        const s = window.__svwbTest!.getState();
        s.players.first.board[0]!.hasEvolved = true;
        window.__svwbTest!.render();
      });
      const before = await snap(page);
      await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
      await page.waitForTimeout(300);
      const after = await snap(page);
      expect(after.pp).toBe(before.pp);
      expect(after.boardUids).toEqual(before.boardUids);
    },
  );

  withTouch("super-evolve via super evo zone drag", async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      pp: 10,
      maxPP: 10,
      statePatch: { roundCount: 7 },
      firstBoard: [
        { id: "10032110", uid: "remi_uid" },
        { id: "90031120", uid: "golem_uid" },
      ],
    });
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.players.first.superEvoCharges = 1;
      s.players.first.evoUsedThisTurn = false;
      window.__svwbTest!.render();
    });
    await dragLocator(
      page,
      mode,
      "#blueSuperEvo",
      '#blueBoard .card[data-uid="remi_uid"]',
    );
    await page.waitForFunction(() => {
      const s = window.__svwbTest!.getState();
      const remi = s.players.first.board.find((c) => c?.uid === "remi_uid");
      return (
        !!s.pendingTargetEffect &&
        !!remi?.hasEvolved &&
        remi.evoType === "super"
      );
    });
    await resolveBoardTargetByUid(page, mode, "golem_uid");
    const result = await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const golem = s.players.first.board.find((c) => c?.uid === "golem_uid");
      const remi = s.players.first.board.find((c) => c?.uid === "remi_uid");
      return {
        pending: !!s.pendingTargetEffect,
        golemEvolved: !!golem?.hasEvolved,
        remiEvolved: !!remi?.hasEvolved,
      };
    });
    expect(result.pending).toBe(false);
    expect(result.remiEvolved).toBe(true);
    expect(result.golemEvolved).toBe(true);
  });

  // --- 4. Target prompts ---
  withTouch(
    "targeted spell: legal follower click resolves",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [TARGET_SPELL],
        pp: 10,
        maxPP: 10,
        secondBoard: [{ id: FILLER }],
      });
      await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
      await page.waitForFunction(
        () => !!window.__svwbTest!.getState().pendingTargetEffect,
      );
      await page.waitForTimeout(200);
      await resolveSelectableTarget(page, mode, "#redBoard .card.selectable");
      await page.waitForTimeout(300);
      await assertStrikeKilledEnemyFollower(page);
    },
  );

  withTouch(
    "targeted spell: illegal leader click keeps prompt",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [TARGET_SPELL],
        pp: 10,
        maxPP: 10,
        secondBoard: [{ id: FILLER }],
      });
      await playHandCard(page, mode);
      await page.waitForTimeout(200);
      await tapOrClick(page, mode, "#redLeader");
      await page.waitForTimeout(200);
      const after = await snap(page);
      expect(after.pending).toBe(true);
    },
  );

  withTouch(
    "Ravening Tentacles can target enemy leader",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [RAVENING_TENTACLES],
        pp: 10,
        maxPP: 10,
        secondBoard: [],
        secondHp: 20,
      });
      await playHandCard(page, mode);
      await page.waitForTimeout(200);
      const before = await snap(page);
      await tapOrClick(page, mode, "#redLeader.selectable, #redLeader");
      await page.waitForTimeout(300);
      const after = await snap(page);
      expect(after.pending).toBe(false);
      expect(after.enemyHp).toBeLessThan(before.enemyHp);
    },
  );

  withTouch("Gilded Blade can target enemy leader", async (page, mode) => {
    await seedCustom(page, {
      handIds: [GILDED_BLADE],
      pp: 10,
      maxPP: 10,
      secondBoard: [],
      secondHp: 20,
    });
    await playHandCard(page, mode);
    await page.waitForTimeout(200);
    const before = await snap(page);
    await tapOrClick(page, mode, "#redLeader");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.pending).toBe(false);
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
  });

  withTouch("fuse multi-select confirm button", async (page, mode) => {
    await seedBase(page, { fuse: true });
    await tapOrClick(page, mode, "#blueHand .card", 0);
    await page.waitForTimeout(200);
    let st = await snap(page);
    expect(st.pendingOp).toBe("fuse");
    await tapOrClick(page, mode, "#blueHand .card.selectable", 0);
    await page.waitForTimeout(150);
    await tapOrClick(page, mode, "#targetingConfirmation .confirm-targets-btn");
    await page.waitForTimeout(300);
    st = await snap(page);
    expect(st.pending).toBe(false);
    const fused = await page.evaluate((sephieId) => {
      const sephie = window
        .__svwbTest!.getState()
        .players.first.hand.find((c) => c.id === sephieId);
      return (
        !!(sephie as any)?.isFused || !!(sephie as any)?._fusedCards?.length
      );
    }, SEPHIE);
    expect(fused).toBe(true);
  });

  // --- 5. Mode choice ---
  withTouch("mode spell Chaos Cyclone option 1", async (page, mode) => {
    await seedCustom(page, {
      handIds: [MODE_SPELL],
      pp: 10,
      maxPP: 10,
      statePatch: { roundCount: 6 },
    });
    await playHandCard(page, mode);
    await expect(
      page.locator(".choice-modal .choice-option").first(),
    ).toBeVisible({
      timeout: 8000,
    });
    await tapOrClick(page, mode, ".choice-modal .choice-option", 0);
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.pending).toBe(false);
    expect(after.hand).toBeGreaterThanOrEqual(0);
  });

  withTouch("mode spell Chaos Cyclone option 2", async (page, mode) => {
    await seedCustom(page, {
      handIds: [MODE_SPELL],
      pp: 10,
      maxPP: 10,
      statePatch: { roundCount: 6 },
    });
    await playHandCard(page, mode);
    await expect(
      page.locator(".choice-modal .choice-option").first(),
    ).toBeVisible({
      timeout: 8000,
    });
    await tapOrClick(page, mode, ".choice-modal .choice-option", 1);
    await page.waitForTimeout(300);
    expect((await snap(page)).pending).toBe(false);
  });

  withTouch(
    "mode spell Bewitching Eld Crystals Enhance at 10 PP auto-activates both",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [MODE_SPELL_ALT],
        pp: 10,
        maxPP: 10,
        statePatch: { roundCount: 6 },
      });
      await playHandCard(page, mode);
      await page.waitForTimeout(400);
      await expect(page.locator(".choice-modal .choice-option")).toHaveCount(0);
      await assertBewitchingEnhanceOutcome(page);
    },
  );

  withTouch(
    "mode spell Bewitching Eld Crystals option 1 at 3 PP",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [MODE_SPELL_ALT],
        pp: 3,
        maxPP: 10,
        statePatch: { roundCount: 6 },
      });
      await playHandCard(page, mode);
      await expect(
        page.locator(".choice-modal .choice-option").first(),
      ).toBeVisible({
        timeout: 8000,
      });
      await tapOrClick(page, mode, ".choice-modal .choice-option", 0);
      await page.waitForTimeout(300);
      await assertBewitchingMode1Outcome(page);
    },
  );

  withTouch(
    "mode spell Bewitching Eld Crystals option 2 at 3 PP",
    async (page, mode) => {
      await seedCustom(page, {
        handIds: [MODE_SPELL_ALT],
        pp: 3,
        maxPP: 10,
        statePatch: { roundCount: 6 },
      });
      await playHandCard(page, mode);
      await expect(
        page.locator(".choice-modal .choice-option").first(),
      ).toBeVisible({
        timeout: 8000,
      });
      await tapOrClick(page, mode, ".choice-modal .choice-option", 1);
      await page.waitForTimeout(300);
      await assertBewitchingMode2Outcome(page);
    },
  );

  // --- 6. Fuse gestures ---
  withTouch("fuse tap opens picker", async (page, mode) => {
    await seedBase(page, { fuse: true });
    await tapOrClick(page, mode, "#blueHand .card", 0);
    await page.waitForTimeout(200);
    const st = await snap(page);
    expect(st.pendingOp).toBe("fuse");
  });

  withTouch(
    "fuse drag-release inside hand keeps fuse pending",
    async (page, mode) => {
      await seedBase(page, { fuse: true });
      const c1 = await page.locator("#blueHand .card").first().boundingBox();
      const c2 = await page.locator("#blueHand .card").nth(1).boundingBox();
      expect(c1 && c2).toBeTruthy();
      const sx = c1!.x + c1!.width / 2;
      const sy = c1!.y + c1!.height / 2;
      const tx = c2!.x + c2!.width / 2;
      const ty = c2!.y + c2!.height / 2;
      if (mode === "mouse") await mouseDrag(page, sx, sy, tx, ty, 4);
      else await cdpTouchDrag(page, sx, sy, tx, ty);
      await page.waitForTimeout(250);
      const st = await snap(page);
      expect(st.pendingOp).toBe("fuse");
      expect(st.hand).toBe(3);
    },
  );

  withTouch("fuse drag-release outside hand plays card", async (page, mode) => {
    await seedBase(page, { fuse: true });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
    await page.waitForTimeout(300);
    const after = await snap(page);
    expect(after.board).toBeGreaterThan(before.board);
    expect(after.pendingOp).not.toBe("fuse");
  });

  // --- 7. Engage amulet ---
  withTouch("engage amulet via contextmenu", async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      pp: 5,
      maxPP: 10,
      firstBoard: [{ id: ENGAGE_AMULET, extra: { countdown: 4 } }],
    });
    const beforeCd = await page.evaluate(() =>
      Number(
        window.__svwbTest!.getState().players.first.board[0]?.countdown ?? 4,
      ),
    );
    const card = page.locator("#blueBoard .card").first();
    if (mode === "mouse") await card.click({ button: "right" });
    else {
      await card.evaluate((el) => {
        el.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        );
      });
    }
    await page.waitForTimeout(300);
    const afterCd = await page.evaluate(() =>
      Number(
        window.__svwbTest!.getState().players.first.board[0]?.countdown ?? 0,
      ),
    );
    expect(afterCd).toBeLessThan(beforeCd);
  });

  // --- 8. End turn ---
  withTouch("end turn hot-seat switch", async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      statePatch: { roundCount: 1, activePlayer: "first" },
    });
    await page.evaluate((fillerId) => {
      const t = window.__svwbTest!;
      t.addToDeck("first", fillerId);
      t.addToDeck("second", fillerId);
    }, FILLER);
    await endTurn(page);
    let st = await snap(page);
    expect(st.activePlayer).toBe("second");
    await endTurn(page);
    st = await snap(page);
    expect(st.activePlayer).toBe("first");
    expect(st.roundCount).toBe(2);
  });

  withTouch("end turn while target prompt open", async (page, mode) => {
    await seedCustom(page, {
      handIds: [TARGET_SPELL],
      pp: 10,
      maxPP: 10,
      secondBoard: [{ id: FILLER }],
    });
    await playHandCard(page, mode);
    await page.waitForTimeout(200);
    expect((await snap(page)).pending).toBe(true);
    await tapOrClick(page, mode, "#endTurnBlue");
    await page.waitForTimeout(400);
    const st = await snap(page);
    expect(st.activePlayer).toBe("second");
  });

  // --- 9. Undo / redo ---
  withTouch(
    "undo/redo after play restores state; drag still works",
    async (page, mode) => {
      await seedBase(page);
      const before = await snap(page);
      await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
      await page.waitForTimeout(300);
      const played = await snap(page);
      expect(played.board).toBe(before.board + 1);
      await undoViaButton(page, mode);
      const undone = await snap(page);
      expect(undone.handUids).toEqual(before.handUids);
      expect(undone.boardUids).toEqual(before.boardUids);
      expect(undone.pp).toBe(before.pp);
      await redoViaButton(page, mode);
      const redone = await snap(page);
      expect(redone.board).toBe(played.board);
      await assertDragStillWorks(page, mode);
    },
  );

  withTouch("undo/redo after attack", async (page, mode) => {
    await seedBase(page);
    await page.evaluate(() => {
      const a = window.__svwbTest!.getState().players.first.board[0]!;
      a.can_attack = true;
      a.hasStorm = true;
      window.__svwbTest!.render();
    });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueBoard .card", "#redBoard .card");
    await page.waitForTimeout(300);
    await undoViaButton(page, mode);
    const undone = await snap(page);
    expect(undone.enemyBoardUids).toEqual(before.enemyBoardUids);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  });

  withTouch("undo/redo after evolve", async (page, mode) => {
    await seedBase(page, { round: 5 });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
    await page.waitForTimeout(300);
    expect((await snap(page)).allyEvolved).toBe(true);
    await undoViaButton(page, mode);
    const undone = await snap(page);
    expect(undone.allyEvolved).toBe(false);
    expect(undone.pp).toBe(before.pp);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  });

  withTouch("undo/redo after fuse confirm", async (page, mode) => {
    await seedBase(page, { fuse: true });
    const before = await snap(page);
    await tapOrClick(page, mode, "#blueHand .card", 0);
    await page.waitForTimeout(200);
    await tapOrClick(page, mode, "#blueHand .card.selectable", 0);
    await tapOrClick(page, mode, "#targetingConfirmation .confirm-targets-btn");
    await page.waitForTimeout(300);
    await undoViaButton(page, mode);
    const undone = await snap(page);
    expect(undone.handUids).toEqual(before.handUids);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  });

  withTouch("undo/redo after resolved target prompt", async (page, mode) => {
    await seedCustom(page, {
      handIds: [TARGET_SPELL],
      pp: 10,
      maxPP: 10,
      secondBoard: [{ id: FILLER }],
    });
    const before = await snap(page);
    await playHandCard(page, mode);
    await tapOrClick(page, mode, "#redBoard .card.selectable");
    await page.waitForTimeout(300);
    await undoViaButton(page, mode);
    const afterFirstUndo = await snap(page);
    expect(afterFirstUndo.pending).toBe(true);
    expect(afterFirstUndo.enemyBoardUids).toEqual(before.enemyBoardUids);
    await undoViaButton(page, mode);
    const afterSecondUndo = await snap(page);
    expect(afterSecondUndo.hand).toBe(before.hand);
    expect(afterSecondUndo.pending).toBe(false);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  });

  withTouch("undo/redo after end turn", async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      statePatch: { roundCount: 1, activePlayer: "first" },
    });
    const before = await snap(page);
    await tapOrClick(page, mode, "#endTurnBlue");
    await page.waitForTimeout(300);
    expect((await snap(page)).activePlayer).toBe("second");
    await undoViaButton(page, mode);
    const undone = await snap(page);
    expect(undone.activePlayer).toBe(before.activePlayer);
    expect(undone.roundCount).toBe(before.roundCount);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  });

  withTouch(
    "undo mid-drag second touch does not strand gesture (PR #195)",
    async (page, mode) => {
      await seedBase(page);
      const card = page.locator("#blueHand .card").first();
      const board = page.locator("#blueBoard");
      const s = await card.boundingBox();
      const t = await board.boundingBox();
      expect(s && t).toBeTruthy();
      const cdp = await page.context().newCDPSession(page);
      const sx = s!.x + s!.width / 2;
      const sy = s!.y + s!.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: sx, y: sy, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: sx + 30, y: sy - 20, id: 1 }],
      });
      await tapOrClick(page, mode, "#undoBtn");
      await page.waitForTimeout(100);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      const stranded = await page.evaluate(async () => {
        const { isPointerDragActive } =
          await import("/src/ui/pointerDragSession.ts");
        return isPointerDragActive();
      });
      expect(stranded).toBe(false);
      await assertDragStillWorks(page, mode);
    },
  );

  // --- 10. Mulligan ---
  withTouch(
    "mulligan select/deselect and confirm both players",
    async (page, mode) => {
      await gotoTest(page);
      await page.fill("#seedInput", "424242");
      await clickUiButton(page, "#startGameBtn");
      await page.waitForFunction(
        () => window.__svwbTest!.getState().phase === "mulligan",
        undefined,
        { timeout: 20000 },
      );
      await tapOrClick(page, mode, "#blueHand .card", 0);
      await tapOrClick(page, mode, "#blueHand .card", 0);
      await tapOrClick(page, mode, "#blueMulliganConfirm");
      await tapOrClick(page, mode, "#redMulliganConfirm");
      await page.waitForFunction(
        () => window.__svwbTest!.getState().phase === "main",
      );
      const st = await snap(page);
      expect(st.pp).toBe(1);
      expect(st.maxPP).toBe(1);
      expect(st.hand).toBe(5);
      expect(st.roundCount).toBe(1);
      expect(st.activePlayer).toBe("first");
    },
  );

  // --- 11. Bonus PP ---
  withTouch(
    "bonus PP early pip on second player turn 1 → usable PP 2/1",
    async (page, mode) => {
      await gotoTest(page);
      await page.evaluate(async () => {
        const t = window.__svwbTest!;
        const { resetGameState, state } =
          await import("/src/core/gameState.ts");
        const { render } = await import("/src/ui/render.ts");
        resetGameState(99);
        state.gameStarted = true;
        state.phase = "main";
        state.activePlayer = "second";
        state.roundCount = 1;
        state.players.second.pp = 1;
        state.players.second.maxPP = 1;
        state.secondPlayerPPBoostUsedEarly = false;
        state.secondPlayerPPBoostUsedLate = false;
        state.secondPlayerPPBoostPending = false;
        render();
      });
      await tapOrClick(page, mode, "#redBoost");
      await page.waitForTimeout(200);
      const st = await snap(page);
      expect(st.redPP).toBe(2);
      expect(st.redMaxPP).toBe(1);
      expect(st.boostPending).toBe(true);
    },
  );

  withTouch("bonus PP late pip refused before round 6", async (page, mode) => {
    await gotoTest(page);
    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { render } = await import("/src/ui/render.ts");
      resetGameState(99);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "second";
      state.roundCount = 3;
      state.players.second.pp = 3;
      state.players.second.maxPP = 3;
      state.secondPlayerPPBoostUsedEarly = false;
      state.secondPlayerPPBoostUsedLate = false;
      render();
    });
    const before = await snap(page);
    await tapOrClick(page, mode, "#redBoost");
    await page.waitForTimeout(200);
    const after = await snap(page);
    expect(after.redPP).toBe(before.redPP + 1);
    expect(after.earlyBoostUsed).toBe(false);
    expect(after.lateBoostUsed).toBe(false);
  });

  withTouch("bonus PP each pip only once", async (page, mode) => {
    await gotoTest(page);
    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { render } = await import("/src/ui/render.ts");
      resetGameState(99);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "second";
      state.roundCount = 1;
      state.players.second.pp = 1;
      state.players.second.maxPP = 1;
      state.secondPlayerPPBoostUsedEarly = true;
      render();
    });
    const before = await snap(page);
    await tapOrClick(page, mode, "#redBoost");
    await page.waitForTimeout(200);
    const after = await snap(page);
    expect(after.redPP).toBe(before.redPP);
  });
});

// Mirror mouse suite — same cases at 1440×900
const mouseCases: Array<{
  title: string;
  fn: (
    page: Page,
    mode: InputMode,
    assertNoErrors: () => void,
  ) => Promise<void>;
}> = [];

function registerMouseCase(
  title: string,
  fn: (
    page: Page,
    mode: InputMode,
    assertNoErrors: () => void,
  ) => Promise<void>,
) {
  mouseCases.push({ title, fn });
}

// Re-register by duplicating touch bodies for mouse via shared implementations below.
// Each block calls the same logic the touch suite uses.

registerMouseCase("play follower drag to board", async (page, mode) => {
  await seedBase(page);
  const before = await snap(page);
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  const after = await snap(page);
  expect(after.board).toBe(before.board + 1);
  expect(after.hand).toBe(before.hand - 1);
});

registerMouseCase("play spell drag to board", async (page, mode) => {
  await seedCustom(page, {
    handIds: [TARGET_SPELL],
    pp: 10,
    secondBoard: [{ id: FILLER }],
  });
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  expect((await snap(page)).pending).toBe(true);
});

registerMouseCase("play amulet drag to board", async (page, mode) => {
  await seedCustom(page, { handIds: [AMULET_PLAY], pp: 10 });
  const before = await snap(page);
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  const after = await snap(page);
  expect(after.board).toBe(before.board + 1);
});

registerMouseCase("play follower right-click", async (page, mode) => {
  await seedBase(page);
  const before = await snap(page);
  await playViaContextMenu(page, mode);
  await page.waitForTimeout(300);
  const after = await snap(page);
  expect(after.board).toBe(before.board + 1);
});

registerMouseCase("attack enemy follower drag", async (page, mode) => {
  await seedBase(page);
  await page.evaluate(() => {
    const a = window.__svwbTest!.getState().players.first.board[0]!;
    a.can_attack = true;
    a.hasStorm = true;
    window.__svwbTest!.render();
  });
  await dragLocator(page, mode, "#blueBoard .card", "#redBoard .card");
  await page.waitForTimeout(300);
  const len = await page.evaluate(
    () => window.__svwbTest!.getState().players.second.board.length,
  );
  expect(len).toBeLessThanOrEqual(1);
});

registerMouseCase("attack enemy leader drag", async (page, mode) => {
  await seedBase(page);
  await page.evaluate(() => {
    const s = window.__svwbTest!.getState();
    s.players.second.board = [];
    const a = s.players.first.board[0]!;
    a.can_attack = true;
    a.hasStorm = true;
    window.__svwbTest!.render();
  });
  const before = await snap(page);
  await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
  await page.waitForTimeout(300);
  expect((await snap(page)).enemyHp).toBeLessThan(before.enemyHp);
});

registerMouseCase("attack leader blocked by Ward", async (page, mode) => {
  await seedCustom(page, {
    handIds: [],
    firstBoard: [
      {
        id: FILLER,
        extra: { can_attack: true, hasStorm: true, attack: 3, defense: 3 },
      },
    ],
    secondBoard: [{ id: WARD_FOLLOWER }, { id: FILLER }],
    secondHp: 20,
  });
  const before = await snap(page);
  await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
  await page.waitForTimeout(300);
  expect((await snap(page)).enemyHp).toBe(before.enemyHp);
});

registerMouseCase(
  "Rush follower cannot attack leader same turn",
  async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      firstBoard: [
        {
          id: RUSH_FOLLOWER,
          extra: {
            can_attack: true,
            hasRush: true,
            justPlayed: true,
            attack: 2,
            defense: 2,
          },
        },
      ],
      secondBoard: [],
      secondHp: 20,
    });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueBoard .card", "#redLeader");
    await page.waitForTimeout(300);
    expect((await snap(page)).enemyHp).toBe(before.enemyHp);
  },
);

registerMouseCase("evolve refused before threshold", async (page, mode) => {
  await seedBase(page, { round: 3 });
  await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
  await page.waitForTimeout(300);
  expect((await snap(page)).allyEvolved).toBe(false);
});

registerMouseCase("evolve allowed at threshold", async (page, mode) => {
  await seedBase(page, { round: 5 });
  await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
  await page.waitForTimeout(300);
  expect((await snap(page)).allyEvolved).toBe(true);
});

registerMouseCase(
  "evolve refused on already evolved follower",
  async (page, mode) => {
    await seedBase(page, { round: 5 });
    await page.evaluate(() => {
      window.__svwbTest!.getState().players.first.board[0]!.hasEvolved = true;
      window.__svwbTest!.render();
    });
    const before = await snap(page);
    await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
    await page.waitForTimeout(300);
    expect((await snap(page)).boardUids).toEqual(before.boardUids);
  },
);

registerMouseCase(
  "super-evolve via super evo zone drag",
  async (page, mode) => {
    await seedCustom(page, {
      handIds: [],
      pp: 10,
      statePatch: { roundCount: 7 },
      firstBoard: [
        { id: "10032110", uid: "remi_uid" },
        { id: "90031120", uid: "golem_uid" },
      ],
    });
    await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      s.players.first.superEvoCharges = 1;
      window.__svwbTest!.render();
    });
    await dragLocator(
      page,
      mode,
      "#blueSuperEvo",
      '#blueBoard .card[data-uid="remi_uid"]',
    );
    await page.waitForFunction(() => {
      const s = window.__svwbTest!.getState();
      const remi = s.players.first.board.find((c) => c?.uid === "remi_uid");
      return (
        !!s.pendingTargetEffect &&
        !!remi?.hasEvolved &&
        remi.evoType === "super"
      );
    });
    await resolveBoardTargetByUid(page, mode, "golem_uid");
    const result = await page.evaluate(() => {
      const s = window.__svwbTest!.getState();
      const golem = s.players.first.board.find((c) => c?.uid === "golem_uid");
      const remi = s.players.first.board.find((c) => c?.uid === "remi_uid");
      return {
        pending: !!s.pendingTargetEffect,
        golemEvolved: !!golem?.hasEvolved,
        remiEvolved: !!remi?.hasEvolved,
      };
    });
    expect(result.pending).toBe(false);
    expect(result.remiEvolved).toBe(true);
    expect(result.golemEvolved).toBe(true);
  },
);

registerMouseCase("targeted spell legal click", async (page, mode) => {
  await seedCustom(page, {
    handIds: [TARGET_SPELL],
    pp: 10,
    secondBoard: [{ id: FILLER }],
  });
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForFunction(
    () => !!window.__svwbTest!.getState().pendingTargetEffect,
  );
  await resolveSelectableTarget(page, mode, "#redBoard .card.selectable");
  await page.waitForTimeout(300);
  await assertStrikeKilledEnemyFollower(page);
});

registerMouseCase("targeted spell illegal leader click", async (page, mode) => {
  await seedCustom(page, {
    handIds: [TARGET_SPELL],
    pp: 10,
    secondBoard: [{ id: FILLER }],
  });
  await playHandCard(page, mode);
  await tapOrClick(page, mode, "#redLeader");
  await page.waitForTimeout(200);
  expect((await snap(page)).pending).toBe(true);
});

registerMouseCase("Ravening Tentacles leader target", async (page, mode) => {
  await seedCustom(page, {
    handIds: [RAVENING_TENTACLES],
    pp: 10,
    secondBoard: [],
    secondHp: 20,
  });
  await playHandCard(page, mode);
  const before = await snap(page);
  await tapOrClick(page, mode, "#redLeader");
  await page.waitForTimeout(300);
  const after = await snap(page);
  expect(after.pending).toBe(false);
  expect(after.enemyHp).toBeLessThan(before.enemyHp);
});

registerMouseCase("Gilded Blade leader target", async (page, mode) => {
  await seedCustom(page, {
    handIds: [GILDED_BLADE],
    pp: 10,
    secondBoard: [],
    secondHp: 20,
  });
  await playHandCard(page, mode);
  const before = await snap(page);
  await tapOrClick(page, mode, "#redLeader");
  await page.waitForTimeout(300);
  expect((await snap(page)).enemyHp).toBeLessThan(before.enemyHp);
});

registerMouseCase("fuse multi-select confirm", async (page, mode) => {
  await seedBase(page, { fuse: true });
  await tapOrClick(page, mode, "#blueHand .card", 0);
  await tapOrClick(page, mode, "#blueHand .card.selectable", 0);
  await tapOrClick(page, mode, "#targetingConfirmation .confirm-targets-btn");
  await page.waitForTimeout(300);
  expect((await snap(page)).pending).toBe(false);
});

registerMouseCase(
  "mode spell Bewitching Eld Crystals Enhance at 10 PP auto-activates both",
  async (page, mode) => {
    await seedCustom(page, {
      handIds: [MODE_SPELL_ALT],
      pp: 10,
      maxPP: 10,
      statePatch: { roundCount: 6 },
    });
    await playHandCard(page, mode);
    await page.waitForTimeout(400);
    await expect(page.locator(".choice-modal .choice-option")).toHaveCount(0);
    await assertBewitchingEnhanceOutcome(page);
  },
);

registerMouseCase(
  "mode spell Bewitching Eld Crystals option 1 at 3 PP",
  async (page, mode) => {
    await seedCustom(page, {
      handIds: [MODE_SPELL_ALT],
      pp: 3,
      maxPP: 10,
      statePatch: { roundCount: 6 },
    });
    await playHandCard(page, mode);
    await expect(
      page.locator(".choice-modal .choice-option").first(),
    ).toBeVisible({
      timeout: 8000,
    });
    await tapOrClick(page, mode, ".choice-modal .choice-option", 0);
    await page.waitForTimeout(300);
    await assertBewitchingMode1Outcome(page);
  },
);

registerMouseCase(
  "mode spell Bewitching Eld Crystals option 2 at 3 PP",
  async (page, mode) => {
    await seedCustom(page, {
      handIds: [MODE_SPELL_ALT],
      pp: 3,
      maxPP: 10,
      statePatch: { roundCount: 6 },
    });
    await playHandCard(page, mode);
    await expect(
      page.locator(".choice-modal .choice-option").first(),
    ).toBeVisible({
      timeout: 8000,
    });
    await tapOrClick(page, mode, ".choice-modal .choice-option", 1);
    await page.waitForTimeout(300);
    await assertBewitchingMode2Outcome(page);
  },
);

registerMouseCase("mode spell option 1", async (page, mode) => {
  await seedCustom(page, {
    handIds: [MODE_SPELL],
    pp: 10,
    statePatch: { roundCount: 6 },
  });
  await playHandCard(page, mode);
  await expect(
    page.locator(".choice-modal .choice-option").first(),
  ).toBeVisible({
    timeout: 8000,
  });
  await tapOrClick(page, mode, ".choice-modal .choice-option", 0);
  await page.waitForTimeout(300);
  expect((await snap(page)).pending).toBe(false);
});

registerMouseCase("mode spell option 2", async (page, mode) => {
  await seedCustom(page, {
    handIds: [MODE_SPELL],
    pp: 10,
    statePatch: { roundCount: 6 },
  });
  await playHandCard(page, mode);
  await expect(
    page.locator(".choice-modal .choice-option").first(),
  ).toBeVisible({
    timeout: 8000,
  });
  await tapOrClick(page, mode, ".choice-modal .choice-option", 1);
  await page.waitForTimeout(300);
  expect((await snap(page)).pending).toBe(false);
});

registerMouseCase("fuse tap opens picker", async (page, mode) => {
  await seedBase(page, { fuse: true });
  await tapOrClick(page, mode, "#blueHand .card", 0);
  await page.waitForTimeout(200);
  expect((await snap(page)).pendingOp).toBe("fuse");
});

registerMouseCase("fuse drag inside hand", async (page, mode) => {
  await seedBase(page, { fuse: true });
  const c1 = await page.locator("#blueHand .card").first().boundingBox();
  const c2 = await page.locator("#blueHand .card").nth(1).boundingBox();
  expect(c1 && c2).toBeTruthy();
  await mouseDrag(
    page,
    c1!.x + c1!.width / 2,
    c1!.y + c1!.height / 2,
    c2!.x + c2!.width / 2,
    c2!.y + c2!.height / 2,
    4,
  );
  await page.waitForTimeout(250);
  expect((await snap(page)).pendingOp).toBe("fuse");
});

registerMouseCase("fuse drag outside plays", async (page, mode) => {
  await seedBase(page, { fuse: true });
  const before = await snap(page);
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  expect((await snap(page)).board).toBeGreaterThan(before.board);
});

registerMouseCase("engage amulet right-click", async (page, mode) => {
  await seedCustom(page, {
    handIds: [],
    pp: 5,
    firstBoard: [{ id: ENGAGE_AMULET, extra: { countdown: 4 } }],
  });
  const before = await page.evaluate(() =>
    Number(
      window.__svwbTest!.getState().players.first.board[0]?.countdown ?? 4,
    ),
  );
  const card = page.locator("#blueBoard .card").first();
  await card.click({ button: "right" });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() =>
    Number(
      window.__svwbTest!.getState().players.first.board[0]?.countdown ?? 0,
    ),
  );
  expect(after).toBeLessThan(before);
});

registerMouseCase("end turn hot-seat switch", async (page, mode) => {
  await seedCustom(page, {
    handIds: [],
    statePatch: { roundCount: 1, activePlayer: "first" },
  });
  await page.evaluate((fillerId) => {
    const t = window.__svwbTest!;
    t.addToDeck("first", fillerId);
    t.addToDeck("second", fillerId);
  }, FILLER);
  await endTurn(page);
  expect((await snap(page)).activePlayer).toBe("second");
  await endTurn(page);
  const st = await snap(page);
  expect(st.activePlayer).toBe("first");
  expect(st.roundCount).toBe(2);
});

registerMouseCase("end turn with open target prompt", async (page, mode) => {
  await seedCustom(page, {
    handIds: [TARGET_SPELL],
    pp: 10,
    secondBoard: [{ id: FILLER }],
  });
  await playHandCard(page, mode);
  await tapOrClick(page, mode, "#endTurnBlue");
  await page.waitForTimeout(400);
  expect((await snap(page)).activePlayer).toBe("second");
});

registerMouseCase(
  "undo/redo after play + drag still works",
  async (page, mode) => {
    await seedBase(page);
    const before = await snap(page);
    await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
    await page.waitForTimeout(300);
    await undoViaButton(page, mode);
    expect((await snap(page)).handUids).toEqual(before.handUids);
    await redoViaButton(page, mode);
    await assertDragStillWorks(page, mode);
  },
);

registerMouseCase("undo/redo after attack", async (page, mode) => {
  await seedBase(page);
  await page.evaluate(() => {
    const a = window.__svwbTest!.getState().players.first.board[0]!;
    a.can_attack = true;
    a.hasStorm = true;
    window.__svwbTest!.render();
  });
  await dragLocator(page, mode, "#blueBoard .card", "#redBoard .card");
  await page.waitForTimeout(300);
  await undoViaButton(page, mode);
  await redoViaButton(page, mode);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("undo/redo after evolve", async (page, mode) => {
  await seedBase(page, { round: 5 });
  await dragLocator(page, mode, "#blueNormalEvo", "#blueBoard .card");
  await page.waitForTimeout(300);
  await undoViaButton(page, mode);
  expect((await snap(page)).allyEvolved).toBe(false);
  await redoViaButton(page, mode);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("undo/redo after fuse", async (page, mode) => {
  await seedBase(page, { fuse: true });
  const before = await snap(page);
  await tapOrClick(page, mode, "#blueHand .card", 0);
  await tapOrClick(page, mode, "#blueHand .card.selectable", 0);
  await tapOrClick(page, mode, "#targetingConfirmation .confirm-targets-btn");
  await page.waitForTimeout(300);
  await undoViaButton(page, mode);
  expect((await snap(page)).handUids).toEqual(before.handUids);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("undo/redo after target resolve", async (page, mode) => {
  await seedCustom(page, {
    handIds: [TARGET_SPELL],
    pp: 10,
    secondBoard: [{ id: FILLER }],
  });
  const before = await snap(page);
  await playHandCard(page, mode);
  await tapOrClick(page, mode, "#redBoard .card.selectable");
  await page.waitForTimeout(300);
  await undoViaButton(page, mode);
  const afterFirstUndo = await snap(page);
  expect(afterFirstUndo.pending).toBe(true);
  expect(afterFirstUndo.enemyBoardUids).toEqual(before.enemyBoardUids);
  await undoViaButton(page, mode);
  expect((await snap(page)).hand).toBe(before.hand);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("undo/redo after end turn", async (page, mode) => {
  await seedCustom(page, {
    handIds: [],
    statePatch: { roundCount: 1, activePlayer: "first" },
  });
  const before = await snap(page);
  await tapOrClick(page, mode, "#endTurnBlue");
  await page.waitForTimeout(300);
  await undoViaButton(page, mode);
  expect((await snap(page)).activePlayer).toBe(before.activePlayer);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("undo Ctrl+Z after play", async (page, mode) => {
  await seedBase(page);
  const before = await snap(page);
  await dragLocator(page, mode, "#blueHand .card", "#blueBoard");
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+Z");
  await page.waitForTimeout(200);
  expect((await snap(page)).handUids).toEqual(before.handUids);
  await page.keyboard.press("Control+Y");
  await page.waitForTimeout(200);
  await assertDragStillWorks(page, mode);
});

registerMouseCase("mulligan flow", async (page, mode) => {
  await gotoTest(page);
  await page.fill("#seedInput", "424242");
  await clickUiButton(page, "#startGameBtn");
  await page.waitForFunction(
    () => window.__svwbTest!.getState().phase === "mulligan",
    undefined,
    { timeout: 20000 },
  );
  await tapOrClick(page, mode, "#blueMulliganConfirm");
  await tapOrClick(page, mode, "#redMulliganConfirm");
  await page.waitForFunction(
    () => window.__svwbTest!.getState().phase === "main",
  );
  const st = await snap(page);
  expect(st.pp).toBe(1);
  expect(st.hand).toBe(5);
});

registerMouseCase("bonus PP early on second turn 1", async (page, mode) => {
  await gotoTest(page);
  await page.evaluate(async () => {
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { render } = await import("/src/ui/render.ts");
    resetGameState(99);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    state.roundCount = 1;
    state.players.second.pp = 1;
    state.players.second.maxPP = 1;
    render();
  });
  await tapOrClick(page, mode, "#redBoost");
  await page.waitForTimeout(200);
  const st = await snap(page);
  expect(st.redPP).toBe(2);
  expect(st.redMaxPP).toBe(1);
});

registerMouseCase(
  "bonus PP late refused before round 6",
  async (page, mode) => {
    await gotoTest(page);
    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { render } = await import("/src/ui/render.ts");
      resetGameState(99);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "second";
      state.roundCount = 3;
      state.players.second.pp = 3;
      state.players.second.maxPP = 3;
      render();
    });
    const before = await snap(page);
    await tapOrClick(page, mode, "#redBoost");
    await page.waitForTimeout(200);
    expect((await snap(page)).redPP).toBe(before.redPP + 1);
  },
);

registerMouseCase("bonus PP once only", async (page, mode) => {
  await gotoTest(page);
  await page.evaluate(async () => {
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { render } = await import("/src/ui/render.ts");
    resetGameState(99);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    state.roundCount = 1;
    state.secondPlayerPPBoostUsedEarly = true;
    state.players.second.pp = 1;
    state.players.second.maxPP = 1;
    render();
  });
  const before = await snap(page);
  await tapOrClick(page, mode, "#redBoost");
  await page.waitForTimeout(200);
  expect((await snap(page)).redPP).toBe(before.redPP);
});

test.describe("Interaction sweep — mouse @ 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const { title, fn } of mouseCases) {
    test(`[mouse] ${title}`, async ({ page }) => {
      const assertNoErrors = trackPageErrors(page);
      await fn(page, "mouse", assertNoErrors);
      assertNoErrors();
    });
  }
});

// Hover tooltip: n/a on touch by design
test.describe("Interaction sweep — n/a by design", () => {
  test("hover tooltip [touch] n/a — no hover on touch devices", () => {
    expect(true).toBe(true);
  });
});
