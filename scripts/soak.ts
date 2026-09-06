// scripts/soak.ts
// Engine soak harness — hundreds of seeded random games across the full card pool.
// Run: npm run soak -- [--games=N] [--seed=N] [--smoke] [--history] [--positions] [--determinism=N]
// Opt-in paths (off by default): --fuse --interactive-modes --all-paths (both)
//
// NODE_ENV defaults to "test" so dev-mode engine guards (targeted-op lifecycle,
// unknown op actions, etc.) throw instead of warn — soak must not run blind.
//
// Reports land in reports/soak/

(globalThis as any).HEADLESS = true;
process.env.NODE_ENV ??= "test";
// History is off by default for soak throughput; --history / --smoke / --positions enable round-trip checks.
if (
  !process.argv.includes("--history") &&
  !process.argv.includes("--smoke") &&
  !process.argv.includes("--positions")
) {
  process.env.DISABLE_HISTORY = process.env.DISABLE_HISTORY ?? "1";
}

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const REPORT_DIR = join(ROOT, "reports", "soak");

// ---------------------------------------------------------------------------
// Headless browser stubs + filesystem fetch (mirrors tests/fixtures/setup.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

type SoakCliConfig = {
  games: number;
  seed: number;
  smoke: boolean;
  history: boolean;
  historyIgnore: string[];
  historyReExecute: boolean;
  positions: boolean;
  dispatch: "engine" | "core";
  determinism: number;
  turnCap: number;
  actionCap: number;
  fuse: boolean;
  interactiveModes: boolean;
};

