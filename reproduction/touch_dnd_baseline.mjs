/**
 * Reproduce tablet layout + HTML5 DnD touch failure baseline.
 * Launch: node reproduction/touch_dnd_baseline.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";
const CHROME = "/opt/google/chrome/chrome";
const FILLER_ID = "10001110";

const VIEWPORTS = [
  { name: "1024x768", width: 1024, height: 768 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "1366x1024", width: 1366, height: 1024 },
];

async function seedHand(page) {
  await page.evaluate(async (fillerId) => {
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

    state.players.first.hand = [0, 1, 2, 3].map((i) => {
      const tpl = getCardById(fillerId);
      return {
        ...tpl,
        uid: `hand_${i}_${fillerId}`,
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
    });
    render();
  }, FILLER_ID);
  await page.waitForSelector("#blueHand .card");
}

async function measureLayout(page, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const shell = await page.evaluate(() => {
    const body = document.body;
    const shellEl =
      document.querySelector(".game-shell") ||
      document.querySelector("#app") ||
      document.documentElement;
    const rect = (shellEl || body).getBoundingClientRect();
    const hand = document.getElementById("blueHand");
    const cards = [...(hand?.querySelectorAll(".card") ?? [])];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const cardsInside = cards.map((c) => {
      const r = c.getBoundingClientRect();
      const inside =
        r.top >= 0 && r.left >= 0 && r.bottom <= vh + 1 && r.right <= vw + 1;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitTestable = !!(hit && (hit === c || c.contains(hit)));
      return { inside, hitTestable, top: r.top, bottom: r.bottom };
    });
    return {
      shellHeight: Math.round(rect.height || vh),
      viewportH: vh,
      cardsInside,
      allInside: cardsInside.every((c) => c.inside),
      allHit: cardsInside.every((c) => c.hitTestable),
      cardCount: cards.length,
    };
  });
  return shell;
}

async function touchDragPlayAttempt(context, page) {
  const events = [];
  await page.evaluate(() => {
    window.__touchEvents = [];
    const types = [
      "touchstart",
      "touchmove",
      "touchend",
      "dragstart",
      "drag",
      "dragover",
      "drop",
      "dragend",
    ];
    for (const t of types) {
      document.addEventListener(
        t,
        (e) => {
          window.__touchEvents.push(t);
        },
        true,
      );
    }
  });

  const from = await page.locator("#blueHand .card").first().boundingBox();
  const to = await page.locator("#blueBoard").boundingBox();
  if (!from || !to) throw new Error("missing boxes");

  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;

  const cdp = await context.newCDPSession(page);
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
  await page.waitForTimeout(300);

  const result = await page.evaluate(async () => {
    const { state } = await import("/src/core/gameState.ts");
    return {
      events: window.__touchEvents,
      hand: state.players.first.hand.length,
      board: state.players.first.board.length,
      pp: state.players.first.pp,
    };
  });
  return result;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });

  console.log("=== LAYOUT BASELINE ===");
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await seedHand(page);
    const layout = await measureLayout(page, vp);
    console.log(
      `${vp.name}: shell=${layout.shellHeight}px (vh=${layout.viewportH}) ` +
        `cards=${layout.cardCount} allInside=${layout.allInside} allHit=${layout.allHit}`,
    );
    await context.close();
  }

  console.log("\n=== TOUCH DRAG → BOARD (CDP) ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await seedHand(page);
    const touch = await touchDragPlayAttempt(context, page);
    console.log("events:", JSON.stringify(touch.events));
    console.log(
      `hand=${touch.hand} board=${touch.board} pp=${touch.pp} ` +
        `(play succeeded=${touch.board >= 1 && touch.hand < 4})`,
    );
    await context.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
