/**
 * Browser verification: record a sparring line, replay it, hide hand.
 * Chromium: /opt/pw-browsers/chromium or /opt/google/chrome/chrome.
 */
import { chromium, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.APP_URL || "http://127.0.0.1:5173/";
const OUT = path.join(process.cwd(), "reports", "browser-scripted-line.md");
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : "/opt/google/chrome/chrome");

async function waitReady(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#startGameBtn");
}

async function confirmMulligans(page: Page) {
  for (const id of ["#blueMulliganConfirm", "#redMulliganConfirm"]) {
    const btn = page.locator(id);
    try {
      await btn.waitFor({ state: "visible", timeout: 2000 });
      await btn.click({ force: true });
      await page.waitForTimeout(250);
    } catch {
      /* skipped */
    }
  }
}

async function startGame(page: Page, seed: number) {
  await page.fill("#seedInput", String(seed));
  await page.click("#startGameBtn", { force: true });
  await page.waitForTimeout(400);
  await confirmMulligans(page);
  await page.waitForTimeout(300);
}

async function clickVisibleEndTurn(page: Page): Promise<string | null> {
  for (const id of ["#endTurnBlue", "#endTurnRed"]) {
    const btn = page.locator(id);
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;
    const disabled = await btn.isDisabled().catch(() => true);
    if (disabled) continue;
    await btn.click({ force: true });
    return id;
  }
  return null;
}

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    console.log(s);
  };

  log(`# Browser verification — sparring line`);
  log(`- URL: ${BASE}`);
  log(`- Chromium: ${CHROME}`);
  log(`- Time: ${new Date().toISOString()}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await waitReady(page);

  log(`\n## 1. Record a line (Red)`);
  await page.selectOption("#scriptSideSelect", "second");
  page.once("dialog", (d) => d.accept("browser-verify-line"));
  await page.click("#scriptRecordBtn", { force: true });
  await startGame(page, 777001);
  const status1 = await page.locator("#scriptStatus").textContent();
  log(`- After start + record: status="${status1?.trim()}"`);

  const clicked: string[] = [];
  for (let i = 0; i < 6; i++) {
    const which = await clickVisibleEndTurn(page);
    if (!which) break;
    clicked.push(which);
    await page.waitForTimeout(200);
  }
  log(`- End-turn clicks: ${clicked.join(", ") || "(none)"}`);

  await page.click("#scriptStopRecordBtn", { force: true });
  const status2 = await page.locator("#scriptStatus").textContent();
  log(`- After stop: status="${status2?.trim()}"`);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    page.click("#scriptExportBtn", { force: true }),
  ]);
  let exportedPath: string | null = null;
  let stepCount = 0;
  if (download) {
    exportedPath = path.join(
      process.cwd(),
      "reports",
      "browser-verify-line.svwb-line.json",
    );
    await download.saveAs(exportedPath);
    const doc = JSON.parse(fs.readFileSync(exportedPath, "utf8"));
    stepCount = doc.steps?.length ?? 0;
    log(`- Exported ${stepCount} steps (schema ${doc.schemaVersion})`);
    log(`- scriptedSide=${doc.scriptedSide}`);
    log(`- steps: ${JSON.stringify(doc.steps)}`);
  } else {
    log(`- Export download not captured`);
  }

  log(`\n## 2. Play against the line with hidden hand`);
  await page.click("#scriptClearBtn", { force: true });
  if (exportedPath && stepCount > 0) {
    await page.setInputFiles("#scriptImportInput", exportedPath);
    await page.waitForTimeout(300);
  } else if (exportedPath) {
    // Synthesize a minimal playable line for hidden-hand check
    const synth = {
      schemaVersion: 1,
      name: "synth-hidden",
      scriptedSide: "second",
      seed: 777001,
      steps: [{ op: "END_TURN" }],
    };
    fs.writeFileSync(exportedPath, JSON.stringify(synth, null, 2));
    await page.setInputFiles("#scriptImportInput", exportedPath);
    await page.waitForTimeout(300);
    log(`- Injected synthetic 1-step line (record produced 0 steps)`);
  }
  await page.check("#scriptHiddenHandToggle", { force: true });
  await startGame(page, 777001);
  await page.waitForTimeout(600);

  // Kick auto-advance once
  await page.evaluate(() => {
    (window as any).endTurnBlue?.();
  });
  await page.waitForTimeout(400);

  const faceDown = await page.locator("#redHand .card.card-back").count();
  const redImgs = await page.locator("#redHand .card img").count();
  const redCount = await page.locator("#redHandCount").textContent();
  const banner = await page.locator("#scriptDivergeBanner").isVisible();
  const status3 = await page.locator("#scriptStatus").textContent();

  log(`- Status: "${status3?.trim()}"`);
  log(`- Red hand face-down cards: ${faceDown}`);
  log(`- Red hand <img> nodes (should be 0 when hidden): ${redImgs}`);
  log(`- Red hand count (public): ${redCount}`);
  log(`- Diverge banner visible: ${banner}`);

  const ok =
    faceDown > 0 &&
    redImgs === 0 &&
    Number(redCount) === faceDown &&
    !!(status3 || "").match(/Line|Recording/);

  log(`\n## Verdict: ${ok ? "PASS" : "FAIL"}`);
  await browser.close();
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
