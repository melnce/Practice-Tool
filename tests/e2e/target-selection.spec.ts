/**
 * Interactive target-selection E2E ÔÇö exercises pause/resume UI path (not auto resolvePendingTarget).
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { setupHermeticPage } from "./helpers/console.js";

const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

test.describe("Interactive target selection", () => {
  test("targeted spell: picker appears and click resolves damage", async ({
    page,
  }) => {
    const consoleErrors = await setupHermeticPage(page);

    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // Load card DB then set up mid-game state with a targeted spell + enemy follower
    await page.evaluate(async () => {
      const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
      await loadCardDatabase();

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
      state.players.first.deckFile = "0_testing_target.json";

      const spellTpl = getCardById("10041310");
      const enemyTpl = getCardById("10001110");
      if (!spellTpl || !enemyTpl) throw new Error("card DB missing test cards");

      const spell = {
        ...spellTpl,
        uid: "spell_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
      const enemy = {
        ...enemyTpl,
        uid: "enemy_uid",
        owner: "second",
        buffs: { attack: 0, defense: 0 },
        peak_defense: Number(enemyTpl.defense),
      };
      applyKeywordsFromList(enemy as any);

      state.players.first.hand = [spell as any];
      state.players.second.board = [enemy as any];
      render();
    });

    await page.screenshot({
      path: "test-results/01-setup.png",
      fullPage: true,
    });

    // Play spell (right-click hand card ÔÇö game convention)
    const handCard = page.locator("#blueHand .card").first();
    await expect(handCard).toBeVisible();
    await handCard.click({ button: "right" });

    await page.waitForTimeout(300);
    await page.screenshot({
      path: "test-results/02-after-play.png",
      fullPage: true,
    });

    const selectMode = await page.evaluate(() =>
      document.body.classList.contains("select-mode"),
    );
    expect(selectMode).toBe(true);

    const enemySelectable = await page
      .locator("#redBoard .card.selectable")
      .count();
    expect(enemySelectable).toBeGreaterThan(0);

    // Click enemy follower to resolve target
    await page.locator("#redBoard .card.selectable").first().click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "test-results/03-after-target-click.png",
      fullPage: true,
    });

    const stillPending = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return !!state.pendingTargetEffect;
    });
    expect(stillPending).toBe(false);

    const enemyDef = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      const c = state.players.second.board[0];
      return c ? Number(c.defense) : -1;
    });
    // Strike of the Dragonewt deals 2 damage (not in Overflow)
    expect(enemyDef).toBeLessThan(5);

    expect(consoleErrors).toEqual([]);
  });
});

test.use({
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
});
