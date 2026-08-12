/**
 * Headless browser verification for the consistency trainer page.
 * Uses Google Chrome (channel: chrome) — /opt/pw-browsers/chromium was not present.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.PW_BASE_URL ?? "http://127.0.0.1:5173";
const out: string[] = [];
const log = (s: string) => {
  out.push(s);
  console.log(s);
};

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    executablePath: "/opt/google/chrome/chrome",
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => log(`PAGEERROR: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") log(`CONSOLE_ERROR: ${msg.text()}`);
  });

  log(`Navigating ${BASE}/consistency.html`);
  await page.goto(`${BASE}/consistency.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#statsDeck");
  const deckCount = await page.locator("#statsDeck option").count();
  log(`Deck options loaded: ${deckCount}`);
  if (deckCount < 1) throw new Error("No decks in select");

  // Pick a couple of condition cards
  await page.locator("#condChips .chip").first().click();
  await page.locator("#condChips .chip").nth(1).click();
  await page.locator("#condAtLeast").fill("1");
  await page.locator("#statsIters").fill("20000");
  await page.locator("#statsHorizon").fill("8");
  await page.locator("#statsSeed").fill("42");

  log("Running consistency simulation…");
  await page.locator("#runStats").click();
  await page.waitForSelector("#statsTable:not(.hidden)", { timeout: 30_000 });
  const meta = await page.locator("#statsMeta").innerText();
  log(`Stats meta: ${meta}`);
  const rows = await page.locator("#statsTable tbody tr").count();
  log(`Result rows: ${rows}`);

  // Drill
  await page.locator("#tabDrill").click();
  await page.locator("#dealHand").click();
  await page.waitForSelector("#drillHand .card-tile");
  const tiles = await page.locator("#drillHand .card-tile").count();
  log(`Opening hand tiles: ${tiles}`);
  await page.locator("#drillHand .card-tile").nth(2).click(); // mulligan 3rd
  await page.locator("#revealBtn").click();
  await page.waitForSelector("#drillCompare:not(.hidden)");
  const compareText = await page.locator("#drillCompare").innerText();
  log(`Compare preview: ${compareText.slice(0, 200).replace(/\n/g, " | ")}…`);

  await page.locator("#nextHand").click();
  await page.waitForTimeout(200);
  const meta2 = await page.locator("#drillMeta").innerText();
  log(`Next hand meta: ${meta2}`);

  // Link from main page
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href="./consistency.html"]');
  await link.waitFor();
  log("Main page link to Consistency Trainer: present");

  await browser.close();
  log("BROWSER_VERIFY_OK");
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(
    "reports/consistency-browser-verify.txt",
    out.join("\n") + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
