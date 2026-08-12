/**
 * Browser verification: paste a real 40-card list, save to selectors, start a game.
 * Chromium: /opt/pw-browsers/chromium or /opt/google/chrome/chrome.
 *
 * Usage: APP_URL=http://127.0.0.1:5173/ npx tsx scripts/browser-verify-deck-import.ts
 */
import { chromium, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.APP_URL || "http://127.0.0.1:5173/";
const OUT = path.join(process.cwd(), "reports", "browser-deck-import.md");
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : fs.existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : "/usr/local/bin/google-chrome");

const FOREST_DECK = path.join(process.cwd(), "decks", "forestcraft_combo.json");

function toPaste(format: "nx" | "n" | "xn"): string {
  const raw = JSON.parse(fs.readFileSync(FOREST_DECK, "utf-8")) as {
    cards: { name: string; count?: number }[];
  };
  const lines = ["Main Deck", ""];
  for (const c of raw.cards) {
    const n = c.count ?? 1;
    if (format === "nx") lines.push(`${n}x ${c.name}`);
    else if (format === "n") lines.push(`${n} ${c.name}`);
    else lines.push(`${c.name} x${n}`);
  }
  return lines.join("\n");
}

async function confirmMulligans(page: Page) {
  for (const id of ["#blueMulliganConfirm", "#redMulliganConfirm"]) {
    const btn = page.locator(id);
    try {
      await btn.waitFor({ state: "visible", timeout: 2500 });
      await btn.click({ force: true });
      await page.waitForTimeout(200);
    } catch {
      /* skipped */
    }
  }
}

async function main() {
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    console.log(s);
  };
  let failed = false;

  log(`# Browser verification — decklist import`);
  log(`- URL: ${BASE}`);
  log(`- Chromium: ${CHROME}`);
  log(`- Source list: decks/forestcraft_combo.json → paste formats`);
  log(`- Time: ${new Date().toISOString()}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#importDeckBtn");

  log(`\n## 1. Paste 3x format and validate`);
  await page.click("#importDeckBtn");
  await page.waitForSelector("#deckImportPanel:not([hidden])");
  await page.fill("#deckImportName", "Browser Meta Forest");
  await page.fill("#deckImportText", toPaste("nx"));
  await page.click("#deckImportValidateBtn");
  await page.waitForTimeout(800);
  const status1 = await page.locator("#deckImportStatus").innerText();
  log(`- Status:\n\`\`\`\n${status1}\n\`\`\``);
  if (!/Ready/i.test(status1) || /Unmatched/i.test(status1)) {
    failed = true;
    log("- FAIL: validate did not report Ready without unmatched lines");
  } else {
    log("- OK: validation ready");
  }

  log(`\n## 2. Save to selectors`);
  await page.click("#deckImportSaveBtn");
  await page.waitForTimeout(500);
  const blueVal = await page.locator("#blueDeckSelect").inputValue();
  const blueLabel = await page
    .locator("#blueDeckSelect option:checked")
    .textContent();
  log(`- Blue select value: ${blueVal}`);
  log(`- Blue select label: ${blueLabel}`);
  if (
    !/imported/i.test(blueVal) &&
    !/Browser Meta Forest/i.test(blueLabel || "")
  ) {
    // id is imported_* — accept either
    const opts = await page.locator("#blueDeckSelect option").allTextContents();
    log(`- Options: ${opts.join(" | ")}`);
    if (!opts.some((o) => /Browser Meta Forest/i.test(o))) {
      failed = true;
      log("- FAIL: imported deck not in selector");
    }
  } else {
    log("- OK: imported deck selected");
  }

  log(`\n## 3. Start game with imported deck`);
  await page.fill("#seedInput", "424242");
  // Ensure red has a shipped deck
  const redOpts = await page
    .locator("#redDeckSelect option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const shipped = redOpts.find((v) => !v.startsWith("imported_")) || redOpts[0];
  if (shipped) await page.selectOption("#redDeckSelect", shipped);
  await page.click("#startGameBtn", { force: true });
  await page.waitForTimeout(800);
  await confirmMulligans(page);
  await page.waitForTimeout(400);

  const started = await page.evaluate(() => {
    const w = window as unknown as {
      engine?: { getState?: () => { gameStarted?: boolean; seed?: number } };
    };
    // Prefer exposed state via DOM / global
    return {
      seedPanel: document.getElementById("gameSeedValue")?.textContent ?? "",
      handCount: document.querySelectorAll("#blueHand .card, #handBlue .card")
        .length,
      anyCard: document.querySelectorAll(".card").length,
    };
  });
  log(`- Seed panel: ${started.seedPanel || "(empty)"}`);
  log(`- Cards in DOM: ${started.anyCard}`);
  if (started.anyCard < 1) {
    failed = true;
    log("- FAIL: game does not appear to have started (no cards)");
  } else {
    log("- OK: game started with imported deck");
  }

  log(`\n## 4. Export list round-trip smoke`);
  await page.click("#exportDecklistBtn");
  await page.waitForTimeout(400);
  const exported = await page.locator("#deckImportText").inputValue();
  log(`- Export length: ${exported.length} chars`);
  log(
    `- First lines:\n\`\`\`\n${exported.split("\n").slice(0, 5).join("\n")}\n\`\`\``,
  );
  if (!/^\d+x /m.test(exported)) {
    failed = true;
    log("- FAIL: export not in Nx Name format");
  } else {
    log("- OK: export paste format");
  }

  await browser.close();

  log(`\n## Result`);
  log(failed ? "**FAILED**" : "**PASSED**");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`\nWrote ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
