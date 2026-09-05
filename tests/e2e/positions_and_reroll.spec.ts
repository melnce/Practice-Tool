/**
 * Manual browser verification for Save/Load + Checkpoint/Reroll UI.
 * Run: npx playwright test tests/e2e/positions_and_reroll.spec.ts --project=e2e
 */
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { SvwbPage } from "./qa/pageObject.js";

test.describe("Positions + Checkpoint UI", () => {
  test("save/load buttons, checkpoint/reroll hotkeys and status", async ({
    page,
  }) => {
    const po = new SvwbPage(page);
    await page.goto("/");
    await po.openSettingsDrawer();

    // Control chrome present
    await expect(page.locator("#savePositionBtn")).toBeVisible();
    await expect(page.locator("#setCheckpointBtn")).toBeVisible();
    await expect(page.locator("#rerollCheckpointBtn")).toBeVisible();
    await expect(page.locator("#checkpointStatus")).toHaveText(
      /Checkpoint: none/,
    );

    // Seeded start
    await page.locator("#seedInput").fill("424242");
    await page.locator("#startGameBtn").click();
    // Mulligan or board should appear
    await expect(page.locator("#blueHand, #blueBoard").first()).toBeVisible({
      timeout: 15000,
    });

    // F6 sets checkpoint
    await page.keyboard.press("F6");
    await expect(page.locator("#checkpointStatus")).toContainText(
      /Checkpoint:.*rerolls 0/,
      { timeout: 5000 },
    );
    await expect(page.locator("#rerollCheckpointBtn")).toBeEnabled();

    // F8 rerolls
    await page.keyboard.press("F8");
    await expect(page.locator("#checkpointStatus")).toContainText(/rerolls 1/);

    // Input guard: F8 while focused in seed input should not advance
    await page.locator("#seedInput").click();
    await page.keyboard.press("F8");
    await expect(page.locator("#checkpointStatus")).toContainText(/rerolls 1/);
    // Blur
    await page.locator("#setCheckpointBtn").click();
    await expect(page.locator("#checkpointStatus")).toContainText(/rerolls 0/);

    // Save position via dialog
    page.once("dialog", async (dialog) => {
      await dialog.accept("BrowserVerify");
    });
    await page.locator("#savePositionBtn").click();
    await expect(page.locator("#positionSelect")).toBeEnabled();
    await expect(page.locator("#positionSelect option").first()).toContainText(
      /BrowserVerify/,
    );

    // Export downloads a JSON file
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportPositionBtn").click(),
    ]);
    const out = path.join(
      "reports",
      "browser_position_export.svwb-position.json",
    );
    await download.saveAs(out);
    const raw = fs.readFileSync(out, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.name).toBe("BrowserVerify");
    expect(parsed.state.__rng).toBeTruthy();
  });
});
