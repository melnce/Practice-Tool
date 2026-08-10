/**
 * QA scenario gauntlet — god-mode arrange, real-input act, invariant after each step.
 * Card ids reference cards/sets/ (read-only).
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { SvwbPage } from "./pageObject.js";
import { trackConsole, qaStep } from "./invariant.js";
import blueFund from "./decks/fundamentals-blue.json" with { type: "json" };
import redFund from "./decks/fundamentals-red.json" with { type: "json" };

const QA_SHOTS = path.join("test-results", "qa", "checkpoints");
test.beforeAll(() => fs.mkdirSync(QA_SHOTS, { recursive: true }));

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({
    path: path.join(QA_SHOTS, `${name}.png`),
    fullPage: true,
  });
}

test.describe("S1 — fundamentals", () => {
  test("mulligan flow with real startGame", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.startGameFull(42100);

    await qaStep(
      page,
      tracker,
      async () => {
        await page.waitForFunction(
          () => (window as any).gameState?.phase === "mulligan",
        );
        await po.toggleMulliganCard("#blueHand", 0);
        await po.confirmMulligan("blue");
        await po.confirmMulligan("red");
        await page.waitForFunction(
          () => (window as any).gameState?.phase === "main",
        );
      },
      "s1-mulligan",
    );

    const handLen = await po.readState<number>(
      "state.players.first.hand.length",
    );
    expect(handLen).toBeGreaterThan(0);
    await shot(page, "s1-mulligan-done");
  });

  test("opening draw via loadDecks", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42101);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.loadDecks(blueFund as any, redFund as any, true);
        const len = await po.readState<number>(
          "state.players.first.hand.length",
        );
        expect(len).toBeGreaterThan(0);
      },
      "s1-opening-draw",
    );
  });

  test("play, attack, turns, lethal", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42001);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.loadDecks(blueFund as any, redFund as any);
        await po.god({
          advanceToTurn: { round: 5, activePlayer: "first" },
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          addToHand: [{ player: "first", cardId: "10001110" }],
          summon: [{ player: "second", cardId: "10001110" }],
        });
      },
      "s1-arrange-start",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.rightClickPlayHandCard("#blueHand", 0);
      },
      "s1-right-click-play",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          addToHand: [{ player: "first", cardId: "10001110", count: 1 }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.dragHandToBoard("#blueHand", "#blueBoard", 0);
      },
      "s1-drag-play",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first", "second"],
          summon: [
            { player: "first", cardId: "10001110", attackReady: true },
            { player: "second", cardId: "10001110", attackReady: true },
          ],
          advanceToTurn: { round: 6, activePlayer: "first" },
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redBoard .card").first(),
        );
      },
      "s1-attack-follower",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first"],
          summon: [{ player: "first", cardId: "10021110", attackReady: true }],
          advanceToTurn: { round: 7, activePlayer: "first" },
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redLeader"),
        );
      },
      "s1-attack-leader",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.endTurn("blue");
        await po.endTurn("red");
      },
      "s1-end-turns",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({ setLeaderHP: [{ player: "second", hp: 1 }] });
        await po.god({
          clearBoard: ["first"],
          summon: [{ player: "first", cardId: "10021110", attackReady: true }],
          advanceToTurn: { round: 8, activePlayer: "first" },
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redLeader"),
        );
        const hp = await po.readState<number>("state.players.second.hp");
        expect(hp).toBeLessThanOrEqual(0);
      },
      "s1-lethal",
    );

    await shot(page, "s1-done");
  });
});

test.describe("S2 — targeting", () => {
  test("single-select spell, multi-select Ralmia, leader, cancel", async ({
    page,
  }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42002);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 5, activePlayer: "first" },
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          addToHand: [{ player: "first", cardId: "10041310" }],
          summon: [{ player: "second", cardId: "10001110" }],
        });
      },
      "s2-arrange-spell",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.clickSelectableBoard("#redBoard", 0);
      },
      "s2-single-spell",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({ clearHand: ["first"] });
        await po.god({
          addToHand: [{ player: "first", cardId: "10041310" }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          summon: [{ player: "second", cardId: "10001110" }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingTarget();
        const pendingBefore = await po.readState<boolean>(
          "!!state.pendingTargetEffect",
        );
        expect(pendingBefore).toBe(true);
        await po.clickInvalidTargetWhilePending();
        const stillPending = await po.readState<boolean>(
          "!!state.pendingTargetEffect",
        );
        expect(stillPending).toBe(true);
      },
      "s2-cancel-invalid",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          addToHand: [
            { player: "first", cardId: "10174130" },
            { player: "first", cardId: "90072110" },
            { player: "first", cardId: "90072110" },
          ],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingSelectCount(2);
        await po.clickSelectableHand("#blueHand", 0);
        await po.clickSelectableHand("#blueHand", 1);
      },
      "s2-ralmia-multi",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          addToHand: [
            { player: "first", cardId: "10174130" },
            { player: "first", cardId: "90072110", count: 4 },
          ],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingSelectCount(3);
        await po.clickSelectableHand("#blueHand", 0);
        await po.clickSelectableHand("#blueHand", 1);
        await po.clickSelectableHand("#blueHand", 2);
      },
      "s2-ralmia-cap-3",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          addToHand: [{ player: "first", cardId: "10041310" }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await page.evaluate(() => {
          const s = (window as any).gameState;
          s.pendingTargetEffect = {
            ...s.pendingTargetEffect,
            canTargetLeader: true,
          };
          window.__svwbTest!.render();
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.clickLeader("red");
      },
      "s2-leader-target",
    );

    await shot(page, "s2-done");
  });
});

test.describe("S3 — fuse gauntlet", () => {
  test("loot, forest, generic, artifact paths", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42003);

    // Drag-then-click suppressor: aborted drag must not block fuse; exactly one fuse open, zero plays
    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          advanceToTurn: { round: 6, activePlayer: "first" },
          addToHand: [
            { player: "first", cardId: "90071210" },
            { player: "first", cardId: "90071220" },
          ],
        });
        const handBefore = await po.readState<number>(
          "state.players.first.hand.length",
        );
        await po.dragHandCardThenClick("#blueHand", 0);
        const handAfter = await po.readState<number>(
          "state.players.first.hand.length",
        );
        expect(handAfter).toBe(handBefore);
        const fusePending = await po.readState<boolean>(
          "!!(state.pendingTargetEffect?.eff?.op === 'fuse')",
        );
        expect(fusePending).toBe(true);
        const boardLen = await po.readState<number>(
          "state.players.first.board.length",
        );
        expect(boardLen).toBe(0);
      },
      "s3-drag-then-click-suppressor",
    );

    // Loot: Returning Slash 10323310 + Gilded Blade 90021310 (Loot tribe)
    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          advanceToTurn: { round: 6, activePlayer: "first" },
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          addToHand: [
            { player: "first", cardId: "10323310" },
            { player: "first", cardId: "90021310" },
          ],
        });
        await po.leftClickHandCard("#blueHand", 0);
        await po.fuseWithHandPartner("#blueHand", 1);
      },
      "s3-loot-fuse",
    );

    // Forest: Garden's Allure 10213310 + Forestcraft follower 10211110
    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          addToHand: [
            { player: "first", cardId: "10213310" },
            { player: "first", cardId: "10211110" },
          ],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.leftClickHandCard("#blueHand", 0);
        await po.fuseWithHandPartner("#blueHand", 1);
      },
      "s3-forest-fuse",
    );

    // Generic fuse: Gear of Ambition 90071210 + Gear of Remembrance 90071220
    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          addToHand: [
            { player: "first", cardId: "90071210" },
            { player: "first", cardId: "90071220" },
          ],
        });
        await po.leftClickHandCard("#blueHand", 0);
        await po.fuseWithHandPartner("#blueHand", 1);
      },
      "s3-generic-fuse",
    );

    // Artifact fuse: Striker Artifact 90072110 + Gear of Ambition 90071210
    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          addToHand: [
            { player: "first", cardId: "90072110" },
            { player: "first", cardId: "90071210" },
          ],
        });
        await po.leftClickHandCard("#blueHand", 0);
        await po.fuseWithHandPartner("#blueHand", 1);
      },
      "s3-artifact-fuse",
    );

    await shot(page, "s3-done");
  });
});

test.describe("S4 — resources / evolve", () => {
  test("EP/SEP gates, evo drag, bonus PP, Enhance", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42004);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 5, activePlayer: "first" },
          setEP: [{ player: "first", charges: 2 }],
          setSEP: [{ player: "first", charges: 1 }],
          summon: [{ player: "first", cardId: "10001110" }],
        });
        await po.dragEvoToFollower("#blueNormalEvo", "#blueBoard", 0);
      },
      "s4-normal-evo",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 7, activePlayer: "first" },
          setSEP: [{ player: "first", charges: 2 }],
          summon: [{ player: "first", cardId: "10001110" }],
        });
        await po.dragEvoToFollower("#blueSuperEvo", "#blueBoard", 0);
      },
      "s4-super-evo",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 4, activePlayer: "second" },
          resetBonusPP: true,
          setPP: [{ player: "second", pp: 3, maxPP: 4 }],
        });
        const ppBefore = await po.readState<number>("state.players.second.pp");
        await po.useBonusPP();
        const ppAfter = await po.readState<number>("state.players.second.pp");
        expect(ppAfter).toBe(ppBefore + 1);
      },
      "s4-bonus-pp-early",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 7, activePlayer: "second" },
          resetBonusPP: true,
          setPP: [{ player: "second", pp: 6, maxPP: 7 }],
        });
        await po.useBonusPP();
        await po.endTurn("red");
        const usedLate = await po.readState<boolean>(
          "state.secondPlayerPPBoostUsedLate",
        );
        expect(usedLate).toBe(true);
      },
      "s4-bonus-pp-late",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          clearBoard: ["first"],
          advanceToTurn: { round: 5, activePlayer: "first" },
          addToHand: [{ player: "first", cardId: "10001110" }],
          setPP: [{ player: "first", pp: 3, maxPP: 10 }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        const atk = await po.readState<number>(
          "state.players.first.board[0]?.attack",
        );
        expect(Number(atk)).toBe(2);
      },
      "s4-enhance-below",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first"],
          addToHand: [{ player: "first", cardId: "10001110" }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        const atk = await po.readState<number>(
          "state.players.first.board[0]?.attack",
        );
        expect(Number(atk)).toBe(5);
      },
      "s4-enhance-at-threshold",
    );

    await shot(page, "s4-done");
  });
});

test.describe("S5 — amulets", () => {
  test("countdown, engage, engage no-op same turn", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42005);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 4, activePlayer: "first" },
          setPP: [{ player: "first", pp: 5, maxPP: 5 }],
          summon: [{ player: "first", cardId: "10031210" }],
        });
        await po.engageBoardCard("#blueBoard", 0);
      },
      "s5-engage",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.engageBoardCard("#blueBoard", 0);
        const engaged = await po.readState<boolean>(
          "state.players.first.board[0]?.keywordState?.engagedThisTurn",
        );
        expect(engaged).toBe(true);
      },
      "s5-engage-noop",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first"],
          advanceToTurn: { round: 5, activePlayer: "first" },
          addToDeck: [{ player: "first", cardId: "10001110", count: 5 }],
          summon: [{ player: "first", cardId: "10161210" }],
        });
        await page.evaluate(() => {
          const s = window.__svwbTest!.getState();
          const am = s.players.first.board[0];
          if (am) am.countdown = 1;
          window.__svwbTest!.render();
        });
        const handBefore = await po.readState<number>(
          "state.players.first.hand.length",
        );
        await po.endTurn("blue");
        await po.endTurn("red");
        const onBoard = await po.readState<number>(
          "state.players.first.board.length",
        );
        expect(onBoard).toBe(0);
        const handAfter = await po.readState<number>(
          "state.players.first.hand.length",
        );
        expect(handAfter).toBeGreaterThanOrEqual(handBefore + 2);
      },
      "s5-countdown-lastwords",
    );

    await shot(page, "s5-done");
  });
});

test.describe("S6 — edges", () => {
  test("9-hand burn, full board, ward, aura", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42006);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 5, activePlayer: "first" },
        });
        for (let i = 0; i < 9; i++) {
          await page.evaluate(() =>
            window.__svwbTest!.addToHand("first", "10001110"),
          );
        }
        await page.evaluate(async () => {
          const { drawCard } = await import("/src/core/utils.ts");
          const s = (window as any).gameState;
          drawCard(s.players.first.hand, s.players.first.deck, "first");
          window.__svwbTest!.render();
        });
        const handLen = await po.readState<number>(
          "state.players.first.hand.length",
        );
        expect(handLen).toBe(9);
      },
      "s6-burn",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() =>
            window.__svwbTest!.summonToBoard("first", "10001110"),
          );
        }
        const ok = await page.evaluate(() =>
          window.__svwbTest!.summonToBoard("first", "10001110"),
        );
        expect(ok).toBe(false);
      },
      "s6-full-board",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          clearBoard: ["second"],
          advanceToTurn: { round: 5, activePlayer: "first" },
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          addToHand: [{ player: "first", cardId: "10041310" }],
          summon: [
            { player: "second", cardId: "10001130" },
            { player: "second", cardId: "10001110" },
          ],
        });
        const hpBefore = await po.readState<number>("state.players.second.hp");
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingTarget();
        await page.locator("#redBoard .card.selectable").first().click();
        await page.waitForTimeout(200);
        const hpAfterLeader = await po.readState<number>(
          "state.players.second.hp",
        );
        expect(hpAfterLeader).toBe(hpBefore);
        const wardDef = await po.readState<number>(
          "state.players.second.board.find((c) => c.name === 'Quake Goliath')?.defense ?? 99",
        );
        const backDef = await po.readState<number>(
          "state.players.second.board.find((c) => c.name === 'Indomitable Fighter')?.defense ?? 99",
        );
        expect(Math.min(Number(wardDef), Number(backDef))).toBeLessThan(5);
      },
      "s6-ward",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          clearBoard: ["second"],
          addToHand: [{ player: "first", cardId: "10041310" }],
          summon: [{ player: "second", cardId: "10161140", attackReady: true }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
        });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await page.waitForTimeout(300);
        const pending = await po.readState<boolean>(
          "!!state.pendingTargetEffect",
        );
        expect(pending).toBe(false);
        const selectable = await page
          .locator("#redBoard .card.selectable")
          .count();
        expect(selectable).toBe(0);
      },
      "s6-aura-spell",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          clearBoard: ["first", "second"],
          summon: [
            { player: "first", cardId: "10021110", attackReady: true },
            { player: "second", cardId: "10144120", attackReady: true },
          ],
          advanceToTurn: { round: 6, activePlayer: "first" },
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redBoard .card").first(),
        );
        const fortDef = await po.readState<number>(
          "state.players.second.board[0]?.defense",
        );
        expect(Number(fortDef)).toBe(2);
      },
      "s6-intimidate-attack",
    );

    await shot(page, "s6-done");
  });
});

test.describe("S7 — keyword smoke", () => {
  test("storm, rush, bane, drain", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42007);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 6, activePlayer: "first" },
          summon: [{ player: "first", cardId: "10021110" }],
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redLeader"),
        );
      },
      "s7-storm-face",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          summon: [{ player: "first", cardId: "10021120" }],
          advanceToTurn: { round: 6, activePlayer: "first" },
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redLeader"),
        );
        const attacked = await po.readState<boolean>(
          "state.players.first.board.some((c) => c.name === 'Arms Peddler')",
        );
        expect(attacked).toBe(true);
      },
      "s7-rush",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first", "second"],
          advanceToTurn: { round: 6, activePlayer: "first" },
          summon: [
            { player: "first", cardId: "10153110", attackReady: true },
            { player: "second", cardId: "10001110", attackReady: true },
          ],
        });
        await page.evaluate(() => {
          const s = window.__svwbTest!.getState();
          const prey = s.players.second.board[0];
          const bane = s.players.first.board[0];
          if (prey) {
            prey.attack = 4;
            prey.defense = 4;
          }
          if (bane) {
            bane.attack = 1;
            bane.defense = 1;
          }
          window.__svwbTest!.render();
        });
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redBoard .card").first(),
        );
        await page.waitForTimeout(300);
        const baneAlive = await po.readState<number>(
          "state.players.first.board.length + state.players.second.board.length",
        );
        expect(baneAlive).toBe(0);
      },
      "s7-bane-trade",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first", "second"],
          setLeaderHP: [{ player: "first", hp: 12 }],
          advanceToTurn: { round: 6, activePlayer: "first" },
          summon: [{ player: "first", cardId: "10453110", attackReady: true }],
        });
        const hpBefore = await po.readState<number>("state.players.first.hp");
        await po.dragAttackerToTarget(
          "#blueBoard",
          0,
          page.locator("#redLeader"),
        );
        const hpAfter = await po.readState<number>("state.players.first.hp");
        expect(hpAfter).toBeGreaterThan(hpBefore);
      },
      "s7-drain-attack",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearBoard: ["first", "second"],
          setLeaderHP: [{ player: "first", hp: 12 }],
          summon: [
            { player: "second", cardId: "10453110", attackReady: true },
            { player: "first", cardId: "10001110", attackReady: true },
          ],
          advanceToTurn: { round: 6, activePlayer: "second" },
        });
        const hpBefore = await po.readState<number>("state.players.first.hp");
        await po.dragAttackerToTarget(
          "#redBoard",
          0,
          page.locator("#blueBoard .card").first(),
        );
        const hpAfter = await po.readState<number>("state.players.first.hp");
        expect(hpAfter).toBe(hpBefore);
      },
      "s7-drain-defend",
    );

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          clearHand: ["first"],
          clearBoard: ["second"],
          addToHand: [{ player: "first", cardId: "10041310" }],
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          summon: [{ player: "second", cardId: "10161120" }],
          advanceToTurn: { round: 5, activePlayer: "first" },
        });
        const barrierBefore = await po.readState<boolean>(
          "!!state.players.second.board[0]?.hasBarrier",
        );
        expect(barrierBefore).toBe(true);
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingTarget();
        const targetUid = await po.readState<string>(
          "state.players.second.board[0]?.uid ?? ''",
        );
        await page
          .locator(`#redBoard .card.selectable[data-uid="${targetUid}"]`)
          .click();
        await page.waitForTimeout(300);
        const barrierMid = await po.readState<boolean>(
          "!!state.players.second.board[0]?.hasBarrier",
        );
        expect(barrierMid).toBe(false);
        await po.god({ addToHand: [{ player: "first", cardId: "10041310" }] });
        await po.rightClickPlayHandCard("#blueHand", 0);
        await po.waitForPendingTarget();
        await page
          .locator(`#redBoard .card.selectable[data-uid="${targetUid}"]`)
          .click();
        await page.waitForTimeout(300);
        const onBoard = await po.readState<number>(
          "state.players.second.board.length",
        );
        expect(onBoard).toBe(0);
      },
      "s7-barrier-pop",
    );

    await shot(page, "s7-done");
  });
});

test.describe("S8 — stability", () => {
  test("rapid input spam mid-resolution", async ({ page }) => {
    const tracker = trackConsole(page);
    const po = new SvwbPage(page);
    await po.gotoTestMode();
    await po.loadDb();
    await po.seedRng(42008);

    await qaStep(
      page,
      tracker,
      async () => {
        await po.god({
          advanceToTurn: { round: 5, activePlayer: "first" },
          setPP: [{ player: "first", pp: 10, maxPP: 10 }],
          addToHand: [{ player: "first", cardId: "10001110", count: 3 }],
        });
        const card = page.locator("#blueHand .card").first();
        for (let i = 0; i < 5; i++) {
          if (!(await card.isVisible())) break;
          await card
            .click({ button: "right", force: true, timeout: 2_000 })
            .catch(() => {});
          await page.waitForTimeout(50);
        }
      },
      "s8-spam",
    );

    await shot(page, "s8-done");
  });
});
