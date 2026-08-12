/**
 * Browser verification: seed UX — type, display, copy, URL round-trip.
 * Chromium: /opt/pw-browsers/chromium or /opt/google/chrome/chrome.
 *
 * Usage: APP_URL=http://127.0.0.1:5173/ npx tsx scripts/browser-verify-seed-ux.ts
 */
import { chromium, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.APP_URL || "http://127.0.0.1:5173/";
const OUT = path.join(process.cwd(), "reports", "browser-seed-ux.md");
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync("/opt/pw-browsers/chromium/chrome")
    ? "/opt/pw-browsers/chromium/chrome"
    : fs.existsSync("/opt/google/chrome/chrome")
      ? "/opt/google/chrome/chrome"
      : "/usr/local/bin/google-chrome");

const TYPED_SEED = 1786012345678;

async function waitReady(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#startGameBtn");
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

  log(`# Browser verification — seed UX`);
  log(`- URL: ${BASE}`);
  log(`- Chromium: ${CHROME}`);
  log(`- Typed seed: ${TYPED_SEED}`);
  log(`- Time: ${new Date().toISOString()}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await waitReady(page);

  // Pick first available decks from selects
  const deckA = await page.locator("#blueDeckSelect").inputValue();
  const deckB = await page.locator("#redDeckSelect").inputValue();
  log(`\n## 1. Type seed and start`);
  log(`- Decks: a=${deckA} b=${deckB}`);

  await page.fill("#seedInput", String(TYPED_SEED));
  await page.click("#startGameBtn", { force: true });
  await page.waitForTimeout(600);
  await confirmMulligans(page);
  await page.waitForTimeout(300);

  const displayed = await page.locator("#gameSeedValue").textContent();
  const panelHidden = await page.locator("#gameSeedPanel").isHidden();
  const url = page.url();
  const seedFromState = await page.evaluate(
    () => (window as any).gameState?.seed,
  );
  const rngSeed = await page.evaluate(
    () => (window as any).gameState?.rng?.seed,
  );

  log(`- Displayed seed: ${displayed}`);
  log(`- Panel hidden: ${panelHidden}`);
  log(`- state.seed: ${seedFromState}`);
  log(`- rng.seed: ${rngSeed}`);
  log(`- Address bar: ${url}`);

  if (displayed !== String(TYPED_SEED)) {
    log(`- FAIL: displayed seed is not the typed literal`);
    failed = true;
  }
  if (seedFromState !== TYPED_SEED) {
    log(`- FAIL: state.seed !== typed literal`);
    failed = true;
  }
  if (rngSeed !== TYPED_SEED >>> 0) {
    log(`- FAIL: rng.seed is not >>> 0 truncation`);
    failed = true;
  }
  if (panelHidden) {
    log(`- FAIL: game seed panel should be visible during play`);
    failed = true;
  }
  if (!url.includes(`seed=${TYPED_SEED}`)) {
    log(`- FAIL: URL missing literal seed`);
    failed = true;
  }
  if (!url.includes(`a=${deckA}`) || !url.includes(`b=${deckB}`)) {
    log(`- FAIL: URL missing deck ids`);
    failed = true;
  }

  log(`\n## 2. Copy control`);
  await page.click("#copySeedBtn", { force: true });
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  log(`- Clipboard: ${clip}`);
  if (clip !== String(TYPED_SEED)) {
    log(`- FAIL: clipboard does not match typed seed`);
    failed = true;
  }

  // Capture opening fingerprint
  const fp1 = await page.evaluate(() => {
    const s = (window as any).gameState;
    return {
      seed: s.seed,
      blueHand: s.players.first.hand.map((c: any) => c.uid),
      redHand: s.players.second.hand.map((c: any) => c.uid),
      blueDeck0: s.players.first.deck[0]?.uid,
      redDeck0: s.players.second.deck[0]?.uid,
    };
  });
  log(`- Opening fingerprint: ${JSON.stringify(fp1)}`);

  log(`\n## 3. Reload from URL — same opening`);
  const shareUrl = page.url();
  await page.goto(shareUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#startGameBtn");
  const prefilled = await page.locator("#seedInput").inputValue();
  log(`- Prefill seedInput: ${prefilled}`);
  if (prefilled !== String(TYPED_SEED)) {
    log(`- FAIL: seedInput not prefilled from URL`);
    failed = true;
  }

  await page.click("#startGameBtn", { force: true });
  await page.waitForTimeout(600);
  await confirmMulligans(page);
  await page.waitForTimeout(300);

  const fp2 = await page.evaluate(() => {
    const s = (window as any).gameState;
    return {
      seed: s.seed,
      blueHand: s.players.first.hand.map((c: any) => c.uid),
      redHand: s.players.second.hand.map((c: any) => c.uid),
      blueDeck0: s.players.first.deck[0]?.uid,
      redDeck0: s.players.second.deck[0]?.uid,
      displayed: document.getElementById("gameSeedValue")?.textContent,
      urlSeed: new URL(location.href).searchParams.get("seed"),
    };
  });
  log(`- Second opening: ${JSON.stringify(fp2)}`);

  if (fp2.seed !== TYPED_SEED || fp2.displayed !== String(TYPED_SEED)) {
    log(`- FAIL: displayed/URL seed disagree with typed after reload`);
    failed = true;
  }
  if (fp2.urlSeed !== String(TYPED_SEED)) {
    log(`- FAIL: URL seed param after restart is wrong`);
    failed = true;
  }
  if (
    JSON.stringify(fp2.blueHand) !== JSON.stringify(fp1.blueHand) ||
    JSON.stringify(fp2.redHand) !== JSON.stringify(fp1.redHand) ||
    fp2.blueDeck0 !== fp1.blueDeck0 ||
    fp2.redDeck0 !== fp1.redDeck0
  ) {
    log(`- FAIL: opening hands/decks differ after URL reload`);
    failed = true;
  } else {
    log(`- PASS: same seed + decks from URL reproduce the opening`);
  }

  await browser.close();

  log(`\n## Verdict`);
  log(failed ? "**FAIL**" : "**PASS**");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`\nWrote ${OUT}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
