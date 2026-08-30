/**
 * Headless Chromium play-test for the committed class deck library.
 * Selects each deck via the real UI, mulligans, plays turns by clicking hand
 * cards, and records whether the class mechanic fired.
 *
 * Logs → reports/deck-library-playtest.json
 * Run: PW_BASE_URL=http://localhost:5173 npx tsx scripts/playtest-deck-library.ts
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reports", "deck-library-playtest.json");
const BASE = process.env.PW_BASE_URL ?? "http://localhost:5173";

const DECKS = [
  { id: "runecraft_sephie_test_subject", mechanic: "fuse_storm", seed: 424203 },
  {
    id: "portalcraft_artifact_rotation",
    mechanic: "artifact_gear",
    seed: 424207,
  },
] as const;

type Mechanic = (typeof DECKS)[number]["mechanic"];

type PlayerSnap = {
  deckFile?: string;
  hp: number;
  pp: number;
  maxPP: number;
  hand: string[];
  board: { name: string; type?: string; countdown?: unknown }[];
  shadows: number;
  rally: number;
  playsThisTurn: number;
  cardsPlayed: number;
  spellboostMax: number;
  handHasGear: boolean;
};

type Result = {
  id: string;
  ok: boolean;
  error?: string;
  mechanic: Mechanic;
  mechanicTriggered: boolean;
  notes: string[];
  consoleErrors: string[];
  round: number;
  phase: string;
  first: PlayerSnap;
};

async function readJson<T>(page: Page, expr: string): Promise<T> {
  // String expressions avoid tsx injecting __name into serialized fns.
  return page.evaluate(expr) as Promise<T>;
}

async function dismissOverlays(page: Page) {
  for (let i = 0; i < 5; i++) {
    const choice = page.locator(".choice-modal .choice-option").first();
    if (await choice.isVisible().catch(() => false)) {
      await choice.click().catch(() => {});
      await page.waitForTimeout(60);
      continue;
    }
    const confirm = page.locator("#targetingConfirmation button").first();
    if (await confirm.isVisible().catch(() => false)) {
      const target = page.locator(".card.selectable").first();
      if (await target.isVisible().catch(() => false)) {
        await target.click({ force: true }).catch(() => {});
      } else {
        await page
          .locator("#redLeader")
          .click()
          .catch(() => {});
        await page
          .locator("#blueLeader")
          .click()
          .catch(() => {});
      }
      await confirm.click().catch(() => {});
      await page.waitForTimeout(60);
      continue;
    }
    break;
  }
}

async function playCheapCards(page: Page) {
  for (let n = 0; n < 6; n++) {
    const pick = await readJson<{
      zone: string;
      index: number;
      name: string;
    } | null>(
      page,
      `(() => {
        const s = window.gameState;
        if (!s || s.phase !== "main") return null;
        const owner = s.activePlayer;
        const p = s.players[owner];
        let best = -1;
        let bestCost = 999;
        let bestName = "";
        for (let i = 0; i < p.hand.length; i++) {
          const c = p.hand[i];
          const cost = typeof c.cost === "number" ? c.cost : 99;
          if (cost <= p.pp && cost < bestCost) {
            best = i;
            bestCost = cost;
            bestName = c.name;
          }
        }
        if (best < 0) return null;
        const zone = owner === "first" ? "#blueHand" : "#redHand";
        return { zone, index: best, name: bestName };
      })()`,
    );
    if (!pick) break;

    const idPrefix = pick.zone === "#blueHand" ? "blueHand" : "redHand";
    const card = page.locator(`#${idPrefix}-${pick.index}`);
    const target =
      (await card.count()) > 0
        ? card
        : page.locator(`${pick.zone} .card`).nth(pick.index);
    // Hand play is bound to contextmenu (right-click) in src/ui/zones/handlers.ts
    await target.click({ button: "right", force: true });
    await page.waitForTimeout(120);
    await dismissOverlays(page);
  }
}

async function endTurn(page: Page) {
  const active = await readJson<string>(
    page,
    `window.gameState && window.gameState.activePlayer`,
  );
  const btn = active === "first" ? "#endTurnBlue" : "#endTurnRed";
  await page
    .locator(btn)
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(180);
  await dismissOverlays(page);
}

function assess(
  snap: { round: number; phase: string; first: PlayerSnap },
  mechanic: Mechanic,
  consoleErrors: string[],
): Pick<Result, "mechanicTriggered" | "notes" | "consoleErrors"> {
  const notes: string[] = [];
  let mechanicTriggered = false;
  const p = snap.first;

  if (mechanic === "combo") {
    if (p.playsThisTurn >= 2 || p.cardsPlayed >= 3) {
      mechanicTriggered = true;
      notes.push(
        `Combo density: playsThisTurn=${p.playsThisTurn}, totalCardsPlayed=${p.cardsPlayed}`,
      );
    }
    const fairies = [...p.hand, ...p.board.map((b) => b.name)].filter((n) =>
      /Fairy|Pixie/.test(n),
    );
    if (fairies.length) {
      mechanicTriggered = true;
      notes.push(`Fairy/Pixie seen: ${[...new Set(fairies)].join(", ")}`);
    }
  } else if (mechanic === "rally") {
    if (p.rally > 0) {
      mechanicTriggered = true;
      notes.push(`Rally counter = ${p.rally}`);
    }
  } else if (mechanic === "spellboost") {
    if (p.spellboostMax > 0) {
      mechanicTriggered = true;
      notes.push(`Spellboost max on hand = ${p.spellboostMax}`);
    }
  } else if (mechanic === "overflow") {
    if (p.maxPP >= 7) {
      mechanicTriggered = true;
      notes.push(`Overflow on (maxPP=${p.maxPP})`);
    } else if (p.maxPP > snap.round) {
      notes.push(`Ramp: maxPP=${p.maxPP} at round ${snap.round}`);
    }
  } else if (mechanic === "shadows") {
    if (p.shadows > 0) {
      mechanicTriggered = true;
      notes.push(`Shadows = ${p.shadows}`);
    }
  } else if (mechanic === "countdown_amulet") {
    const amulets = p.board.filter((b) => b.type === "Amulet");
    if (amulets.length) {
      mechanicTriggered = true;
      notes.push(
        `Amulets: ${amulets.map((a) => `${a.name}(cd=${a.countdown})`).join(", ")}`,
      );
    }
  } else if (mechanic === "artifact_gear") {
    const gear = p.hand.filter(
      (n) =>
        n === "Gear of Ambition" ||
        n === "Gear of Remembrance" ||
        n === "Puppet" ||
        n === "Enhanced Puppet" ||
        n === "Striker Artifact" ||
        n === "Fortifier Artifact" ||
        /^Ominous Artifact/.test(n) ||
        (n.includes("Artifact") &&
          n !== "Artifact Recharge" &&
          n !== "Artifact Catapult"),
    );
    if (gear.length) {
      mechanicTriggered = true;
      notes.push(`Artifact/Gear tokens in hand: ${gear.join(", ")}`);
    }
    const arts = p.board.filter(
      (b) =>
        /Artifact/.test(b.name) ||
        b.name === "Fortifier Artifact" ||
        b.name === "Striker Artifact",
    );
    if (arts.length) {
      mechanicTriggered = true;
      notes.push(`Artifacts on board: ${arts.map((a) => a.name).join(", ")}`);
    }
  }

  return { mechanicTriggered, notes, consoleErrors: [...consoleErrors] };
}

async function snapshot(page: Page) {
  return readJson<{ round: number; phase: string; first: PlayerSnap }>(
    page,
    `(() => {
      const s = window.gameState;
      const p = s.players.first;
      const hand = (p.hand || []).map((c) => c.name);
      const board = (p.board || []).map((c) => ({
        name: c.name,
        type: c.type,
        countdown: c.countdown != null ? c.countdown : c.count,
      }));
      const boosts = (p.hand || []).map((c) => c.spellboostCount || 0);
      return {
        round: s.roundCount,
        phase: s.phase,
        first: {
          deckFile: p.deckFile,
          hp: p.hp,
          pp: p.pp,
          maxPP: p.maxPP,
          hand,
          board,
          shadows: p.shadows,
          rally: p.rally,
          playsThisTurn: p.playsThisTurn,
          cardsPlayed: p.totalCardsPlayed,
          spellboostMax: boosts.length ? Math.max.apply(null, boosts) : 0,
          handHasGear: hand.some((n) => /Gear|Artifact|Puppet/.test(n)),
        },
      };
    })()`,
  );
}

async function playtestOne(
  browser: Browser,
  deck: (typeof DECKS)[number],
): Promise<Result> {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const empty: PlayerSnap = {
    hp: 0,
    pp: 0,
    maxPP: 0,
    hand: [],
    board: [],
    shadows: 0,
    rally: 0,
    playsThisTurn: 0,
    cardsPlayed: 0,
    spellboostMax: 0,
    handHasGear: false,
  };

  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForSelector("#blueDeckSelect", { timeout: 15_000 });
    await page.waitForSelector(`#blueDeckSelect option[value="${deck.id}"]`, {
      state: "attached",
      timeout: 10_000,
    });

    await page.selectOption("#blueDeckSelect", deck.id);
    await page.selectOption("#redDeckSelect", "starter_deck");
    await page.locator("#seedInput").fill(String(deck.seed));
    await page.locator("#startGameBtn").click();

    await page.waitForFunction(
      `window.gameState && (window.gameState.phase === "mulligan" || window.gameState.gameStarted === true)`,
      { timeout: 15_000 },
    );

    // Confirm mulligans (keep all)
    for (const id of ["#blueMulliganConfirm", "#redMulliganConfirm"]) {
      const btn = page.locator(id);
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(200);
      }
    }

    await page.waitForFunction(
      `window.gameState && window.gameState.phase === "main"`,
      { timeout: 15_000 },
    );

    const turnBudget = deck.mechanic === "overflow" ? 16 : 12;
    for (let t = 0; t < turnBudget; t++) {
      await dismissOverlays(page);
      await playCheapCards(page);
      await endTurn(page);

      const mid = await snapshot(page);
      const assessed = assess(mid, deck.mechanic, consoleErrors);
      if (assessed.mechanicTriggered) {
        if (deck.mechanic === "overflow" && mid.first.maxPP < 7 && t < 12) {
          continue;
        }
        if (t >= 3) break;
      }
    }

    const snap = await snapshot(page);
    const assessed = assess(snap, deck.mechanic, consoleErrors);
    const deckOk =
      !!snap.first.deckFile && snap.first.deckFile.includes(deck.id);
    const cardsOk = snap.first.hand.length > 0;
    const noErr = assessed.consoleErrors.length === 0;
    const ok = Boolean(
      deckOk && cardsOk && noErr && assessed.mechanicTriggered,
    );

    return {
      id: deck.id,
      ok,
      mechanic: deck.mechanic,
      ...assessed,
      round: snap.round,
      phase: snap.phase,
      first: snap.first,
      error: ok
        ? undefined
        : !assessed.mechanicTriggered
          ? `mechanic ${deck.mechanic} did not trigger`
          : !noErr
            ? `console errors`
            : !deckOk
              ? `bad deckFile ${snap.first.deckFile}`
              : "cards did not resolve",
    };
  } catch (e) {
    return {
      id: deck.id,
      ok: false,
      mechanic: deck.mechanic,
      mechanicTriggered: false,
      notes: [],
      consoleErrors: [...consoleErrors],
      round: 0,
      phase: "?",
      first: empty,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const probe = await fetch(BASE).catch(() => null);
  if (!probe || !probe.ok) {
    console.error(`Dev server not reachable at ${BASE}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const results: Result[] = [];

  for (const deck of DECKS) {
    console.log(`\n=== Playtesting ${deck.id} (${deck.mechanic}) ===`);
    const result = await playtestOne(browser, deck);
    results.push(result);
    console.log(
      result.ok ? "✅" : "❌",
      deck.id,
      `r${result.round}`,
      result.notes.join("; ") || result.error || "",
      result.consoleErrors.length
        ? `ERRS=${result.consoleErrors.length}`
        : "no-console-errors",
    );
    if (result.consoleErrors.length) {
      for (const e of result.consoleErrors.slice(0, 3)) {
        console.log("   ↳", e.slice(0, 200));
      }
    }
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`Summary: ${summary.passed} passed, ${summary.failed} failed`);
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
