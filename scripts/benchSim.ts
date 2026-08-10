// scripts/benchSim.ts
// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION BENCHMARK - Measures engine throughput (steps/sec)
// Run: npx tsx scripts/benchSim.ts [options]
// Options:
//   --seed=N          RNG seed (default: 42)
//   --warmup=N        Warmup steps (default: 20000)
//   --steps=N         Measurement steps (default: 100000)
//   --policy=MODE     normal|endturn|playcard (default: normal)
//   --breakdown       Enable timing breakdown
//   --use-dist        Load from dist/ instead of src/
//   --micro=N         Microbenchmark iterations (default: 50000)
//   --profile         Enable CPU profiling (inspector-based)
//   --profile-seconds=N  Duration for profile run (default: 30)
//   --no-progress     Disable progress output (auto-enabled with --profile)
// ─────────────────────────────────────────────────────────────────────────────

// STEP 1: Set up headless environment BEFORE any imports
(globalThis as any).HEADLESS = true;
// Disable history snapshots for benchmark performance (env var read by history.ts at load)
process.env.DISABLE_HISTORY = "1";
// Disable UID enrichment in triggers for benchmark performance
process.env.DISABLE_UID_ENRICH = "1";

// Mock window/document for browser-dependent code
if (typeof window === "undefined") {
  const noop = () => {};
  (globalThis as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { search: "" },
    cardDatabase: {},
    APP_ROOT: "/",
  };
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

import { performance } from "perf_hooks";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { pathToFileURL } from "url";
import { Session } from "inspector";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

type Policy = "normal" | "endturn" | "playcard";

interface BenchConfig {
  seed: number;
  warmupSteps: number;
  mainSteps: number;
  policy: Policy;
  breakdown: boolean;
  useDist: boolean;
  microIters: number;
  profile: boolean;
  profileSeconds: number;
  noProgress: boolean;
}

function parseArgs(): BenchConfig {
  const args = process.argv.slice(2);
  const config: BenchConfig = {
    seed: 42,
    warmupSteps: 20_000,
    mainSteps: 100_000,
    policy: "normal",
    breakdown: false,
    useDist: false,
    microIters: 50_000,
    profile: false,
    profileSeconds: 30,
    noProgress: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--seed=")) {
      config.seed = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith("--warmup=")) {
      config.warmupSteps = parseInt(arg.slice(9), 10);
    } else if (arg.startsWith("--steps=")) {
      config.mainSteps = parseInt(arg.slice(8), 10);
    } else if (arg.startsWith("--policy=")) {
      const p = arg.slice(9) as Policy;
      if (["normal", "endturn", "playcard"].includes(p)) {
        config.policy = p;
      }
    } else if (arg === "--breakdown") {
      config.breakdown = true;
    } else if (arg === "--use-dist") {
      config.useDist = true;
    } else if (arg.startsWith("--micro=")) {
      config.microIters = parseInt(arg.slice(8), 10);
    } else if (arg === "--profile") {
      config.profile = true;
    } else if (arg.startsWith("--profile-seconds=")) {
      config.profileSeconds = parseInt(arg.slice(18), 10);
    } else if (arg === "--no-progress") {
      config.noProgress = true;
    }
  }

  // Also check env var
  if (process.env.BENCH_BREAKDOWN === "1") {
    config.breakdown = true;
  }

  // Auto-enable noProgress in profile mode
  if (config.profile) {
    config.noProgress = true;
  }

  return config;
}

// =============================================================================
// Type aliases for dynamic imports
// =============================================================================

type BenchAction =
  | { type: "PLAY_CARD"; handIndex: number }
  | { type: "ATTACK_FOLLOWER"; attackerIdx: number; defenderIdx: number }
  | { type: "ATTACK_LEADER"; attackerIdx: number }
  | { type: "END_TURN" };