function parseArgs(): SoakCliConfig {
  const args = process.argv.slice(2);
  const config: SoakCliConfig = {
    games: 400,
    seed: 20260815,
    smoke: false,
    history: false,
    historyIgnore: [],
    historyReExecute: false,
    positions: false,
    dispatch: "engine",
    determinism: 20,
    turnCap: 60,
    actionCap: 800,
    fuse: false,
    interactiveModes: false,
  };
  for (const arg of args) {
    if (arg.startsWith("--games=")) config.games = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--seed="))
      config.seed = parseInt(arg.slice(7), 10);
    else if (arg === "--smoke") {
      config.smoke = true;
      config.games = 8;
      config.determinism = 2;
      config.history = true;
    } else if (arg === "--history") config.history = true;
    else if (arg.startsWith("--history-ignore=")) {
      config.historyIgnore = arg
        .slice(17)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--history-reexecute") config.historyReExecute = true;
    else if (arg === "--positions") config.positions = true;
    else if (arg.startsWith("--dispatch=")) {
      const v = arg.slice(11);
      if (v === "engine" || v === "core") config.dispatch = v;
      else throw new Error(`--dispatch must be engine|core, got ${v}`);
    } else if (arg.startsWith("--determinism="))
      config.determinism = parseInt(arg.slice(14), 10);
    else if (arg.startsWith("--turn-cap="))
      config.turnCap = parseInt(arg.slice(11), 10);
    else if (arg.startsWith("--action-cap="))
      config.actionCap = parseInt(arg.slice(13), 10);
    else if (arg === "--fuse") config.fuse = true;
    else if (arg === "--interactive-modes") config.interactiveModes = true;
    else if (arg === "--all-paths") {
      config.fuse = true;
      config.interactiveModes = true;
    }
  }
  return config;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  installHeadlessGlobals();
  await installFsFetch();

  const config = parseArgs();
  mkdirSync(REPORT_DIR, { recursive: true });

  const { initCardDatabaseNode } = await import(
    pathToFileURL(resolve(ROOT, "src/data/cardLoaderNode.ts")).href
  );
  await initCardDatabaseNode();

  const soakEnv = await import(
    pathToFileURL(resolve(ROOT, "src/bench/soakEnv.ts")).href
  );
  if (
    (config.history || config.positions) &&
    config.historyIgnore.length === 0
  ) {
    config.historyIgnore = [...soakEnv.PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS];
  }
  const { CoverageTracker } = await import(
    pathToFileURL(resolve(ROOT, "src/bench/soakCoverage.ts")).href
  );

  const coverage = new CoverageTracker();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              SHADOWVERSE ENGINE SOAK                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(
    `games=${config.games} seed=${config.seed} determinism=${config.determinism} turnCap=${config.turnCap} history=${config.history} positions=${config.positions} dispatch=${config.dispatch} historyReExecute=${config.historyReExecute} historyIgnore=${config.historyIgnore.join("|") || "(none)"} fuse=${config.fuse} interactiveModes=${config.interactiveModes}`,
  );
  console.log(`reports → ${REPORT_DIR}`);
  console.log("");

  let smokeNoHistoryMs: number | undefined;

  if (config.smoke && config.history) {
    console.log("Timing 8 smoke games without history check…");
    const tNoHistory = performance.now();
    for (let i = 0; i < 8; i++) {
      await soakEnv.runSoakGame({
        seed: config.seed,
        gameIndex: i,
        turnCap: config.turnCap,
        actionCap: config.actionCap,
        fuse: config.fuse,
        interactiveModes: config.interactiveModes,
      });
    }
    smokeNoHistoryMs = performance.now() - tNoHistory;
    console.log(
      `  without history: ${(smokeNoHistoryMs / 1000).toFixed(2)}s (${(smokeNoHistoryMs / 8).toFixed(0)}ms/game)`,
    );
    console.log("");
  }

  const summary = {
    seed: config.seed,
    gamesRequested: config.games,
    gamesPlayed: 0,
    completed: 0,
    crashes: 0,
    hangs: 0,
    invariants: 0,
    history: 0,
    historyCheck: config.history,
    historyIgnoreFields: config.historyIgnore,
    dispatch: config.dispatch,
    historyReExecute: config.historyReExecute,
    nonUndoableActionTypes: [] as string[],
    playBlockedCount: 0,
    playBlockedReasons: {} as Record<string, number>,
    zeroCommitReasons: {} as Record<string, number>,
    historyViolationKinds: {} as Record<string, number>,
    positionCheck: config.positions,
    positionViolations: 0,
    positionChecks: 0,
    positionViolationKinds: {} as Record<string, number>,
    actionTypeCounts: {} as Record<string, number>,
    totalActionsCompleted: 0,
    determinismChecks: 0,
    determinismFailures: 0,
    byRegime: { shipped: 0, random: 0 },
    findings: [] as Array<{
      gameIndex: number;
      outcome: string;
      error?: string;
      reproFile?: string;
    }>,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
    coveragePath: join(REPORT_DIR, "coverage.json"),
  };

  const t0 = performance.now();
  const nonUndoableUnion = new Set<string>();
  const actionTypeTotals: Record<string, number> = {};

  for (let i = 0; i < config.games; i++) {
    const result = await soakEnv.runSoakGame({
      seed: config.seed,
      gameIndex: i,
      turnCap: config.turnCap,
      actionCap: config.actionCap,
      coverage,
      historyCheck: config.history,
      historyIgnoreFields: config.historyIgnore,
      dispatch: config.dispatch,
      historyReExecute: config.historyReExecute,
      positionCheck: config.positions,
      fuse: config.fuse,
      interactiveModes: config.interactiveModes,
    });
    summary.gamesPlayed++;
    summary.byRegime[result.regime]++;

    for (const [type, count] of Object.entries(result.actionTypeCounts ?? {})) {
      summary.actionTypeCounts[type] =
        (summary.actionTypeCounts[type] ?? 0) + count;
      actionTypeTotals[type] = (actionTypeTotals[type] ?? 0) + count;
    }

    if (i === 0 && result.commitSequence?.length) {
      const seq = result.commitSequence
        .map((e) => `${e.actionType}:${e.commits}`)
        .join(", ");
      console.log(`game 0 commit sequence: [${seq}]`);
    }

    for (const t of result.nonUndoableActionTypes ?? []) {
      nonUndoableUnion.add(t);
    }
    for (const entry of result.playBlockedLog ?? []) {
      summary.playBlockedCount++;
      summary.playBlockedReasons[entry.reason] =
        (summary.playBlockedReasons[entry.reason] ?? 0) + 1;
    }
    for (const entry of result.zeroCommitLog ?? []) {
      summary.zeroCommitReasons[entry.reason] =
        (summary.zeroCommitReasons[entry.reason] ?? 0) + 1;
    }
    summary.positionChecks += result.positionChecks ?? 0;
    if (result.outcome === "completed") {
      summary.completed++;
      summary.totalActionsCompleted += result.actions;
    } else if (result.outcome === "crash") summary.crashes++;
    else if (result.outcome === "hang") summary.hangs++;
    else if (result.outcome === "invariant") summary.invariants++;
    else if (result.outcome === "history") {
      summary.history++;
      const err = result.error ?? "";
      const kind = err.startsWith("history chain-undo")
        ? "chain-undo"
        : err.startsWith("history chain-redo")
          ? "chain-redo"
          : err.includes("re-execute")
            ? "re-execute"
            : err.includes("redo×")
              ? "redo"
              : err.includes("undo×")
                ? "undo"
                : err.includes("legal-")
                  ? "legal"
                  : "other";
      summary.historyViolationKinds[kind] =
        (summary.historyViolationKinds[kind] ?? 0) + 1;
    } else if (result.outcome === "position") {
      summary.positionViolations++;
      const err = result.error ?? "";
      const kind = err.startsWith("position save-load")
        ? "save-load"
        : err.startsWith("position export-import")
          ? "export-import"
          : err.startsWith("position checkpoint")
            ? "checkpoint"
            : err.startsWith("position reroll")
              ? "reroll"
              : "other";
      summary.positionViolationKinds[kind] =
        (summary.positionViolationKinds[kind] ?? 0) + 1;
    }

    if (result.outcome !== "completed") {
      const reproFile = join(
        REPORT_DIR,
        `repro_seed${config.seed}_game${i}_${result.outcome}.json`,
      );
      writeFileSync(
        reproFile,
        JSON.stringify(
          {
            seed: config.seed,
            gameIndex: i,
            gameSeed: config.seed + i * 1_000_003,
            regime: result.regime,
            deckAId: result.deckAId,
            deckBId: result.deckBId,
            deckARaw: result.deckARaw ?? null,
            deckBRaw: result.deckBRaw ?? null,
            outcome: result.outcome,
            error: result.error,
            findings: result.findings,
            turns: result.turns,
            actions: result.actions,
            trace: result.trace,
            nonUndoableActionTypes: result.nonUndoableActionTypes ?? [],
            commitSequence: result.commitSequence ?? [],
            zeroCommitLog: result.zeroCommitLog ?? [],
          },
          null,
          2,
        ),
      );
      summary.findings.push({
        gameIndex: i,
        outcome: result.outcome,
        error: result.error,
        reproFile,
      });
      console.log(
        `[FINDING] game ${i} ${result.outcome}: ${result.error?.slice(0, 120)}`,
      );
    } else if ((i + 1) % 25 === 0 || i === 0) {
      console.log(
        `  … ${i + 1}/${config.games} ok (turns=${result.turns} actions=${result.actions} regime=${result.regime})`,
      );
    }

    // Determinism spot-check on a subsample of completed games
    if (
      result.outcome === "completed" &&
      summary.determinismChecks < config.determinism &&
      i %
        Math.max(
          1,
          Math.floor(config.games / Math.max(1, config.determinism)),
        ) ===
        0
    ) {
      summary.determinismChecks++;
      const again = await soakEnv.runSoakGame({
        seed: config.seed,
        gameIndex: i,
        turnCap: config.turnCap,
        actionCap: config.actionCap,
        skipInvariants: true,
        fuse: config.fuse,
        interactiveModes: config.interactiveModes,
      });
      if (
        again.outcome !== "completed" ||
        again.finalHash !== result.finalHash
      ) {
        summary.determinismFailures++;
        const reproFile = join(
          REPORT_DIR,
          `repro_seed${config.seed}_game${i}_determinism.json`,
        );
        writeFileSync(
          reproFile,
          JSON.stringify(
            {
              seed: config.seed,
              gameIndex: i,
              hash1: result.finalHash,
              hash2: again.finalHash,
              outcome1: result.outcome,
              outcome2: again.outcome,
              error2: again.error,
              trace1: result.trace,
              trace2: again.trace,
            },
            null,
            2,
          ),
        );
        summary.findings.push({
          gameIndex: i,
          outcome: "determinism_mismatch",
          error: `hash ${result.finalHash} vs ${again.finalHash}`,
          reproFile,
        });
        console.log(`[P0] determinism mismatch game ${i}`);
      }
    }
  }

  const coverageReport = coverage.report();
  writeFileSync(summary.coveragePath, JSON.stringify(coverageReport, null, 2));

  summary.finishedAt = new Date().toISOString();
  summary.durationMs = performance.now() - t0;
  summary.nonUndoableActionTypes = [...nonUndoableUnion].sort();

  const summaryPath = join(REPORT_DIR, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("SOAK SUMMARY");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`gamesPlayed:          ${summary.gamesPlayed}`);
  console.log(`completed:            ${summary.completed}`);
  console.log(`crashes:              ${summary.crashes}`);
  console.log(`hangs:                ${summary.hangs}`);
  console.log(`invariantViolations:  ${summary.invariants}`);
  console.log(`historyViolations:  ${summary.history}`);
  console.log(`positionChecks:     ${summary.positionChecks}`);
  console.log(`positionViolations: ${summary.positionViolations}`);
  console.log(
    `nonUndoableTypes:   ${summary.nonUndoableActionTypes.join(", ") || "(none)"}`,
  );
  if (summary.playBlockedCount > 0) {
    const topBlocked = Object.entries(summary.playBlockedReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason, n]) => `${reason}×${n}`)
      .join(", ");
    console.log(
      `playBlocked:        ${summary.playBlockedCount} (${topBlocked})`,
    );
  }
  const zeroCommitEntries = Object.entries(summary.zeroCommitReasons);
  if (zeroCommitEntries.length > 0) {
    const topZero = zeroCommitEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, n]) => `${reason.slice(0, 60)}×${n}`)
      .join("; ");
    console.log(`zeroCommitReasons:  ${topZero}`);
  }
  const histKinds = Object.entries(summary.historyViolationKinds);
  if (histKinds.length > 0) {
    console.log(
      `historyKinds:       ${histKinds
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}×${n}`)
        .join(", ")}`,
    );
  }
  const posKinds = Object.entries(summary.positionViolationKinds);
  if (posKinds.length > 0) {
    console.log(
      `positionKinds:      ${posKinds
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}×${n}`)
        .join(", ")}`,
    );
  }
  if (summary.completed > 0) {
    console.log(
      `avgActions/game:    ${(summary.totalActionsCompleted / summary.completed).toFixed(1)}`,
    );
  }
  if (config.fuse || config.interactiveModes) {
    const modeCount = summary.actionTypeCounts.CHOOSE_MODE ?? 0;
    const fuseCount = summary.actionTypeCounts.FUSE ?? 0;
    console.log(
      `actionTypeCounts:   CHOOSE_MODE=${modeCount} FUSE=${fuseCount}`,
    );
  }
  console.log(
    `determinism:          ${summary.determinismChecks} checks, ${summary.determinismFailures} failures`,
  );
  console.log(
    `regimes:              shipped=${summary.byRegime.shipped} random=${summary.byRegime.random}`,
  );
  console.log(
    `coverage:             ${coverageReport.touched}/${coverageReport.totalPool} touched; ${coverageReport.untouched} untouched`,
  );
  console.log(
    `duration:             ${(summary.durationMs / 1000).toFixed(1)}s`,
  );
  if (config.smoke && config.history && smokeNoHistoryMs != null) {
    const historyMs = summary.durationMs;
    console.log(
      `history timing:       without=${(smokeNoHistoryMs / 1000).toFixed(2)}s with=${(historyMs / 1000).toFixed(2)}s overhead=${((historyMs / smokeNoHistoryMs - 1) * 100).toFixed(0)}%`,
    );
  }
  console.log(`summary:              ${summaryPath}`);
  console.log(`coverage:             ${summary.coveragePath}`);

  const failed =
    summary.crashes +
    summary.hangs +
    summary.invariants +
    summary.history +
    summary.positionViolations +
    summary.determinismFailures;
  if (failed > 0) {
    console.log(`\n${failed} finding(s) — see reports/soak/repro_*.json`);
    process.exitCode = 1;
  } else {
    console.log("\nAll games clean.");
  }
}

main().catch((err) => {
  console.error("Soak failed:", err);
  process.exit(1);
});
