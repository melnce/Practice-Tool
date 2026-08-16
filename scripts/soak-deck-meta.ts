#!/usr/bin/env tsx
/**
 * Pinned soak for dragoncraft_meta — mirror + vs two other shipped decks.
 * Run: npx tsx scripts/soak-deck-meta.ts [--games=N] [--seed=N]
 *
 * Reports → reports/soak-deck-meta/
 */

(globalThis as any).HEADLESS = true;
process.env.DISABLE_HISTORY = process.env.DISABLE_HISTORY ?? "1";

import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const REPORT_DIR = join(ROOT, "reports", "soak-deck-meta");

const META_DECK = "dragoncraft_meta";
const OPPONENTS = ["dragoncraft_overflow", "swordcraft_rally"] as const;

/** 14 distinct cards in dragoncraft_meta (id → name). */
const META_CARD_IDS: Record<string, string> = {
  "10403120": "Lyria, Skydestined",
  "10644120": "Vorlalai, Eld Blades",
  "10741110": "Dragonewt Promoter",
  "10543310": "Sloth of the Crestpetal",
  "10342210": "Nation of Disdain",
  "10304120": "Gilnelise, Voracity Manifest",
  "10042310": "Dragonsign",
  "10503310": "Fate of the World",
  "10344120": "Galmieux, Ardor Manifest",
  "10444120": "Zooey, Ally of the World",
  "10644110": "Sagatsumatsu, Fair Beheader",
  "10844120": "Lumiore & Argente, Shining Wings",
  "10744110": "Burnite, Anathema of Ash",
  "10544110": "Erntz, Governing Justice",
};

type Matchup = { deckAId: string; deckBId: string; label: string };

function installHeadlessGlobals(): void {
  const noop = () => {};
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = {
      addEventListener: noop,
      removeEventListener: noop,
      location: { search: "" },
      cardDatabase: {},
      APP_ROOT: "/",
    };
  }
  if (typeof (globalThis as any).document === "undefined") {
    (globalThis as any).document = {
      addEventListener: noop,
      removeEventListener: noop,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        classList: { add: noop, remove: noop, toggle: noop },
        appendChild: noop,
        append: noop,
        innerHTML: "",
        setAttribute: noop,
        getAttribute: () => null,
        textContent: "",
        dataset: {},
      }),
      body: {
        appendChild: noop,
        classList: { add: noop, remove: noop, toggle: noop },
      },
    };
  }
}

async function installFsFetch(): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");
  const MIME: Record<string, string> = {
    ".json": "application/json",
    ".html": "text/html",
  };
  (globalThis as any).fetch = async (url: string) => {
    const cleanUrl = String(url)
      .split("?")[0]!
      .replace(/^[./]+/, "")
      .replace(/^\//, "");
    const potentialPath = path.resolve(ROOT, cleanUrl);
    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      const content = fs.readFileSync(potentialPath, "utf-8");
      const ext = path.extname(potentialPath).toLowerCase();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get(name: string) {
            if (name.toLowerCase() === "content-type")
              return MIME[ext] ?? "application/octet-stream";
            return null;
          },
        },
        text: async () => content,
        json: async () => JSON.parse(content),
      };
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      text: async () => "",
      json: async () => {
        throw new Error("not found");
      },
    };
  };
}

function parseArgs(): { gamesPerMatchup: number; seed: number } {
  let gamesPerMatchup = 20;
  let seed = 20260816;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--games="))
      gamesPerMatchup = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--seed=")) seed = parseInt(arg.slice(7), 10);
  }
  return { gamesPerMatchup, seed };
}

function buildMatchups(): Matchup[] {
  return [
    {
      deckAId: META_DECK,
      deckBId: META_DECK,
      label: `${META_DECK} vs ${META_DECK}`,
    },
    ...OPPONENTS.map((opp) => ({
      deckAId: META_DECK,
      deckBId: opp,
      label: `${META_DECK} vs ${opp}`,
    })),
  ];
}