interface BenchEnvModule {
  reset: (seed: number) => void;
  getLegalActions: () => BenchAction[];
  applyAction: (action: BenchAction) => void;
  isTerminal: () => boolean;
  getStats: () => {
    firstHP: number;
    secondHP: number;
    firstBoardSize: number;
    secondBoardSize: number;
    firstHandSize: number;
    secondHandSize: number;
    turn: number;
    activePlayer: string;
  };
  benchTiming: {
    enabled: boolean;
    reset: () => void;
    summary: () => {
      byActionType: Record<
        string,
        { count: number; ms: number; avgUs: number }
      >;
      byStage: Record<
        string,
        { count: number; ms: number; pct: number; avgUs: number }
      >;
      totalApplyMs: number;
    };
  };
}

// =============================================================================
// STABLE ACTION ORDERING
// =============================================================================

/**
 * Generate a stable sort key for an action.
 * Ensures deterministic ordering regardless of engine's action generation order.
 */
function stableKey(action: BenchAction): string {
  switch (action.type) {
    case "PLAY_CARD":
      return `0_PLAY_${String(action.handIndex).padStart(3, "0")}`;
    case "ATTACK_FOLLOWER":
      return `1_ATKF_${String(action.attackerIdx).padStart(3, "0")}_${String(action.defenderIdx).padStart(3, "0")}`;
    case "ATTACK_LEADER":
      return `2_ATKL_${String(action.attackerIdx).padStart(3, "0")}`;
    case "END_TURN":
      return `3_END`;
  }
}

function sortActions(actions: BenchAction[]): BenchAction[] {
  return [...actions].sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
}

// =============================================================================
// ACTION SELECTION BY POLICY
// =============================================================================

function selectAction(
  actions: BenchAction[],
  stepCount: number,
  policy: Policy,
): BenchAction {
  // Sort for determinism first
  const sorted = sortActions(actions);

  if (policy === "endturn") {
    const endTurn = sorted.find((a) => a.type === "END_TURN");
    if (endTurn) return endTurn;
  }

  if (policy === "playcard") {
    const playCard = sorted.find((a) => a.type === "PLAY_CARD");
    if (playCard) return playCard;
  }

  // Fallback: deterministic selection from sorted list
  return sorted[stepCount % sorted.length]!;
}

// =============================================================================
// RESET CATEGORIES
// =============================================================================

interface ResetCounts {
  manual: number;
  terminal: number;
  error: number;
}

// =============================================================================
// TIMING ACCUMULATORS
// =============================================================================

interface TimeBreakdown {
  legalActionsMs: number;
  applyActionMs: number;
  resetCheckMs: number;
  totalMs: number;
}

// =============================================================================
// SIMULATION LOOP
// =============================================================================

interface SimResult {
  steps: number;
  resets: ResetCounts;
  durationMs: number;
  actionCounts: Record<string, number>;
  totalLegalActions: number;
  turnDelta: number;
  timing: TimeBreakdown;
  stepsPerTerminal: number; // avg steps between terminal resets
}

/**
 * Run simulation for N steps, starting from current state (no initial reset).
 * Returns timing and statistics.
 */
