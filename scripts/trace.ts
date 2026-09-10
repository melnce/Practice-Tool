// scripts/trace.ts
// Headless JSONL trace emitter for differential oracle testing.
// Run: npm run trace -- --seed=<u64> --games=<N> --deck-a=<file.json> --deck-b=<file.json> --out=<dir>

(globalThis as any).HEADLESS = true;
process.env.NODE_ENV ??= "test";
process.env.DISABLE_HISTORY = process.env.DISABLE_HISTORY ?? "1";

import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

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
  (globalThis as any).fetch = async (url: string) => {
    const cleanUrl = String(url)
      .split("?")[0]!
      .replace(/^[./]+/, "")
      .replace(/^\//, "");
    const potentialPath = path.resolve(ROOT, cleanUrl);
    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      const content = fs.readFileSync(potentialPath, "utf-8");
      return {
        ok: true,
        status: 200,
        headers: {
          get: (n: string) =>
            n.toLowerCase() === "content-type" ? "application/json" : null,
        },
        text: async () => content,
        json: async () => JSON.parse(content),
      };
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => "",
      json: async () => {
        throw new Error("not found");
      },
    };
  };
}

type TraceCliConfig = {
  seed: number;
  games: number;
  deckA: string;
  deckB: string;
  out: string;
  turnCap: number;
  actionCap: number;
};

function parseArgs(): TraceCliConfig {
  const args = process.argv.slice(2);
  const config: TraceCliConfig = {
    seed: 20260910,
    games: 1,
    deckA: "",
    deckB: "",
    out: join(ROOT, "reports", "traces"),
    turnCap: 60,
    actionCap: 800,
  };
  for (const arg of args) {
    if (arg.startsWith("--seed=")) config.seed = parseInt(arg.slice(7), 10);
    else if (arg.startsWith("--games="))
      config.games = parseInt(arg.slice(8), 10);
    else if (arg.startsWith("--deck-a=")) config.deckA = arg.slice(9);
    else if (arg.startsWith("--deck-b=")) config.deckB = arg.slice(9);
    else if (arg.startsWith("--out=")) config.out = arg.slice(6);
    else if (arg.startsWith("--turn-cap="))
      config.turnCap = parseInt(arg.slice(11), 10);
    else if (arg.startsWith("--action-cap="))
      config.actionCap = parseInt(arg.slice(13), 10);
  }
  if (!config.deckA || !config.deckB) {
    throw new Error("--deck-a and --deck-b are required");
  }
  return config;
}

function loadDeck(path: string): Record<string, number> {
  const abs = resolve(ROOT, path);
  return JSON.parse(readFileSync(abs, "utf-8")) as Record<string, number>;
}

async function main(): Promise<void> {
  installHeadlessGlobals();
  await installFsFetch();

  const config = parseArgs();
  mkdirSync(resolve(ROOT, config.out), { recursive: true });

  const { initCardDatabaseNode } = await import(
    pathToFileURL(resolve(ROOT, "src/data/cardLoaderNode.ts")).href
  );
  await initCardDatabaseNode();

  const { runTraceGame, formatTraceJsonl } = await import(
    pathToFileURL(resolve(ROOT, "src/bench/trace/traceRunner.ts")).href
  );

  const deckA = loadDeck(config.deckA);
  const deckB = loadDeck(config.deckB);

  console.log(
    `trace seed=${config.seed} games=${config.games} deckA=${config.deckA} deckB=${config.deckB} out=${config.out}`,
  );

  let failures = 0;
  for (let i = 0; i < config.games; i++) {
    const gameSeed = config.seed + i * 1_000_003;
    try {
      const result = await runTraceGame({
        seed: config.seed,
        gameIndex: i,
        deckA,
        deckB,
        turnCap: config.turnCap,
        actionCap: config.actionCap,
      });
      if (result.completion !== "terminal") {
        throw new Error(
          `game ${i} did not end terminal (completion=${result.completion}, actions=${result.lines.length})`,
        );
      }
      const outPath = join(
        resolve(ROOT, config.out),
        `trace-${config.seed}-${i}.jsonl`,
      );
      writeFileSync(outPath, formatTraceJsonl(result.header, result.lines));
      console.log(
        `  game ${i} seed=${gameSeed} actions=${result.lines.length} hash=${result.finalHash} → ${outPath}`,
      );
    } catch (err) {
      failures++;
      console.error(`  game ${i} FAILED:`, err);
    }
  }

  if (failures > 0) {
    console.error(`trace: ${failures}/${config.games} game(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("trace failed:", err);
  process.exit(1);
});
