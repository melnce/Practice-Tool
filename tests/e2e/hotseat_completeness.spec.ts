/**
 * Browser verification for hot-seat completeness (reports/hotseat-browser.txt).
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { SvwbPage } from "./qa/pageObject.js";
import blueFund from "./qa/decks/fundamentals-blue.json" with { type: "json" };
import redFund from "./qa/decks/fundamentals-red.json" with { type: "json" };

const REPORT = path.join("reports", "hotseat-browser.txt");
const lines: string[] = [];
function log(msg: string) {
  lines.push(msg);
  console.log(msg);
}

test.afterAll(() => {
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(REPORT, lines.join("\n") + "\n");
});

test("hot-seat completeness browser verification", async ({ page }) => {
  const po = new SvwbPage(page);
  const base = process.env.PW_BASE_URL ?? "http://localhost:5173";
  await page.goto(`${base}/?test=1`);
  await page.waitForFunction(() => !!(window as any).__svwbTest);
  await po.loadDb();
  await po.seedRng(88001);
  await po.loadDecks(blueFund as any, redFund as any);

  await po.enableGodMode();

  await page.evaluate(() => {
    const s = (window as any).gameState;
    s.phase = "main";
    s.gameStarted = true;
    (window as any).__svwbTest.render();
  });

  // --- 4: active side body class ---
  await po.god({ advanceToTurn: { round: 3, activePlayer: "first" } });
  await expect(page.locator("body")).toHaveClass(/active-first/);
  log("4 PASS: body has active-first on first player's turn");

  await po.god({ advanceToTurn: { round: 3, activePlayer: "second" } });
  await expect(page.locator("body")).toHaveClass(/active-second/);
  log("4 PASS: body has active-second on second player's turn");

  // --- 8: Bonus PP pips ---
  await expect(page.locator("#boostPipEarly")).toBeVisible();
  await expect(page.locator("#boostPipLate")).toBeVisible();
  log("8 PASS: early/late boost pips visible");

  // --- 6: God mode targets active player ---
  await po.god({
    advanceToTurn: { round: 4, activePlayer: "second" },
    setPP: [{ player: "second", pp: 3, maxPP: 10 }],
  });
  await expect(page.locator("#blueGodMode")).toBeVisible();
  await expect(page.locator(".god-target-label")).toContainText("Red");
  await page.locator("#godPlus").click();
  expect(
    await page.evaluate(() => (window as any).gameState.players.second.pp),
  ).toBe(4);
  log("6 PASS: god +PP hit active second (3→4); panel shows Red target");

  // --- 3: off-turn hand not pointer-draggable ---
  await po.god({
    advanceToTurn: { round: 4, activePlayer: "second" },
    addToHand: [{ player: "first", cardId: "10001110" }],
  });
  const blueDraggable = await page
    .locator("#blueHand .card")
    .first()
    .getAttribute("data-pointer-draggable");
  expect(blueDraggable).toBe("false");
  log("3 PASS: off-turn blue hand card data-pointer-draggable=false");

  // --- 7: tooltip owner for blue hand is first (Rally counter) ---
  const tipOwner = await page.evaluate(() => {
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    s.players.first.hand = [];
    t.addToHand("first", "10224110", 1); // Gildaria — Rally (20)
    t.advanceToTurn(5, "first");
    s.players.first.rally = 7;
    s.players.second.rally = 2;
    t.render();
    const card = document.querySelector("#blueHand .card") as HTMLElement;
    card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const tip = document.getElementById("cardTooltip");
    const side = tip?.querySelector(".rally-line")?.getAttribute("data-side");
    const val = tip?.querySelector(".rally-value")?.textContent;
    return {
      display: tip?.style.display,
      side,
      val,
      rallyFirst: s.players.first.rally,
    };
  });
  expect(tipOwner.display).toBe("block");
  expect(tipOwner.side).toBe("first");
  expect(tipOwner.rallyFirst).toBe(7);
  // Initial markup seeds "0 / N"; live RAF updates require :hover. The bug was
  // data-side always "second" — asserting side=first is the completeness fix.
  log(
    `7 PASS: blue Rally tooltip data-side=first (first.rally=${tipOwner.rallyFirst}; initial val=${tipOwner.val})`,
  );

  // Extra: verify counts fallback uses blue prefix (not includes first)
  await expect(page.locator("#blueHandCount")).toBeVisible();
  log("7 PASS: counts bind to #blueHandCount (blue-prefixed ids)");

  // --- 2: attack ownership engine ---
  const attackGuard = await page.evaluate(async () => {
    const { attackLeader } = await import("/src/logic/core/combat.ts");
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    t.advanceToTurn(6, "second");
    s.players.first.board.length = 0;
    t.summonToBoard("first", "10021110", true);
    s.players.second.hp = 20;
    const blocked = attackLeader(0, "first", "second");
    const hpAfterBlock = s.players.second.hp;
    t.advanceToTurn(6, "first");
    const atk = s.players.first.board[0];
    atk.can_attack = true;
    atk.attacks_left = 1;
    atk.justPlayed = false;
    atk.hasStorm = true;
    atk.hasAttacked = false;
    const ok = attackLeader(0, "first", "second");
    return { blocked, hpAfterBlock, ok, hpAfterOk: s.players.second.hp };
  });
  expect(attackGuard.blocked).toEqual({
    kind: "blocked",
    reason: "Not your turn",
  });
  expect(attackGuard.hpAfterBlock).toBe(20);
  expect(attackGuard.ok.kind).toBe("done");
  expect(attackGuard.hpAfterOk).toBeLessThan(20);
  log(
    `2 PASS: off-turn blocked; legal attack ok (hp→${attackGuard.hpAfterOk})`,
  );

  // --- 1: lethal / overlay / undo / rematch ---
  await page.evaluate(async () => {
    const { attackLeader } = await import("/src/logic/core/combat.ts");
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    t.advanceToTurn(8, "first");
    s.players.second.hp = 2;
    s.players.second.defeated = false;
    delete s.gameOverReason;
    delete s.winner;
    s.phase = "main";
    s.players.first.board.length = 0;
    t.summonToBoard("first", "10021110", true);
    const atk = s.players.first.board[0];
    atk.attack = 5;
    atk.can_attack = true;
    atk.attacks_left = 1;
    atk.justPlayed = false;
    atk.hasStorm = true;
    atk.hasAttacked = false;
    attackLeader(0, "first", "second");
  });

  await expect(page.locator("#gameOverOverlay")).toBeVisible();
  await expect(page.locator("#gameOverTitle")).toHaveText("First wins");
  await expect(page.locator("#gameOverReason")).toHaveText("Lethal");
  await expect(page.locator("body")).toHaveClass(/gameover/);
  log("1 PASS: lethal → overlay First wins / Lethal + body.gameover");

  await page.evaluate(() => {
    (document.getElementById("undoBtn") as HTMLButtonElement | null)?.click();
  });
  await page.waitForFunction(
    () => (window as any).gameState?.phase !== "gameover",
  );
  expect(
    await page.evaluate(() => (window as any).gameState.players.second.hp),
  ).toBe(2);
  log("1 PASS: undo restored HP=2 and cleared gameover");

  // Re-apply lethal for rematch
  await page.evaluate(async () => {
    const { attackLeader } = await import("/src/logic/core/combat.ts");
    const t = (window as any).__svwbTest;
    const s = (window as any).gameState;
    t.advanceToTurn(8, "first");
    s.players.second.hp = 2;
    s.phase = "main";
    s.players.first.board.length = 0;
    t.summonToBoard("first", "10021110", true);
    const atk = s.players.first.board[0];
    atk.attack = 5;
    atk.can_attack = true;
    atk.attacks_left = 1;
    atk.justPlayed = false;
    atk.hasStorm = true;
    attackLeader(0, "first", "second");
  });
  await expect(page.locator("#gameOverOverlay")).toBeVisible();
  await page.evaluate(() => {
    const seed = document.getElementById(
      "seedInput",
    ) as HTMLInputElement | null;
    if (seed) seed.value = "88001";
    (
      document.getElementById("rematchSameSeedBtn") as HTMLButtonElement | null
    )?.click();
  });
  await page.waitForFunction(
    () => (window as any).gameState?.phase === "mulligan",
  );
  expect(await page.locator("#seedInput").inputValue()).toBe("88001");
  log("1 PASS: Rematch same seed → mulligan, seed kept 88001");

  // --- 5: perspective flip ---
  await page.evaluate(() => {
    const toggle = document.getElementById(
      "activeOnBottomToggle",
    ) as HTMLInputElement | null;
    if (toggle) toggle.checked = true;
    toggle?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("body")).toHaveClass(/active-on-bottom/);
  await page.evaluate(() => {
    (window as any).gameState.activePlayer = "second";
    (window as any).__svwbTest.render();
  });
  const orders = await page.evaluate(() => {
    const red = document.querySelector(".side-red") as HTMLElement;
    const blue = document.querySelector(".side-blue") as HTMLElement;
    return {
      red: Number(getComputedStyle(red).order),
      blue: Number(getComputedStyle(blue).order),
    };
  });
  expect(orders.red).toBeGreaterThan(orders.blue);
  log(
    `5 PASS: flip + second active → red order ${orders.red} > blue ${orders.blue}`,
  );
  expect(await page.locator("#redCrests .crest-slot").count()).toBeGreaterThan(
    0,
  );
  log("5 PASS: crest slots still queryable after CSS order flip");

  // --- 3 toast ---
  await page.evaluate(async () => {
    const s = (window as any).gameState;
    s.phase = "main";
    s.activePlayer = "second";
    s.players.first.hand = [];
    (window as any).__svwbTest.addToHand("first", "10001110", 1);
    const { playCard } = await import("/src/logic/core/playCard/index.ts");
    const { reportBlockedOutcome } = await import("/src/ui/outcomes.ts");
    reportBlockedOutcome(playCard(s.players.first.hand, "first", 0));
  });
  await expect(page.locator("#actionToast.visible")).toContainText(
    "Not your turn",
  );
  log("3 PASS: toast shows Not your turn for blocked play");

  log("ALL BROWSER CHECKS COMPLETE");
});