function stepLoop(
  env: BenchEnvModule,
  steps: number,
  policy: Policy,
  seed: number,
): SimResult {
  let stepCount = 0;
  let totalLegalActions = 0;
  const resets: ResetCounts = { manual: 0, terminal: 0, error: 0 };
  const actionCounts: Record<string, number> = {
    PLAY_CARD: 0,
    ATTACK_FOLLOWER: 0,
    ATTACK_LEADER: 0,
    END_TURN: 0,
  };

  // Timing accumulators
  let legalActionsMs = 0;
  let applyActionMs = 0;
  let resetCheckMs = 0;

  // Track steps between terminal resets for avg game length
  let stepsSinceLastTerminal = 0;
  let terminalGameLengths: number[] = [];

  // Get initial turn for delta calculation
  const statsStart = env.getStats();
  const turnStart = statsStart.turn;

  let resetSeed = seed;

  const totalStart = performance.now();

  while (stepCount < steps) {
    // Terminal check + reset
    const checkStart = performance.now();
    const terminal = env.isTerminal();
    resetCheckMs += performance.now() - checkStart;

    if (terminal) {
      if (stepsSinceLastTerminal > 0) {
        terminalGameLengths.push(stepsSinceLastTerminal);
      }
      stepsSinceLastTerminal = 0;
      const resetStart = performance.now();
      env.reset(resetSeed++);
      resetCheckMs += performance.now() - resetStart;
      resets.terminal++;
      continue;
    }

    // Get legal actions
    const legalStart = performance.now();
    const actions = env.getLegalActions();
    legalActionsMs += performance.now() - legalStart;

    // Error: no legal actions
    if (actions.length === 0) {
      console.warn(
        `[WARNING] No legal actions at step ${stepCount}. Resetting.`,
      );
      const resetStart = performance.now();
      env.reset(resetSeed++);
      resetCheckMs += performance.now() - resetStart;
      resets.error++;
      stepsSinceLastTerminal = 0;
      continue;
    }

    totalLegalActions += actions.length;

    // Select action by policy (with stable ordering)
    const action = selectAction(actions, stepCount, policy);

    // Track action type
    actionCounts[action.type]++;

    // Apply action
    const applyStart = performance.now();
    try {
      env.applyAction(action);
    } catch (e) {
      console.warn(`[ERROR] applyAction failed at step ${stepCount}:`, e);
      const resetStart = performance.now();
      env.reset(resetSeed++);
      resetCheckMs += performance.now() - resetStart;
      resets.error++;
      stepsSinceLastTerminal = 0;
      continue;
    }
    applyActionMs += performance.now() - applyStart;

    stepCount++;
    stepsSinceLastTerminal++;
  }

  const totalEnd = performance.now();

  // Get final turn for delta
  const statsEnd = env.getStats();
  const turnEnd = statsEnd.turn;

  // Avg game length
  const avgGameLength =
    terminalGameLengths.length > 0
      ? terminalGameLengths.reduce((a, b) => a + b, 0) /
        terminalGameLengths.length
      : steps; // If no terminal, whole run is one "game"

  return {
    steps: stepCount,
    resets,
    durationMs: totalEnd - totalStart,
    actionCounts,
    totalLegalActions,
    turnDelta: turnEnd - turnStart,
    timing: {
      legalActionsMs,
      applyActionMs,
      resetCheckMs,
      totalMs: totalEnd - totalStart,
    },
    stepsPerTerminal: avgGameLength,
  };
}

// =============================================================================
// MICROBENCHMARKS
// =============================================================================

interface MicroResult {
  name: string;
  iterations: number;
  durationMs: number;
  extra?: string;
}

function microGetLegalActions(
  env: BenchEnvModule,
  seed: number,
  iterations: number,
): MicroResult {
  env.reset(seed);
  let totalActions = 0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const actions = env.getLegalActions();
    totalActions += actions.length;

    // Occasionally change state to vary workload
    if (i % 100 === 0 && actions.length > 0) {
      const sorted = sortActions(actions);
      env.applyAction(sorted[i % sorted.length]!);
      if (env.isTerminal()) {
        env.reset(seed + i);
      }
    }
  }
  const end = performance.now();

  const avgActions = (totalActions / iterations).toFixed(1);
  return {
    name: "getLegalActions()",
    iterations,
    durationMs: end - start,
    extra: `avg ${avgActions} actions`,
  };
}

/**
 * Microbenchmark applyAction in isolation.
 * Pre-records a trace of actions to replay, avoiding getLegalActions cost.
 */
