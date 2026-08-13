/**
 * Browser verification for puzzle authoring / fail / retry / solve.
 * Run: npx playwright test tests/e2e/puzzle_mode.spec.ts --project=e2e
 */
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("Puzzle mode UI", () => {
  test("control chrome present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#savePuzzleBtn")).toBeVisible();
    await expect(page.locator("#loadPuzzleBtn")).toBeVisible();
    await expect(page.locator("#retryPuzzleBtn")).toBeVisible();
    await expect(page.locator("#puzzleStatus")).toHaveText(/Puzzle: none/);
  });

  test("author → fail → retry → solve (deterministic)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#seedInput").fill("31337");
    await page.locator("#startGameBtn").click();
    await expect(page.locator("#blueHand, #blueBoard").first()).toBeVisible({
      timeout: 15000,
    });

    // Skip mulligan UI if visible
    const confirm = page.locator("#confirmMulligan");
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
      await page.waitForTimeout(300);
    }

    const result = await page.evaluate(async () => {
      const engine = await import("/src/engine.ts");
      const history = await import("/src/core/history.ts");
      const st = engine.getState();

      if (st.phase === "mulligan") {
        st.phase = "main";
        st.gameStarted = true;
      }
      st.activePlayer = "first";
      st.players.second.hp = 5;
      st.players.second.board = [];
      st.players.second.defeated = false;
      // Pad both decks so end-turn draws cannot deck-out mid-attempt
      for (const side of ["first", "second"] as const) {
        while (st.players[side].deck.length < 15) {
          const c = structuredClone(
            st.players[side].hand[0] || {
              name: "Pad",
              type: "Follower",
              cost: 1,
              attack: 1,
              defense: 1,
              uid: `pad_${side}_${st.players[side].deck.length}`,
            },
          );
          c.uid = `pad_${side}_${st.players[side].deck.length}_${Math.random()}`;
          c.zone = "deck";
          st.players[side].deck.push(c);
        }
      }

      const position = engine.savePosition("browser-puzzle-pos");
      const puzzle = engine.savePuzzle({
        title: "Browser Lethal",
        description: "Enemy leader to 0 in one turn",
        solverSide: "first",
        turnLimit: 1,
        goal: { type: "enemy_leader_hp_0" },
        position,
      });

      engine.beginPuzzleAttempt(puzzle.id);
      const startHash = engine.getPuzzleSessionSnapshot().startHash;

      // Fail: end turn without achieving lethal
      engine.dispatch(st, { type: "END_TURN" });
      const failed = engine.getPuzzleSessionSnapshot();

      engine.retryPuzzleAttempt();
      const retrySnap = engine.getPuzzleSessionSnapshot();
      const hashModule = await import("/src/core/stateHash.ts");
      const liveHash = hashModule.hashGameState(engine.getState());

      // Solve: drop enemy to 0 inside a history action so the checker runs
      history.doAction(
        "puzzle-lethal",
        () => {
          const s = engine.getState();
          s.players.second.hp = 0;
          s.players.second.defeated = true;
          s.phase = "gameover";
          s.winner = "first";
          (s as any).gameOverReason = "lethal";
        },
        {},
        { autoRender: false },
      );
      const solved = engine.getPuzzleSessionSnapshot();
      const json = engine.exportPuzzleToJson(puzzle.id);

      return {
        startHash,
        failedStatus: failed.status,
        failReason: failed.failReason,
        retryStatus: retrySnap.status,
        retryHash: retrySnap.startHash,
        liveHashMatches: liveHash === startHash,
        solvedStatus: solved.status,
        cardsPlayed: solved.cardsPlayed,
        schemaVersion: JSON.parse(json).schemaVersion,
        title: JSON.parse(json).title,
        goal: JSON.parse(json).goal,
        json,
      };
    });

    expect(result.failedStatus).toBe("failed");
    expect(result.failReason).toMatch(/Turn limit/);
    expect(result.retryStatus).toBe("active");
    expect(result.retryHash).toBe(result.startHash);
    expect(result.liveHashMatches).toBe(true);
    expect(result.solvedStatus).toBe("solved");
    expect(result.schemaVersion).toBe(1);
    expect(result.title).toBe("Browser Lethal");
    expect(result.goal).toEqual({ type: "enemy_leader_hp_0" });

    fs.mkdirSync("reports", { recursive: true });
    fs.writeFileSync(
      path.join("reports", "browser_puzzle_verify.json"),
      JSON.stringify(
        {
          startHash: result.startHash,
          failedStatus: result.failedStatus,
          retryStatus: result.retryStatus,
          solvedStatus: result.solvedStatus,
          schemaVersion: result.schemaVersion,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join("reports", "browser_puzzle_export.svwb-puzzle.json"),
      result.json,
    );
  });
});
