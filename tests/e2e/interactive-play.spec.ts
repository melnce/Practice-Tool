/**
 * Broader interactive play E2E ÔÇö paths the audit suite skips.
 * Screenshots + console errors captured per step.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join("test-results", "interactive-play");
const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
}

async function loadDb(page: Page) {
  await page.evaluate(async () => {
    const { loadCardDatabase } = await import("/src/data/cardDatabase.ts");
    await loadCardDatabase();
  });
}

async function setupTargetingScenario(page: Page) {
  await page.evaluate(async () => {
    const { resetGameState, state } = await import("/src/core/gameState.ts");
    const { getCardById } = await import("/src/data/cardDatabase.ts");
    const { applyKeywordsFromList } =
      await import("/src/logic/core/keywords.ts");
    const { render } = await import("/src/ui/render.ts");

    resetGameState(99);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.players.first.pp = 10;
    state.players.first.maxPP = 10;
    state.players.first.deckFile = "0_testing_basic.json";

    const spell = {
      ...getCardById("10041310")!,
      uid: "spell_uid",
      owner: "first",
      buffs: { attack: 0, defense: 0 },
    };
    const enemy = {
      ...getCardById("10001110")!,
      uid: "enemy_uid",
      owner: "second",
      buffs: { attack: 0, defense: 0 },
      peak_defense: 5,
    };
    applyKeywordsFromList(enemy as any);

    state.players.first.hand = [spell as any];
    state.players.second.board = [enemy as any];
    render();
  });
}

test.describe("Interactive play paths", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test("full start-game flow with test deck (god mode visible)", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    await page.selectOption("#blueDeckSelect", "0_testing_basic");
    await page.selectOption("#redDeckSelect", "0_testing_basic");
    await page.fill("#seedInput", "42");
    await page.click("#startGameBtn");
    await page.waitForTimeout(1500);
    await shot(page, "start-game-01");

    const godVisible = await page
      .locator("#blueGodMode")
      .evaluate((el) => (el as HTMLElement).style.display !== "none");
    expect(godVisible).toBe(true);

    const phase = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.phase;
    });
    expect(phase).toBe("main");

    expect(errors).toEqual([]);
  });

  test("targeted spell via right-click play + board click", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);
    await setupTargetingScenario(page);

    await shot(page, "targeted-spell-01-setup");
    await page.locator("#blueHand .card").first().click({ button: "right" });
    await page.waitForTimeout(200);
    await shot(page, "targeted-spell-02-pending");

    expect(
      await page.evaluate(() =>
        document.body.classList.contains("select-mode"),
      ),
    ).toBe(true);

    await page.locator("#redBoard .card.selectable").first().click();
    await page.waitForTimeout(200);
    await shot(page, "targeted-spell-03-resolved");

    const pending = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return !!state.pendingTargetEffect;
    });
    expect(pending).toBe(false);
    expect(errors).toEqual([]);
  });

  test("fanfare select (nested_effects): play pauses until board click resolves", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { applyKeywordsFromList } =
        await import("/src/logic/core/keywords.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(7);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;

      const marion = {
        ...getCardById("10142140")!,
        uid: "marion_hand",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
      const ally = {
        ...getCardById("10001110")!,
        uid: "ally_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
        peak_defense: 5,
      };
      applyKeywordsFromList(ally as any);

      state.players.first.hand = [marion as any];
      state.players.first.board = [ally as any];
      render();
    });

    await page.locator("#blueHand .card").first().click({ button: "right" });
    await page.waitForTimeout(200);
    await shot(page, "select-op-01-pending");

    const selectable = await page
      .locator("#blueBoard .card.selectable")
      .count();
    expect(selectable).toBe(1);

    await page.locator("#blueBoard .card.selectable").first().click();
    await page.waitForTimeout(200);
    await shot(page, "select-op-02-resolved");

    const atk = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      const ally = state.players.first.board.find((c) => c?.uid === "ally_uid");
      return Number(ally?.attack ?? 0);
    });
    expect(atk).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });

  test("Ward blocks leader click but allows Ward target selection for spell", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { applyKeywordsFromList } =
        await import("/src/logic/core/keywords.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(8);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;

      const spell = {
        ...getCardById("10041310")!,
        uid: "spell2",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
      const ward = {
        ...getCardById("10001130")!,
        uid: "ward_uid",
        owner: "second",
        buffs: { attack: 0, defense: 0 },
        peak_defense: 5,
      };
      const back = {
        ...getCardById("10001110")!,
        uid: "back_uid",
        owner: "second",
        buffs: { attack: 0, defense: 0 },
        peak_defense: 5,
      };
      applyKeywordsFromList(ward as any);
      applyKeywordsFromList(back as any);

      state.players.first.hand = [spell as any];
      state.players.second.board = [ward as any, back as any];
      render();
    });

    await page.locator("#blueHand .card").first().click({ button: "right" });
    await page.waitForTimeout(200);
    await shot(page, "ward-spell-01-pending");

    // Both enemy followers should be selectable for spells (Ward does not gate spells)
    const selectableCount = await page
      .locator("#redBoard .card.selectable")
      .count();
    expect(selectableCount).toBe(2);

    await page.locator("#redBoard .card.selectable").nth(1).click();
    await page.waitForTimeout(200);

    const pending = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return !!state.pendingTargetEffect;
    });
    expect(pending).toBe(false);
    expect(errors).toEqual([]);
  });

  test("mode spell: choice modal appears and pick resumes play", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(55);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;

      const follower = {
        ...getCardById("10001110")!,
        uid: "deck_follower",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
      const spell = {
        ...getCardById("10051310")!,
        uid: "mode_spell",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };

      state.players.first.deck = [follower as any];
      state.players.first.hand = [spell as any];
      render();
    });

    await page.locator("#blueHand .card").first().click({ button: "right" });
    await expect(
      page.locator(".choice-modal .choice-option").first(),
    ).toBeVisible({
      timeout: 5000,
    });
    await shot(page, "mode-modal-01");

    const handBefore = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.players.first.hand.length;
    });

    await page.locator(".choice-modal .choice-option").first().click();
    await page.waitForTimeout(300);
    await shot(page, "mode-modal-02-resolved");

    const after = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return {
        pending: !!state.pendingTargetEffect,
        hand: state.players.first.hand.length,
        deck: state.players.first.deck.length,
      };
    });
    expect(after.pending).toBe(false);
    expect(after.hand).toBeGreaterThan(handBefore);
    expect(errors).toEqual([]);
  });

  test("super-evolve: drag super button then select Golem target", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { applyKeywordsFromList } =
        await import("/src/logic/core/keywords.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(77);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.roundCount = 7;
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;
      state.players.first.superEvoCharges = 1;
      state.players.first.evoUsedThisTurn = false;

      const remi = {
        ...getCardById("10032110")!,
        uid: "remi_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
        peak_defense: 4,
      };
      const golem = {
        ...getCardById("90031120")!,
        uid: "golem_uid",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
        peak_defense: 3,
      };
      applyKeywordsFromList(golem as any);

      state.players.first.board = [remi as any, golem as any];
      render();
    });

    const remiCard = page.locator("#blueBoard .card").first();
    await expect(remiCard).toBeVisible();
    await page.locator("#blueSuperEvo").dragTo(remiCard);
    await page.waitForTimeout(300);
    await shot(page, "super-evo-01-pending");

    await expect(page.locator("#blueBoard .card.selectable")).toBeVisible({
      timeout: 5000,
    });
    await page.locator("#blueBoard .card.selectable").first().click();
    await page.waitForTimeout(300);
    await shot(page, "super-evo-02-resolved");

    const result = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      const golem = state.players.first.board.find(
        (c) => c?.uid === "golem_uid",
      );
      const remi = state.players.first.board.find((c) => c?.uid === "remi_uid");
      return {
        pending: !!state.pendingTargetEffect,
        golemEvolved: !!golem?.hasEvolved,
        golemAtk: Number(golem?.attack ?? 0),
        remiEvolved: !!remi?.hasEvolved,
      };
    });
    expect(result.pending).toBe(false);
    expect(result.remiEvolved).toBe(true);
    expect(result.golemEvolved).toBe(true);
    expect(result.golemAtk).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });

  test("turn cycle: end turn swaps active player and advances round", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(88);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.roundCount = 1;
      render();
    });

    await expect(page.locator("#endTurnBlue")).toBeVisible();
    const before = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return { active: state.activePlayer, round: state.roundCount };
    });
    expect(before.active).toBe("first");

    await page.click("#endTurnBlue");
    await page.waitForTimeout(400);

    const mid = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.activePlayer;
    });
    expect(mid).toBe("second");
    await expect(page.locator("#endTurnRed")).toBeVisible();

    await page.click("#endTurnRed");
    await page.waitForTimeout(400);

    const after = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return { active: state.activePlayer, round: state.roundCount };
    });
    expect(after.active).toBe("first");
    expect(after.round).toBeGreaterThan(before.round);
    expect(errors).toEqual([]);
  });

  test("left-click playable hand card does not play", async ({ page }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await setupTargetingScenario(page);

    const handBefore = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return state.players.first.hand.length;
    });
    expect(handBefore).toBe(1);

    await page.locator("#blueHand .card").first().click();
    await page.waitForTimeout(200);

    const after = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      return {
        hand: state.players.first.hand.length,
        pending: !!state.pendingTargetEffect,
      };
    });
    expect(after.hand).toBe(1);
    expect(after.pending).toBe(false);
    expect(errors).toEqual([]);
  });

  test("left-click fusable hand card enters fuse selection", async ({
    page,
  }) => {
    const errors = trackConsole(page);
    await page.goto(BASE);
    await loadDb(page);

    await page.evaluate(async () => {
      const { resetGameState, state } = await import("/src/core/gameState.ts");
      const { getCardById } = await import("/src/data/cardDatabase.ts");
      const { render } = await import("/src/ui/render.ts");

      resetGameState(31);
      state.gameStarted = true;
      state.phase = "main";
      state.activePlayer = "first";
      state.players.first.pp = 10;
      state.players.first.maxPP = 10;

      const gearAmbition = {
        ...getCardById("90071210")!,
        uid: "gear_ambition",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };
      const gearRemembrance = {
        ...getCardById("90071220")!,
        uid: "gear_remembrance",
        owner: "first",
        buffs: { attack: 0, defense: 0 },
      };

      state.players.first.hand = [gearAmbition as any, gearRemembrance as any];
      render();
    });

    await page.locator("#blueHand .card").first().click();
    await page.waitForTimeout(200);

    const fuseState = await page.evaluate(async () => {
      const { state } = await import("/src/core/gameState.ts");
      const pending = state.pendingTargetEffect as {
        eff?: { op?: string; action?: string };
      } | null;
      return {
        pending: !!pending,
        op: pending?.eff?.op,
        action: pending?.eff?.action,
        hand: state.players.first.hand.length,
      };
    });
    expect(fuseState.pending).toBe(true);
    expect(fuseState.op).toBe("fuse");
    expect(fuseState.action).toBe("finalize");
    expect(fuseState.hand).toBe(2);

    const selectablePartners = await page
      .locator("#blueHand .card.selectable")
      .count();
    expect(selectablePartners).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