function microApplyAction(
  env: BenchEnvModule,
  seed: number,
  iterations: number,
): MicroResult {
  // Step 1: Record a trace of valid actions
  const traceLength = Math.min(1000, iterations);
  const trace: BenchAction[] = [];

  env.reset(seed);
  for (let i = 0; i < traceLength; i++) {
    const actions = env.getLegalActions();
    if (actions.length === 0 || env.isTerminal()) {
      env.reset(seed + 10000 + i);
      continue;
    }
    const sorted = sortActions(actions);
    const action = sorted[i % sorted.length]!;
    trace.push(action);
    env.applyAction(action);
  }

  if (trace.length === 0) {
    return {
      name: "applyAction() [isolated]",
      iterations: 0,
      durationMs: 0,
      extra: "no valid trace",
    };
  }

  // Step 2: Replay the trace many times, resetting periodically
  env.reset(seed + 50000);
  let applied = 0;
  let traceIdx = 0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    // Apply from trace
    const action = trace[traceIdx % trace.length]!;
    traceIdx++;

    try {
      env.applyAction(action);
      applied++;
    } catch {
      // If action invalid due to state drift, reset and continue
      env.reset(seed + 50000 + i);
      traceIdx = 0;
    }

    // Reset periodically to keep state valid
    if (i % trace.length === 0 && i > 0) {
      env.reset(seed + 50000 + i);
      traceIdx = 0;
    }
  }
  const end = performance.now();

  return {
    name: "applyAction() [isolated]",
    iterations: applied,
    durationMs: end - start,
  };
}

// =============================================================================
// REPORTING
// =============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatRate(count: number, ms: number): string {
  const perSec = (count / ms) * 1000;
  return formatNumber(Math.round(perSec));
}

function printResult(result: SimResult, label: string): void {
  const stepsPerSec = formatRate(result.steps, result.durationMs);
  const turnsPerSec = formatRate(result.turnDelta, result.durationMs);
  const endTurnPerSec = formatRate(
    result.actionCounts.END_TURN || 0,
    result.durationMs,
  );
  const avgActionsPerStep = (result.totalLegalActions / result.steps).toFixed(
    1,
  );
  const duration = (result.durationMs / 1000).toFixed(2);

  console.log(`\n[${label}]`);
  console.log(`  Steps: ${formatNumber(result.steps)} in ${duration}s`);
  console.log(`  Throughput: ${stepsPerSec} steps/sec`);
  console.log(
    `  Turns/sec: ${turnsPerSec} (from turn delta: ${result.turnDelta})`,
  );
  console.log(`  END_TURN applied/sec: ${endTurnPerSec}`);
  console.log(`  Avg legal actions/state: ${avgActionsPerStep}`);
  console.log(
    `  Avg game length: ${result.stepsPerTerminal.toFixed(1)} steps/terminal`,
  );
  console.log(
    `  Resets: manual=${result.resets.manual}, terminal=${result.resets.terminal}, error=${result.resets.error}`,
  );
}

function printTimeBreakdown(timing: TimeBreakdown): void {
  const total = timing.totalMs;
  const legalPct = ((timing.legalActionsMs / total) * 100).toFixed(1);
  const applyPct = ((timing.applyActionMs / total) * 100).toFixed(1);
  const resetPct = ((timing.resetCheckMs / total) * 100).toFixed(1);

  console.log(`\n[Time Breakdown]`);
  console.log(
    `  getLegalActions: ${timing.legalActionsMs.toFixed(1)}ms (${legalPct}%)`,
  );
  console.log(
    `  applyAction:     ${timing.applyActionMs.toFixed(1)}ms (${applyPct}%)`,
  );
  console.log(
    `  reset/terminal:  ${timing.resetCheckMs.toFixed(1)}ms (${resetPct}%)`,
  );
  console.log(`  total:           ${timing.totalMs.toFixed(1)}ms`);
}