async function main(): Promise<void> {
  installHeadlessGlobals();
  await installFsFetch();

  const { gamesPerMatchup, seed } = parseArgs();
  const matchups = buildMatchups();
  const totalGames = gamesPerMatchup * matchups.length;
  mkdirSync(REPORT_DIR, { recursive: true });

  const { initCardDatabaseNode } = await import(
    pathToFileURL(resolve(ROOT, "src/data/cardLoaderNode.ts")).href
  );
  await initCardDatabaseNode();

  const { runSoakGame } = await import(
    pathToFileURL(resolve(ROOT, "src/bench/soakEnv.ts")).href
  );
  const { CoverageTracker } = await import(
    pathToFileURL(resolve(ROOT, "src/bench/soakCoverage.ts")).href
  );
  const { getImplementationStatus } = await import(
    pathToFileURL(resolve(ROOT, "src/data/cardImplementationStatus.ts")).href
  );
  const { getGlobalCardIndex } = await import(
    pathToFileURL(resolve(ROOT, "src/data/cardIndex.ts")).href
  );

  const index = getGlobalCardIndex()!;
  const opsStatus: Record<string, string> = {};
  for (const [id, name] of Object.entries(META_CARD_IDS)) {
    const card = index.byId.get(id);
    opsStatus[id] = card ? getImplementationStatus(card, id) : "card_not_found";
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         DRAGON META DECK — PINNED SOAK                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(
    `games=${totalGames} (${gamesPerMatchup} per matchup) seed=${seed}`,
  );
  console.log(`reports → ${REPORT_DIR}\n`);

  console.log("ops_present status for 14 deck cards:");
  for (const [id, name] of Object.entries(META_CARD_IDS)) {
    console.log(`  [${id}] ${name}: ${opsStatus[id]}`);
  }
  console.log("");

  const coverage = new CoverageTracker();
  const summary = {
    seed,
    deck: META_DECK,
    gamesPerMatchup,
    totalGames,
    matchups: matchups.map((m) => m.label),
    gamesPlayed: 0,
    completed: 0,
    withWinner: 0,
    crashes: 0,
    hangs: 0,
    invariants: 0,
    opsStatus,
    exercisedCards: {} as Record<string, { name: string; buckets: string[] }>,
    unexercisedCards: [] as Array<{ id: string; name: string; note: string }>,
    findings: [] as Array<{
      gameIndex: number;
      matchup: string;
      outcome: string;
      error?: string;
    }>,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
  };

  const t0 = performance.now();
  let gameIndex = 0;

  for (const matchup of matchups) {
    for (let i = 0; i < gamesPerMatchup; i++) {
      const result = await runSoakGame({
        seed,
        gameIndex,
        deckAId: matchup.deckAId,
        deckBId: matchup.deckBId,
        coverage,
      });
      summary.gamesPlayed++;
      if (result.outcome === "completed") {
        summary.completed++;
        if (result.winner) summary.withWinner++;
      } else if (result.outcome === "crash") summary.crashes++;
      else if (result.outcome === "hang") summary.hangs++;
      else if (result.outcome === "invariant") summary.invariants++;

      if (result.outcome !== "completed") {
        summary.findings.push({
          gameIndex,
          matchup: matchup.label,
          outcome: result.outcome,
          error: result.error,
        });
        console.log(
          `[FINDING] ${matchup.label} game ${gameIndex}: ${result.outcome} — ${result.error?.slice(0, 120)}`,
        );
      } else if ((gameIndex + 1) % 20 === 0) {
        console.log(
          `  … ${gameIndex + 1}/${totalGames} ok (turns=${result.turns} winner=${result.winner ?? "?"})`,
        );
      }
      gameIndex++;
    }
  }

  const coverageReport = coverage.report();
  for (const [id, detail] of Object.entries(coverageReport.touchedDetails)) {
    if (id in META_CARD_IDS) {
      summary.exercisedCards[id] = {
        name: detail.name,
        buckets: detail.buckets,
      };
    }
  }

  const highCostNotes: Record<string, string> = {
    "10644110": "7-cost — may not always be played under random soak policy",
    "10844120": "8-cost — may not always be played under random soak policy",
    "10744110": "9-cost — rarely reached before game ends in soak",
    "10544110": "10-cost — rarely reached before game ends in soak",
    "10304120": "1-copy 3-cost — lower exposure than 3-of lines",
  };

  for (const [id, name] of Object.entries(META_CARD_IDS)) {
    if (!summary.exercisedCards[id]) {
      summary.unexercisedCards.push({
        id,
        name,
        note:
          highCostNotes[id] ??
          "Not exercised in soak coverage buckets (played/evolved/engaged/on board/graveyard)",
      });
    }
  }

  summary.finishedAt = new Date().toISOString();
  summary.durationMs = performance.now() - t0;

  const summaryPath = join(REPORT_DIR, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  writeFileSync(
    join(REPORT_DIR, "coverage.json"),
    JSON.stringify(coverageReport, null, 2),
  );

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("PINNED SOAK SUMMARY");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`gamesPlayed:          ${summary.gamesPlayed}`);
  console.log(`completed:            ${summary.completed}`);
  console.log(`withWinner:           ${summary.withWinner}`);
  console.log(`crashes:              ${summary.crashes}`);
  console.log(`hangs:                ${summary.hangs}`);
  console.log(`invariantViolations:  ${summary.invariants}`);
  console.log(
    `exercised (of 14):    ${Object.keys(summary.exercisedCards).length}`,
  );
  if (summary.unexercisedCards.length) {
    console.log("unexercised:");
    for (const u of summary.unexercisedCards) {
      console.log(`  [${u.id}] ${u.name} — ${u.note}`);
    }
  }
  console.log(
    `duration:             ${(summary.durationMs / 1000).toFixed(1)}s`,
  );
  console.log(`summary:              ${summaryPath}`);

  const failed = summary.crashes + summary.hangs + summary.invariants;
  if (failed > 0) {
    console.log(`\n${failed} finding(s)`);
    process.exitCode = 1;
  } else {
    console.log("\nAll pinned soak games clean.");
  }
}

main().catch((err) => {
  console.error("Pinned soak failed:", err);
  process.exit(1);
});