function printActionDistribution(
  counts: Record<string, number>,
  total: number,
): void {
  console.log("\n[Action Distribution]");
  for (const [type, count] of Object.entries(counts)) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${type}: ${formatNumber(count)} (${pct}%)`);
  }
}

function printApplyBreakdown(env: BenchEnvModule): void {
  const summary = env.benchTiming.summary();

  console.log("\n[applyAction Breakdown - By Action Type]");
  console.log("  Type            | Count      | Total ms   | Avg µs/call");
  console.log("  ----------------|------------|------------|------------");
  for (const [type, data] of Object.entries(summary.byActionType)) {
    const countStr = formatNumber(data.count).padStart(10);
    const msStr = data.ms.toFixed(1).padStart(10);
    const avgStr = data.avgUs.toFixed(2).padStart(10);
    console.log(`  ${type.padEnd(15)} | ${countStr} | ${msStr} | ${avgStr}`);
  }
  console.log(`  Total applyAction: ${summary.totalApplyMs.toFixed(1)}ms`);

  console.log("\n[applyAction Breakdown - By Internal Stage]");
  console.log(
    "  Stage              | Count      | Total ms   | % of stages | Avg µs/call",
  );
  console.log(
    "  -------------------|------------|------------|-------------|------------",
  );
  for (const [stage, data] of Object.entries(summary.byStage)) {
    const countStr = formatNumber(data.count).padStart(10);
    const msStr = data.ms.toFixed(1).padStart(10);
    const pctStr = data.pct.toFixed(1).padStart(11);
    const avgStr = data.avgUs.toFixed(2).padStart(10);
    console.log(
      `  ${stage.padEnd(18)} | ${countStr} | ${msStr} | ${pctStr}% | ${avgStr}`,
    );
  }
}

function printMicro(result: MicroResult): void {
  const rate = formatRate(result.iterations, result.durationMs);
  const duration = (result.durationMs / 1000).toFixed(2);
  const extra = result.extra ? `, ${result.extra}` : "";
  console.log(
    `  ${result.name}: ${formatNumber(result.iterations)} calls in ${duration}s (${rate} calls/sec${extra})`,
  );
}

function getVersionInfo(): { version: string; commit: string } {
  let version = "unknown";
  let commit = "unknown";

  try {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    version = pkg.version || "unknown";
  } catch {
    // ignore
  }

  try {
    commit = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
    }).trim();
  } catch {
    commit = "n/a";
  }

  return { version, commit };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const config = parseArgs();
  const versionInfo = getVersionInfo();

  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║           SHADOWVERSE ENGINE BENCHMARK                        ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
  console.log(
    `Version: ${versionInfo.version} | Commit: ${versionInfo.commit}`,
  );
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Seed: ${config.seed}`);
  console.log(`Policy: ${config.policy}`);
  console.log(
    `Warmup: ${formatNumber(config.warmupSteps)} | Main: ${formatNumber(config.mainSteps)}`,
  );
  console.log(`Breakdown: ${config.breakdown ? "ENABLED" : "disabled"}`);
  console.log(
    `History: ${process.env.DISABLE_HISTORY === "1" ? "DISABLED (optimized)" : "ENABLED (slow)"}`,
  );
  console.log(
    `UID Enrichment: ${process.env.DISABLE_UID_ENRICH === "1" ? "DISABLED (optimized)" : "ENABLED"}`,
  );
  console.log("");

  // ---------------------------------------------------------------------------
  // LOAD BENCHMARK ENVIRONMENT
  // ---------------------------------------------------------------------------
  let env: BenchEnvModule;
  let loadedFrom: "SRC" | "DIST";

  if (config.useDist) {
    // Explicit dist request
    console.log("Loading benchmark environment from DIST (explicit)...");
    try {
      const distPath = resolve(__dirname, "..", "dist", "bench", "benchEnv.js");
      const distUrl = pathToFileURL(distPath).href;
      env = (await import(distUrl)) as BenchEnvModule;
      loadedFrom = "DIST";
      console.log("✓ Loaded from DIST\n");
    } catch (e) {
      console.error("✗ Failed to load from DIST:");
      console.error(e);
      process.exit(1);
    }
  } else {
    // Try SRC first, fallback to DIST
    console.log("Loading benchmark environment from SRC...");
    try {
      const srcPath = resolve(__dirname, "..", "src", "bench", "benchEnv.ts");
      const srcUrl = pathToFileURL(srcPath).href;
      env = (await import(srcUrl)) as BenchEnvModule;
      loadedFrom = "SRC";
      console.log("✓ Loaded from SRC\n");
    } catch (srcError) {
      console.log("⚠ SRC import failed:", (srcError as Error).message);
      console.log("  Falling back to DIST...");
      try {
        const distPath = resolve(
          __dirname,
          "..",
          "dist",
          "bench",
          "benchEnv.js",
        );
        const distUrl = pathToFileURL(distPath).href;
        env = (await import(distUrl)) as BenchEnvModule;
        loadedFrom = "DIST";
        console.log("✓ Loaded from DIST (fallback)\n");
      } catch (distError) {
        console.error("✗ Failed to load from both SRC and DIST:");
        console.error("SRC error:", srcError);
        console.error("DIST error:", distError);
        process.exit(1);
      }
    }
  }

  // Enable timing breakdown if requested
  if (config.breakdown) {
    env.benchTiming.enabled = true;
    env.benchTiming.reset();
  }

  // Runtime verification: confirm history is disabled
  try {
    const historyModule = await import(
      resolve(
        __dirname,
        "..",
        loadedFrom === "DIST" ? "dist/core/history.js" : "src/core/history.ts",
      )
    );
    const histEnabled = historyModule.isHistoryEnabled?.() ?? "unknown";
    console.log(`History runtime check: isHistoryEnabled()=${histEnabled}`);
    if (histEnabled === true) {
      console.warn(
        "⚠ WARNING: History snapshots are ENABLED - benchmark will be slow!",
      );
    }
  } catch (e) {
    console.log("History runtime check: could not verify (non-critical)");
  }
  console.log("");

  // ---------------------------------------------------------------------------
  // WARMUP PHASE (isolated, not counted)
  // ---------------------------------------------------------------------------
  console.log("Starting warmup phase...");
  env.reset(config.seed);
  const warmupResets: ResetCounts = { manual: 1, terminal: 0, error: 0 };

  const warmupStart = performance.now();
  let warmupSteps = 0;
  let warmupSeed = config.seed;

  while (warmupSteps < config.warmupSteps) {
    if (env.isTerminal()) {
      env.reset(warmupSeed++);
      warmupResets.terminal++;
      continue;
    }

    const actions = env.getLegalActions();
    if (actions.length === 0) {
      env.reset(warmupSeed++);
      warmupResets.error++;
      continue;
    }

    const action = selectAction(actions, warmupSteps, config.policy);
    try {
      env.applyAction(action);
      warmupSteps++;
    } catch {
      env.reset(warmupSeed++);
      warmupResets.error++;
    }
  }
  const warmupEnd = performance.now();
  const warmupMs = warmupEnd - warmupStart;
  const warmupRate = formatRate(warmupSteps, warmupMs);

  console.log(
    `Warmup: ${formatNumber(warmupSteps)} steps in ${(warmupMs / 1000).toFixed(2)}s (${warmupRate} steps/sec)`,
  );
  console.log(
    `Warmup resets: terminal=${warmupResets.terminal}, error=${warmupResets.error}`,
  );

  // Reset timing accumulators after warmup
  if (config.breakdown) {
    env.benchTiming.reset();
  }

  // ---------------------------------------------------------------------------
  // PROFILE RUN (if enabled)
  // ---------------------------------------------------------------------------
  if (config.profile) {
    console.log("\\n" + "─".repeat(60));
    console.log("PROFILE RUN");
    console.log("─".repeat(60));
    console.log(
      `Running for ${config.profileSeconds} seconds with CPU profiling...`,
    );
    console.log(`Node: ${process.version}`);
    console.log(`DISABLE_HISTORY: ${process.env.DISABLE_HISTORY}`);
    console.log("");

    // Ensure profiles directory exists
    const profilesDir = join(__dirname, "..", "profiles");
    if (!existsSync(profilesDir)) {
      mkdirSync(profilesDir, { recursive: true });
    }

    // Setup inspector session
    const session = new Session();
    session.connect();

    // Enable profiler
    await new Promise<void>((resolve, reject) => {
      session.post("Profiler.enable", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Reset and start measurement
    const profileSeed = config.seed + 200000;
    env.reset(profileSeed);
    let profileSteps = 0;
    let profileSeedCounter = profileSeed + 1;
    const profileResets = { terminal: 0, error: 0 };
    const targetDurationMs = config.profileSeconds * 1000;

    // Start profiling
    await new Promise<void>((resolve, reject) => {
      session.post("Profiler.start", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Run the hot loop for specified duration
    const profileStart = performance.now();
    while (performance.now() - profileStart < targetDurationMs) {
      if (env.isTerminal()) {
        profileResets.terminal++;
        env.reset(profileSeedCounter++);
        continue;
      }

      const actions = env.getLegalActions();
      if (actions.length === 0) {
        profileResets.error++;
        env.reset(profileSeedCounter++);
        continue;
      }

      const action = selectAction(actions, profileSteps, config.policy);
      try {
        env.applyAction(action);
        profileSteps++;
      } catch {
        profileResets.error++;
        env.reset(profileSeedCounter++);
      }
    }
    const profileEnd = performance.now();
    const profileMs = profileEnd - profileStart;

    // Stop profiling and get result
    const profileData = await new Promise<any>((resolve, reject) => {
      session.post("Profiler.stop", (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Disable profiler and disconnect
    await new Promise<void>((resolve, reject) => {
      session.post("Profiler.disable", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    session.disconnect();

    // Save profile
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const profilePath = join(
      profilesDir,
      `cpu-profile-${config.policy}-${timestamp}.cpuprofile`,
    );
    writeFileSync(profilePath, JSON.stringify(profileData.profile, null, 2));

    // Print summary
    const profileRate = formatRate(profileSteps, profileMs);
    console.log(`\\n[Profile Run Complete]`);
    console.log(
      `  Steps: ${formatNumber(profileSteps)} in ${(profileMs / 1000).toFixed(2)}s`,
    );
    console.log(`  Throughput: ${profileRate} steps/sec`);
    console.log(
      `  Resets: terminal=${profileResets.terminal}, error=${profileResets.error}`,
    );
    console.log(`  Profile saved: ${profilePath}`);
    console.log("");
    console.log("To process the profile:");
    console.log(`  node scripts/analyzeProfile.cjs ${profilePath}`);

    console.log("\\n" + "═".repeat(60));
    console.log("BENCHMARK COMPLETE (profile mode)");
    console.log("═".repeat(60));
    return; // Exit early in profile mode
  }

  // ---------------------------------------------------------------------------
  // MAIN MEASUREMENT (single continuous run)
  // ---------------------------------------------------------------------------
  console.log("\n" + "─".repeat(60));
  console.log("MAIN MEASUREMENT");
  console.log("─".repeat(60));

  // Manual reset to start fresh measurement
  const measureSeed = config.seed + 100000;
  env.reset(measureSeed);

  // Run the main loop
  const result = stepLoop(
    env,
    config.mainSteps,
    config.policy,
    measureSeed + 1,
  );
  result.resets.manual = 1; // Count the initial manual reset

  // Print results
  printResult(result, "Main Run");
  printActionDistribution(result.actionCounts, result.steps);
  printTimeBreakdown(result.timing);

  if (config.breakdown) {
    printApplyBreakdown(env);
  }

  // ---------------------------------------------------------------------------
  // MICROBENCHMARKS
  // ---------------------------------------------------------------------------
  console.log("\n" + "─".repeat(60));
  console.log("MICROBENCHMARKS");
  console.log("─".repeat(60));

  // Disable breakdown for micros to get clean timing
  const prevBreakdown = env.benchTiming.enabled;
  env.benchTiming.enabled = false;

  const microLegal = microGetLegalActions(
    env,
    config.seed + 5000,
    config.microIters,
  );
  printMicro(microLegal);

  const microApply = microApplyAction(
    env,
    config.seed + 6000,
    config.microIters,
  );
  printMicro(microApply);

  env.benchTiming.enabled = prevBreakdown;

  // ---------------------------------------------------------------------------
  // FINAL STATE
  // ---------------------------------------------------------------------------
  console.log("\n[Final State]");
  const stats = env.getStats();
  console.log(`  Turn: ${stats.turn}, Active: ${stats.activePlayer}`);
  console.log(`  First HP: ${stats.firstHP}, Second HP: ${stats.secondHP}`);
  console.log(
    `  First Board: ${stats.firstBoardSize}, Second Board: ${stats.secondBoardSize}`,
  );
  console.log(
    `  First Hand: ${stats.firstHandSize}, Second Hand: ${stats.secondHandSize}`,
  );

  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    BENCHMARK COMPLETE                         ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
